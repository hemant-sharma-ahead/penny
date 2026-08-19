import { useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { useToast } from '~/context/ToastContext';
import { useGroupContext } from '~/context/GroupContext';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { accountsRepo, expensesRepo, ledgerEntriesRepo, personsRepo } from '@/core/db/repositories';
import { logActivity, restoreActivity } from '@/core/db/activityLog';
import type { Account, Expense, LedgerEntry, Person } from '@/core/db/types';
import { reconcileLinkedTxn } from '@/core/iou/expenseLink';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useRepository } from '@/hooks/useRepository';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';
import { useIou } from './useIou';
import { PersonListView } from './PersonListView';
import { PersonLedgerView } from './PersonLedgerView';
import { EntryForm, type EntryTxnOption } from './EntryForm';
import { PersonForm } from './PersonForm';
import { RemovePersonDialog } from './RemovePersonDialog';
import { SettleUpModal, type SettleResult } from './SettleUpModal';
import { PromoteToGroupWizard } from './PromoteToGroupWizard';

interface EntryFormState {
  presetPerson?: Person;
  editing?: LedgerEntry;
}

/**
 * Full interactive IOU experience (list → ledger → add/edit/settle).
 *
 * Restored once Groups landed on mobile: web's `IouView` reads `GroupContext` only to show one
 * informational banner ("Your personal IOUs. Group balances live in each group.") when the user has a
 * claimed username and belongs to at least one group — this was dropped as "personal-only IOU" during
 * Track 4 (before `GroupContext` was ported), matching the same precedent Home/Portfolio's droppable
 * Groups dependency used. `useIou`'s data model was already personal-ledger-only regardless — nothing
 * about the actual ledger logic changes, this only restores the banner.
 */
