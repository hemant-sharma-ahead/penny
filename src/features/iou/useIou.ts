import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ledgerEntriesRepo, personalIousRepo, personsRepo } from '@/core/db/repositories';
import type { LedgerEntry, Person, SettleDirection } from '@/core/db/types';
import { useLoggedRepository } from '@/hooks/useLoggedRepository';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';
import {
  balanceByPerson,
  isSettled,
  overdueEntries,
  totalOwedToYou as sumOwedToYou,
  totalYouOwe as sumYouOwe
} from '@/core/iou/ledger';
import { migrateLegacyIous } from '@/core/iou/migration';

const summarizePerson = (p: Person) => `person: ${p.name}`;
const summarizeEntry = (e: LedgerEntry) =>
  e.kind === 'settlement' ? `settlement ₹${e.amount}` : `${e.kind} ₹${e.amount}`;

export interface PersonWithBalance {
  person: Person;
  /** Net balance: positive ⇒ they owe you; negative ⇒ you owe them. */
  net: number;
  settled: boolean;
  overdue: boolean;
  lastActivity: number;
  entryCount: number;
}

export function useIou() {
  const [nowMs] = useState(() => Date.now());

  const {
    items: persons,
    save: savePerson,
    remove: removePersonRepo,
    reload: reloadPersons
  } = useLoggedRepository(personsRepo, {
    entityType: 'person',
    summarize: summarizePerson,
    diffFields: ['name', 'phone', 'isArchived']
  });

  const {
    items: ledgerEntries,
    save: saveEntry,
    remove: removeEntry,
    reload: reloadEntries
  } = useLoggedRepository(ledgerEntriesRepo, {
    entityType: 'ledgerEntry',
    summarize: summarizeEntry,
    diffFields: ['amount', 'dueDate', 'settleDirection']
  });

  // The expenses module writes/deletes ledger entries (expense-seeded IOUs, combined undo) through
  // separate repo instances; reload on its signal so this view stays live.
  const refreshIou = useCallback(() => {
    reloadEntries();
    reloadPersons();
  }, [reloadEntries, reloadPersons]);
  useTxnRefresh(refreshIou);

  // One-time migration of legacy `personal_ious` → persons + ledger entries. Encrypted stores can't
  // be migrated in a Dexie .upgrade() (runs pre-unlock), so this is a post-unlock, flagged backfill.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    if (localStorage.getItem('penny_iou_v2')) return;
    (async () => {
      const legacy = await personalIousRepo.getAll();
      if (legacy.length > 0) {
        const { persons: newPersons, entries } = migrateLegacyIous(legacy, Date.now());
        await Promise.all(newPersons.map((p) => personsRepo.put(p)));
        await Promise.all(entries.map((e) => ledgerEntriesRepo.put(e)));
        reloadPersons();
        reloadEntries();
      }
      localStorage.setItem('penny_iou_v2', '1');
    })().catch(() => {
      migratedRef.current = false; // allow a retry on transient failure
    });
  }, [reloadPersons, reloadEntries]);

  const entriesByPerson = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of ledgerEntries) {
      const arr = map.get(e.personId);
      if (arr) arr.push(e);
      else map.set(e.personId, [e]);
    }
    return map;
  }, [ledgerEntries]);

  const balances = useMemo(() => balanceByPerson(ledgerEntries), [ledgerEntries]);

  const personsWithBalance = useMemo<PersonWithBalance[]>(
    () =>
      persons
        .filter((p) => !p.isArchived)
        .map((person) => {
          const entries = entriesByPerson.get(person.id) ?? [];
          const net = balances.get(person.id) ?? 0;
          const settled = isSettled(net);
          const overdue = !settled && overdueEntries(entries, nowMs).length > 0;
          const lastActivity = entries.reduce((m, e) => Math.max(m, e.date), person.updatedAt);
          return { person, net, settled, overdue, lastActivity, entryCount: entries.length };
        })
        // Owed-to-you first (by amount desc), then you-owe (most negative first), settled last.
        .sort((a, b) => {
          if (a.settled !== b.settled) return a.settled ? 1 : -1;
          return b.net - a.net;
        }),
    [persons, entriesByPerson, balances, nowMs]
  );

  const totalOwedToYou = useMemo(() => sumOwedToYou(balances), [balances]);
  const totalYouOwe = useMemo(() => sumYouOwe(balances), [balances]);
  const overdueCount = useMemo(() => personsWithBalance.filter((p) => p.overdue).length, [personsWithBalance]);

  const entriesFor = useCallback(
    (personId: string) =>
      [...(entriesByPerson.get(personId) ?? [])].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt),
    [entriesByPerson]
  );

  const netFor = useCallback((personId: string) => balances.get(personId) ?? 0, [balances]);

  /** Find an existing (case-insensitive) person or create one. Revives a soft-archived match. */
  const getOrCreatePerson = useCallback(
    async (name: string): Promise<Person> => {
      const trimmed = name.trim();
      const existing = persons.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        if (existing.isArchived) {
          const revived: Person = { ...existing, isArchived: false, updatedAt: Date.now() };
          await savePerson(revived);
          return revived;
        }
        return existing;
      }
      const person: Person = { id: crypto.randomUUID(), name: trimmed, createdAt: Date.now(), updatedAt: Date.now() };
      await savePerson(person);
      return person;
    },
    [persons, savePerson]
  );

  /** Record a (partial or full) settlement against a person. */
  const settle = useCallback(
    async (
      personId: string,
      amount: number,
      settleDirection: SettleDirection,
      opts?: { date?: number; note?: string; linkedTxnId?: string }
    ): Promise<LedgerEntry> => {
      const now = Date.now();
      const entry: LedgerEntry = {
        id: crypto.randomUUID(),
        personId,
        kind: 'settlement',
        amount,
        date: opts?.date ?? now,
        settleDirection,
        origin: 'manual',
        createdAt: now,
        updatedAt: now
      };
      if (opts?.note) entry.notes = opts.note;
      if (opts?.linkedTxnId) entry.linkedTxnId = opts.linkedTxnId;
      await saveEntry(entry);
      return entry;
    },
    [saveEntry]
  );

  /** Delete a person if they have no entries; otherwise soft-archive to preserve ledger integrity. */
  const removePerson = useCallback(
    async (personId: string) => {
      const entries = entriesByPerson.get(personId) ?? [];
      if (entries.length > 0) {
        const person = persons.find((p) => p.id === personId);
        if (person) await savePerson({ ...person, isArchived: true, updatedAt: Date.now() });
      } else {
        await removePersonRepo(personId);
      }
    },
    [entriesByPerson, persons, savePerson, removePersonRepo]
  );

  return {
    persons,
    ledgerEntries,
    personsWithBalance,
    totalOwedToYou,
    totalYouOwe,
    overdueCount,
    entriesFor,
    netFor,
    getOrCreatePerson,
    savePerson,
    removePerson,
    addEntry: saveEntry,
    saveEntry,
    removeEntry,
    settle,
    reloadEntries,
    reloadPersons,
    nowMs
  };
}
