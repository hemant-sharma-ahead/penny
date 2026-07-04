import { useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { useToast } from '@/context/ToastContext';
import { useGroupContext } from '@/context/GroupContext';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { accountsRepo, expensesRepo, ledgerEntriesRepo } from '@/core/db/repositories';
import { logActivity, restoreActivity } from '@/core/db/activityLog';
import type { Account, Expense, LedgerEntry, Person } from '@/core/db/types';
import { reconcileLinkedTxn } from '@/core/iou/expenseLink';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui';
import { useRepository } from '@/hooks/useRepository';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { useIou } from './useIou';
import { PersonListView } from './PersonListView';
import { PersonLedgerView } from './PersonLedgerView';
import { EntryForm, type EntryTxnOption } from './EntryForm';
import { PersonForm } from './PersonForm';
import { SettleUpModal, type SettleResult } from './SettleUpModal';

interface EntryFormState {
  presetPerson?: Person;
  editing?: LedgerEntry;
}

/** Full interactive IOU experience (list → ledger → add/edit/settle). Shared by IouPage + IouSlice. */
export function IouView() {
  const { mode } = usePrivacy();
  const { groups, claimed } = useGroupContext();
  // Clarify the separation only when Groups are actually in use (screen 7).
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
    saveEntry,
    settle,
    reloadEntries,
    nowMs
  } = useIou();
  const { items: accounts } = useRepository<Account>(accountsRepo);
  const { items: expenses } = useRepository<Expense>(expensesRepo);

  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<EntryFormState | null>(null);
  const [settlePerson, setSettlePerson] = useState<Person | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

  const openPerson = openPersonId ? (persons.find((p) => p.id === openPersonId) ?? null) : null;

  // Reconcile the account transaction (Expense for money out / Income for money in) that records an
  // IOU money movement: create / update in place / delete to match `intent`. Penny is the ledger of
  // record here. Returns the linked txn id (or undefined once unlinked). Pure decision in
  // `reconcileLinkedTxn`; this only persists + logs the result.
  async function syncLinkedTxn(
    existing: Expense | null,
    intent: { record: boolean; accountId: string; amount: number; date: number; moneyIn: boolean; description: string }
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
        description: moneyIn ? `Settlement from ${person.name}` : `Settled with ${person.name}`
      });
    }
    await settle(person.id, result.amount, result.direction, {
      ...(result.note ? { note: result.note } : {}),
      ...(linkedTxnId ? { linkedTxnId } : {})
    });
    setSettlePerson(null);
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto pb-24 flex flex-col">
        {showGroupNote && (
          <p className="px-4 py-2.5 text-[11px] text-tertiary border-b border-theme flex items-start gap-1.5">
            <i className="ti ti-info-circle mt-0.5 flex-shrink-0" aria-hidden="true" />
            Your <b className="font-semibold text-secondary">personal</b> IOUs. Group balances live in each group — kept
            separate on purpose.
          </p>
        )}
        {(totalOwedToYou > 0 || totalYouOwe > 0) && (
          <div className="flex gap-4 px-4 py-3 border-b border-theme">
            {totalOwedToYou > 0 && (
              <span className="text-xs font-medium text-success">
                Owed to you: {mode === 'open' ? formatCurrency(totalOwedToYou) : '••••'}
              </span>
            )}
            {totalYouOwe > 0 && (
              <span className="text-xs font-medium text-danger">
                You owe: {mode === 'open' ? formatCurrency(totalYouOwe) : '••••'}
              </span>
            )}
          </div>
        )}

        <PersonListView persons={personsWithBalance} overdueCount={overdueCount} mode={mode} onOpen={setOpenPersonId} />
      </div>

      <Button
        variant="primary"
        icon="ti-plus"
        aria-label="Add IOU"
        className="fixed w-14 h-14 rounded-full shadow-lg z-10"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', right: '1rem' }}
        onClick={() => setEntryForm({})}
      />

      {openPerson && (
        <PersonLedgerView
          person={openPerson}
          entries={entriesFor(openPerson.id)}
          net={netFor(openPerson.id)}
          mode={mode}
          nowMs={nowMs}
          onAddEntry={() => setEntryForm({ presetPerson: openPerson })}
          onSettle={() => setSettlePerson(openPerson)}
          onEditPerson={() => setEditingPerson(openPerson)}
          onEditEntry={(entry) => setEntryForm({ editing: entry })}
          onDeleteEntry={(id) => void deleteEntryAndTxn(id)}
          onClose={() => setOpenPersonId(null)}
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
          onDelete={async (id) => {
            await removePerson(id);
            setEditingPerson(null);
            setOpenPersonId(null);
          }}
          onClose={() => setEditingPerson(null)}
        />
      )}
    </>
  );
}