export function IouView() {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.iou);
  const { groups, claimed, setContext } = useGroupContext();
  const showGroupNote = hasEntitlement('sync') && claimed && groups.length > 0;
  const { showToast } = useToast();
  const {
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
    restorePerson,
    saveEntry,
    settle,
    reloadEntries,
    reloadPersons,
    nowMs
  } = useIou();
  const { items: accounts } = useRepository<Account>(accountsRepo);
  const { items: expenses } = useRepository<Expense>(expensesRepo);
  // Current balance per account — powers the cash-negative guard in `EntryForm`/`SettleUpModal`
  // (item 17, Track E), same pattern as `useExpenses.ts`'s own `accountBalances`.
  const accountBalances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of accounts) map[a.id] = computeBalance(a.id, a.openingBalance, expenses);
    return map;
  }, [accounts, expenses]);
  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([reloadEntries(), reloadPersons()]);
  });

  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<EntryFormState | null>(null);
  const [settlePerson, setSettlePerson] = useState<Person | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Item 8 (docs/plans/real-device-testing-pass.md Phase 2) — the ONE consolidated delete/archive
  // warning popup both `PersonForm.tsx`'s "Remove" and the Archived section's trash icon route through.
  // Only ever set for a person with real ledger history (zero-history stays today's direct hard-delete,
  // decided by each entry point below before setting this).
  const [removingPerson, setRemovingPerson] = useState<Person | null>(null);
  // Item 17 (Phase 3) — personal ledger → Group promotion wizard.
  const [promotingPerson, setPromotingPerson] = useState<Person | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();

  const openPerson = openPersonId ? (persons.find((p) => p.id === openPersonId) ?? null) : null;

  // Reconcile the account transaction (Expense for money out / Income for money in) that records an
  // IOU money movement: create / update in place / delete to match `intent`. Penny is the ledger of
  // record here. Returns the linked txn id (or undefined once unlinked). Pure decision in
  // `reconcileLinkedTxn`; this only persists + logs the result.
  async function syncLinkedTxn(
    existing: Expense | null,
    intent: {
      record: boolean;
      accountId: string;
      amount: number;
      date: number;
      moneyIn: boolean;
      description: string;
      defaultCategoryId?: string;
    }
  ): Promise<string | undefined> {
    const { put, deleteId } = reconcileLinkedTxn(existing, intent, Date.now());
    if (put) {
      await expensesRepo.put(put);
      logActivity({
        action: existing ? 'UPDATE' : 'CREATE',
        entityType: 'expense',
        entityId: put.id,
        summary: `${existing ? 'Updated' : 'Added'} ${put.type}: ${put.description}`
      });
    }
    if (deleteId) await expensesRepo.delete(deleteId);
    // Balance/forecast/list views live in separate hook instances — tell them to reload.
    if (put || deleteId) notifyTxnChanged();
    return put?.id;
  }

  async function handleSaveEntry(entry: LedgerEntry, txn?: EntryTxnOption) {
    // Sync the linked account transaction for both new entries and edits (re-syncs amount / date /
    // account / direction; toggling the link off deletes the transaction).
    if (txn) {
      const existing = entry.linkedTxnId ? (expenses.find((e) => e.id === entry.linkedTxnId) ?? null) : null;
      const desc =
        entry.description?.trim() ||
        (entry.kind === 'lent' ? `Lent to ${txn.personName}` : `Borrowed from ${txn.personName}`);
      const linkedTxnId = await syncLinkedTxn(existing, {
        record: txn.record,
        accountId: txn.accountId,
        amount: entry.amount,
        date: entry.date,
        moneyIn: entry.kind === 'borrowed',
        description: desc
      });
      if (linkedTxnId) entry.linkedTxnId = linkedTxnId;
      else delete entry.linkedTxnId;
    }
    await saveEntry(entry);
    setEntryForm(null);
  }

  // Delete a ledger entry and cascade-delete its linked account transaction, if any — with a single
  // Undo that restores both atomically (the linked txn rides along as a cascade record).
  async function deleteEntryAndTxn(entryId: string) {
    const entry = ledgerEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const linkedTxn = entry.linkedTxnId ? (expenses.find((e) => e.id === entry.linkedTxnId) ?? null) : null;
    await ledgerEntriesRepo.delete(entryId);
    reloadEntries();
    if (linkedTxn) {
      await expensesRepo.delete(linkedTxn.id);
      notifyTxnChanged();
    }
    const label = entry.kind === 'settlement' ? `settlement ₹${entry.amount}` : `${entry.kind} ₹${entry.amount}`;
    const logId = logActivity({
      action: 'DELETE',
      entityType: 'ledgerEntry',
      entityId: entryId,
      summary: `Deleted ${label}`,
      snapshot: JSON.stringify(entry),
      ...(linkedTxn ? { cascade: JSON.stringify([{ entityType: 'expense', record: linkedTxn }]) } : {})
    });
    showToast({
      message: `Deleted ${label}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restoreActivity(logId);
        reloadEntries();
        if (linkedTxn) notifyTxnChanged();
      }
    });
  }

  async function handleSettle(person: Person, result: SettleResult) {
    let linkedTxnId: string | undefined;
    if (result.txnAccountId) {
      const moneyIn = result.direction === 'they_paid_you';
      linkedTxnId = await syncLinkedTxn(null, {
        record: true,
        accountId: result.txnAccountId,
        amount: result.amount,
        date: Date.now(),
        moneyIn,
        description: moneyIn ? `Settlement from ${person.name}` : `Settled with ${person.name}`,
        // A settlement is exactly what these two categories exist for (2026-08-06) — otherwise it'd
        // land on the generic Other/Other Income fallback like any uncategorized transaction.
        defaultCategoryId: moneyIn ? 'cat-collected-money' : 'cat-return-borrowed'
      });
    }
    await settle(person.id, result.amount, result.direction, {
      ...(result.note ? { note: result.note } : {}),
      ...(linkedTxnId ? { linkedTxnId } : {})
    });
    setSettlePerson(null);
  }

  // ── Archived persons (soft-archived on delete; kept for ledger integrity) ────────────
  const archivedPersons = persons.filter((p) => p.isArchived);

  // Permanently delete a person: drop only their ledger entries, then the person — with one Undo that
  // restores both atomically (cascade), mirroring deleteEntryAndTxn. Item 8 bug fix
  // (docs/plans/real-device-testing-pass.md Phase 2): this used to also cascade-delete any linked
  // `Expense` row, directly violating "a recorded transaction is never removed" — the IOU link only
  // ever lived on the `LedgerEntry` side (`linkedTxnId`), so deleting the ledger entry alone already
  // fully unlinks the transaction; the Expense itself needs no change and must survive, keeping its
  // category. Reachable from both `PersonForm.tsx`'s "Remove" and the Archived section's trash icon, via
  // `RemovePersonDialog`.
  async function purgePerson(person: Person) {
    const entries = ledgerEntries.filter((e) => e.personId === person.id);
    const hadLinkedTxn = entries.some((e) => !!e.linkedTxnId);
    await Promise.all(entries.map((e) => ledgerEntriesRepo.delete(e.id)));
    await personsRepo.delete(person.id);
    reloadEntries();
    reloadPersons();
    // The Transactions tab's "linked to <person>'s IOU ledger" badge/edit-form state is derived off
    // `ledgerEntries` in a separate `useExpenses.ts` hook instance — it only needs telling when a
    // deleted entry actually carried a `linkedTxnId` (nothing to refresh there otherwise).
    if (hadLinkedTxn) notifyTxnChanged();
    const logId = logActivity({
      action: 'DELETE',
      entityType: 'person',
      entityId: person.id,
      summary: `Deleted ${person.name}`,
      snapshot: JSON.stringify(person),
      cascade: JSON.stringify(entries.map((e) => ({ entityType: 'ledgerEntry', record: e })))
    });
    showToast({
      message: `Deleted ${person.name}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restoreActivity(logId);
        reloadEntries();
        reloadPersons();
        if (hadLinkedTxn) notifyTxnChanged();
      }
    });
  }

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {showGroupNote && (
          <View className="flex-row items-start gap-1.5 px-4 py-2.5 border-b border-theme">
            <View className="mt-0.5">
              <Icon name="ti-info-circle" size={13} color={theme.textTertiary} />
            </View>
            <Text className="flex-1 text-[11px] text-tertiary">
              Your <Text className="font-semibold text-secondary">personal</Text> IOUs. Group balances live in each
              group — kept separate on purpose.
            </Text>
          </View>
        )}
        {(totalOwedToYou > 0 || totalYouOwe > 0) && (
          <View className="flex-row gap-4 px-4 py-3 border-b border-theme">
            {totalOwedToYou > 0 && (
              <Text className="text-xs font-medium" style={{ color: theme.success }}>
                Owed to you: {masked ? '••••' : formatCurrency(totalOwedToYou)}
              </Text>
            )}
            {totalYouOwe > 0 && (
              <Text className="text-xs font-medium" style={{ color: theme.danger }}>
                You owe: {masked ? '••••' : formatCurrency(totalYouOwe)}
              </Text>
            )}
          </View>
        )}

        <PersonListView
          persons={personsWithBalance}
          overdueCount={overdueCount}
          masked={masked}
          onOpen={setOpenPersonId}
        />

        {archivedPersons.length > 0 && (
          <View className="mt-2 border-t border-theme">
            <Pressable
              onPress={() => setShowArchived((v) => !v)}
              className="flex-row items-center justify-between px-4 py-3"
            >
              <Text className="text-xs font-semibold text-tertiary">Archived ({archivedPersons.length})</Text>
              <Icon name={showArchived ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
            </Pressable>
            {showArchived && (
              <View>
                {archivedPersons.map((p) => {
                  const net = netFor(p.id);
                  return (
                    <View key={p.id} className="flex-row items-center gap-2 px-4 py-2.5 border-t border-theme">
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                          {p.name}
                        </Text>
                        {Math.abs(net) >= 1 && (
                          <Text className="text-[11px]" style={{ color: net > 0 ? theme.success : theme.danger }}>
                            {masked
                              ? '••••'
                              : net > 0
                                ? `owes you ${formatCurrency(net)}`
                                : `you owe ${formatCurrency(-net)}`}
                          </Text>
                        )}
                      </View>
                      {p.promotedToGroupId ? (
                        // Promoted (item 17) — Restore/Trash no longer make sense; link into the new
                        // Group instead of a destructive action.
                        <Pressable
                          onPress={() => {
                            if (!p.promotedToGroupId) return;
                            setContext(p.promotedToGroupId);
                            navigation.navigate('MainTabs', { screen: 'Home' });
                          }}
                          className="rounded-lg border px-2.5 py-1.5"
                          style={{ borderColor: theme.primary }}
                        >
                          <Text className="text-[11px] font-semibold" style={{ color: theme.primary }}>
                            → Now in "{groups.find((g) => g.id === p.promotedToGroupId)?.name ?? 'group'}"
                          </Text>
                        </Pressable>
                      ) : (
                        <>
                          <Button variant="ghost" onPress={() => void restorePerson(p.id)}>
                            <Text className="text-xs font-bold" style={{ color: theme.primary }}>
                              Restore
                            </Text>
                          </Button>
                          <Button
                            variant="ghost"
                            icon="ti-trash"
                            accessibilityLabel={`Delete ${p.name} permanently`}
                            className="w-8 h-8"
                            onPress={() => {
                              // Item 8 — zero-history stays today's direct hard-delete (no popup); real
                              // history routes through the one consolidated `RemovePersonDialog`, which
                              // also catches the balance-check gap `purgePerson` used to have entirely.
                              if (entriesFor(p.id).length === 0) void purgePerson(p);
                              else setRemovingPerson(p);
                            }}
                          />
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View className="absolute right-4" style={{ bottom: insets.bottom + 16 }}>
        <Button
          variant="primary"
          icon="ti-plus"
          accessibilityLabel="Add IOU"
          className="w-14 h-14 rounded-full shadow-lg"
          onPress={() => setEntryForm({})}
        />
      </View>

      {openPerson && (
        <PersonLedgerView
          person={openPerson}
          entries={entriesFor(openPerson.id)}
          net={netFor(openPerson.id)}
          masked={masked}
          nowMs={nowMs}
          onAddEntry={() => setEntryForm({ presetPerson: openPerson })}
          onSettle={() => setSettlePerson(openPerson)}
          onEditPerson={() => setEditingPerson(openPerson)}
          // Gated the same way as the informational Groups banner above — Groups needs a claimed
          // account with a username (item 17).
          onPromote={
            hasEntitlement('sync') && claimed
              ? () => {
                  setOpenPersonId(null);
                  setPromotingPerson(openPerson);
                }
              : undefined
          }
          onEditEntry={(entry) => setEntryForm({ editing: entry })}
          onDeleteEntry={(id) => void deleteEntryAndTxn(id)}
          onClose={() => setOpenPersonId(null)}
        />
      )}

      {promotingPerson && (
        <PromoteToGroupWizard
          person={promotingPerson}
          entries={entriesFor(promotingPerson.id)}
          net={netFor(promotingPerson.id)}
          onClose={() => setPromotingPerson(null)}
          onPromoted={async ({ groupId }) => {
            await savePerson({
              ...promotingPerson,
              isArchived: true,
              promotedToGroupId: groupId,
              updatedAt: Date.now()
            });
            setPromotingPerson(null);
          }}
        />
      )}

      {entryForm && (
        <EntryForm
          persons={persons}
          accounts={accounts}
          getOrCreatePerson={getOrCreatePerson}
          presetPerson={entryForm.presetPerson}
          editing={entryForm.editing ?? null}
          linkedTxn={expenses.find((e) => e.id === entryForm.editing?.linkedTxnId) ?? null}
          accountBalances={accountBalances}
          onSave={handleSaveEntry}
          onDelete={async (id) => {
            await deleteEntryAndTxn(id);
            setEntryForm(null);
          }}
          onClose={() => setEntryForm(null)}
          nowMs={nowMs}
        />
      )}

      {settlePerson && (
        <SettleUpModal
          person={settlePerson}
          net={netFor(settlePerson.id)}
          accounts={accounts}
          accountBalances={accountBalances}
          onSettle={(result) => handleSettle(settlePerson, result)}
          onClose={() => setSettlePerson(null)}
        />
      )}

      {editingPerson && (
        <PersonForm
          editing={editingPerson}
          onSave={async (person) => {
            await savePerson(person);
            setEditingPerson(null);
          }}
          onDelete={(id) => {
            // Item 8 — zero-history stays today's direct hard-delete (no popup, matches
            // `removePerson`'s own existing behavior for that branch); real history routes through the
            // one consolidated `RemovePersonDialog` instead of silently auto-archiving.
            const person = persons.find((p) => p.id === id) ?? editingPerson;
            setEditingPerson(null);
            if (!person) return Promise.resolve();
            if (entriesFor(person.id).length === 0) return removePerson(person.id);
            setRemovingPerson(person);
            return Promise.resolve();
          }}
          onClose={() => setEditingPerson(null)}
        />
      )}

      {removingPerson && (
        <RemovePersonDialog
          person={removingPerson}
          net={netFor(removingPerson.id)}
          onArchive={
            removingPerson.isArchived
              ? undefined
              : async () => {
                  await removePerson(removingPerson.id); // has entries ⇒ archives, per `removePerson`'s own logic
                  setRemovingPerson(null);
                  setOpenPersonId(null);
                }
          }
          onDeletePermanently={async () => {
            await purgePerson(removingPerson);
            setRemovingPerson(null);
            setOpenPersonId(null);
          }}
          onSettleUp={() => {
            setRemovingPerson(null);
            setSettlePerson(removingPerson);
          }}
          onClose={() => setRemovingPerson(null)}
        />
      )}
    </>
  );
}
