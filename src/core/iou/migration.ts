// Pure migration of legacy flat PersonalIou records → person-centric persons + ledger entries.
// Runs as a post-unlock backfill (see useIou.ts, flag `penny_iou_v2`). Kept pure for testing.
import type { LedgerEntry, Person, PersonalIou, SettleDirection } from '@/core/db/types';

const NAME_SEPARATORS = /[—–\-:,|]/;
export const UNMATCHED_PERSON_NAME = 'Unmatched';

/**
 * Heuristic: pull a person name from a legacy free-text IOU description ("Rohan — dinner split").
 * The leading token before a separator is treated as a name when it's short, 1–3 words, and has no
 * digits/currency; otherwise the record lands in the "Unmatched" bucket for the user to re-assign.
 * The full original description is always preserved on the migrated entry, so nothing is lost.
 */
export function parsePersonName(description: string): string {
  const head = description.split(NAME_SEPARATORS)[0]?.trim() ?? '';
  const words = head.split(/\s+/).filter(Boolean);
  const looksLikeName = head.length > 0 && head.length <= 24 && words.length <= 3 && !/[\d₹]/.test(head);
  return looksLikeName ? head : UNMATCHED_PERSON_NAME;
}

export interface MigrationResult {
  persons: Person[];
  entries: LedgerEntry[];
}

/**
 * Build new persons + ledger entries from legacy IOUs. Persons are deduped by case-insensitive
 * name. A settled legacy IOU produces its original lent/borrowed entry PLUS a matching settlement
 * entry (dated `settledAt`) so the derived net reproduces the old "settled" state (≈ 0).
 */
export function migrateLegacyIous(legacy: PersonalIou[], nowMs: number): MigrationResult {
  const personByName = new Map<string, Person>();
  const persons: Person[] = [];
  const entries: LedgerEntry[] = [];

  const getPerson = (name: string): Person => {
    const key = name.toLowerCase();
    let p = personByName.get(key);
    if (!p) {
      p = { id: crypto.randomUUID(), name, createdAt: nowMs, updatedAt: nowMs };
      personByName.set(key, p);
      persons.push(p);
    }
    return p;
  };

  for (const iou of legacy) {
    const person = getPerson(parsePersonName(iou.description));
    const entry: LedgerEntry = {
      id: crypto.randomUUID(),
      personId: person.id,
      kind: iou.direction,
      amount: iou.amount,
      date: iou.date,
      origin: 'migration',
      description: iou.description,
      createdAt: iou.createdAt,
      updatedAt: nowMs
    };
    if (iou.dueDate !== undefined) entry.dueDate = iou.dueDate;
    if (iou.notes) entry.notes = iou.notes;
    entries.push(entry);

    if (iou.isSettled) {
      const settleDirection: SettleDirection = iou.direction === 'lent' ? 'they_paid_you' : 'you_paid_them';
      const when = iou.settledAt ?? iou.updatedAt;
      entries.push({
        id: crypto.randomUUID(),
        personId: person.id,
        kind: 'settlement',
        amount: iou.amount,
        date: when,
        settleDirection,
        origin: 'migration',
        description: 'Settled (migrated)',
        createdAt: when,
        updatedAt: nowMs
      });
    }
  }

  return { persons, entries };
}
