import { useCallback, useMemo } from 'react';
import {
  accountsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  goalContributionsRepo,
  goalsRepo,
  hashtagsRepo
} from '@/core/db/repositories';
import type { Account, Expense, ExpenseCategory, Goal, GoalContribution, Hashtag } from '@/core/db/types';
import { reconcileGoalLink, reconcileLinkedGoalTxn, type LinkedGoalTxnIntent } from '@/core/goals/goalLink';
import { effectiveSaved as coreEffectiveSaved } from '@/core/goals/progress';
import { useLoggedRepository } from '~/hooks/useLoggedRepository';
import { useRepository } from '@/hooks/useRepository';
import { useTxnRefresh, notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { useAccountsRefresh, useTagsRefresh, useGoalsRefresh, notifyAccountsChanged } from '@/hooks/useDataRefresh';
import type { AccountInput } from '~/hooks/useAccountForm';
import { logActivity } from '@/core/db/activityLog';

const summarizeGoal = (g: Goal) => `goal: ${g.name}`;
const summarizeContribution = (c: GoalContribution) => `contribution: ₹${c.amount}`;

/** What a saved/edited contribution should do about its linked transaction — mirrors IOU's
 *  `EntryTxnOption` (`features/iou/EntryForm.tsx`). `destinationAccountId` set ⇒ records a Transfer;
 *  omitted ⇒ records a plain Expense out of `sourceAccountId` (see `reconcileLinkedGoalTxn`). */
export interface ContributionTxnOption {
  record: boolean;
  sourceAccountId: string;
  destinationAccountId?: string;
}

export function useGoals() {
  const {
    items: goals,
    save: saveGoal,
    remove: removeGoalRepo,
    reload: reloadGoals
  } = useLoggedRepository(goalsRepo, {
    entityType: 'goal',
    summarize: summarizeGoal,
    diffFields: ['name', 'targetAmount', 'currentAmount']
  });

  const {
    items: contributions,
    save: saveContributionRepo,
    remove: removeContributionRepo,
    reload: reloadContributions
  } = useLoggedRepository(goalContributionsRepo, {
    entityType: 'goalContribution',
    summarize: summarizeContribution,
    diffFields: ['amount', 'date']
  });

  const { items: accounts, reload: reloadAccounts } = useRepository<Account>(accountsRepo);
  const {
    items: expenses,
    save: saveExpenseRecord,
    remove: removeExpenseRecord,
    reload: reloadExpenses
  } = useRepository<Expense>(expensesRepo);
  // Read-only — just enough to render the (locked, in `goalPreset` mode) category tile's icon/color/name
  // in `ExpenseForm`'s "Add contribution" flow. The default-category seed/migration effects live in
  // `useExpenses.ts` only; this is a second, independent read of the same repo, not a duplicate seed.
  const { items: categories } = useRepository<ExpenseCategory>(expenseCategoriesRepo);
  const { items: hashtags, save: saveHashtagRepo, reload: reloadHashtags } = useRepository<Hashtag>(hashtagsRepo);

  // The Expenses screen writes contributions/expenses through separate repo instances (a goal linked
  // from the expense form); reload on its signal so this view stays live. Mirrors `useIou`'s `refreshIou`.
  const refreshGoalData = useCallback(() => {
    reloadGoals();
    reloadContributions();
    reloadAccounts();
    reloadExpenses();
  }, [reloadGoals, reloadContributions, reloadAccounts, reloadExpenses]);
  useTxnRefresh(refreshGoalData);
  // Accounts/tags can change without a txn changing (e.g. Settings → Safe Mode, Manage Tags) — same gap
  // `useExpenses.ts` closed for itself on 2026-08-01.
  useAccountsRefresh(reloadAccounts);
  useTagsRefresh(reloadHashtags);
  // A goal can also be created from outside this hook entirely — `SuggestedGoals.tsx`'s "Add" and
  // `FinancialHealthCard.tsx`'s "Set as goal" quick-win both call `createGoalFromTemplate()` directly
  // (packages/core, no repo instance shared with this hook). Without this, the new goal was genuinely
  // written and logged to the activity feed, but this screen's own `goals` list never reloaded to show
  // it — the toast said "Added", the Timeline agreed, and the Goals screen just silently didn't (found
  // 2026-08-05).
  useGoalsRefresh(reloadGoals);

  // Add/edit an account from this screen's own "Add contribution" flow (`ExpenseForm`'s inline "+" tile)
  // without leaving it. Mirrors `useExpenses.ts`'s own independent `saveAccount` (same shape, same repo)
  // — that hook can't be imported here directly (a feature module importing another feature module's
  // hook), so this is a third, independent implementation of the same mutation, kept in sync via the
  // same `notifyAccountsChanged` signal every other copy already relies on.
  const saveAccount = useCallback(async (data: AccountInput, editing: Account | null): Promise<Account> => {
    const now = Date.now();
    const record: Account = editing
      ? { ...editing, ...data, updatedAt: now }
      : { id: crypto.randomUUID(), ...data, isArchived: false, createdAt: now, updatedAt: now };
    await accountsRepo.put(record);
    logActivity({
      action: editing ? 'UPDATE' : 'CREATE',
      entityType: 'account',
      entityId: record.id,
      summary: `${editing ? 'Updated' : 'Added'} account: ${record.name}`
    });
    notifyAccountsChanged();
    return record;
  }, []);

  const contributionsByGoal = useMemo(() => {
    const map = new Map<string, GoalContribution[]>();
    for (const c of contributions) {
      const list = map.get(c.goalId) ?? [];
      list.push(c);
      map.set(c.goalId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.date - a.date);
    return map;
  }, [contributions]);

  // A goal's `currentAmount` is a baseline only (set once via GoalForm's "Already saved" field) — the
  // amount actually shown/used everywhere is that baseline plus the live sum of its contributions,
  // the same way IOU never stores a denormalized balance either (see `core/iou/ledger.ts`). Computing
  // this live means a contribution can never drift out of sync with what the goal displays. Shared with
  // `useForecast.ts`'s Safe-to-spend goal exclusion (2026-08-02) via `core/goals/progress.ts`.
  const effectiveSaved = useCallback((goal: Goal) => coreEffectiveSaved(goal, contributions), [contributions]);

  const totalSaved = useMemo(
    () => goals.reduce((s, g) => s + effectiveSaved(g), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals, contributionsByGoal]
  );
  const totalTarget = useMemo(() => goals.reduce((s, g) => s + g.targetAmount, 0), [goals]);

  // Delete a goal along with its contributions (a contribution with no goal would be orphaned/dangling —
  // unlike IOU, there's no "keep a soft-archived record" concept for goals, so this is a real cascade).
  const removeGoal = useCallback(
    async (goalId: string) => {
      const list = contributionsByGoal.get(goalId) ?? [];
      for (const c of list) await removeContributionRepo(c.id);
      await removeGoalRepo(goalId);
    },
    [contributionsByGoal, removeContributionRepo, removeGoalRepo]
  );

  // Reconcile the account transaction (Expense or Transfer) that records a contribution's real money
  // movement — mirror of `IouView.tsx`'s `syncLinkedTxn`, just for goals. Pure decision lives in
  // `reconcileLinkedGoalTxn`; this only persists + logs the result.
  const syncLinkedGoalTxn = useCallback(
    async (existing: Expense | null, intent: LinkedGoalTxnIntent): Promise<string | undefined> => {
      const { put, deleteId } = reconcileLinkedGoalTxn(existing, intent, Date.now());
      if (put) {
        // `saveExpenseRecord` (this hook's own `useRepository` wrapper), not `expensesRepo.put()`
        // directly — the same real duplicate-transaction bug found and fixed in `IouView.tsx`'s
        // identical-shape `syncLinkedTxn` (2026-08-26): writing straight to the repo bypasses this
        // hook's own local `expenses` state, so a SECOND contribution's `existing` lookup (a few
        // lines up in `saveContribution` below) can miss a transaction this same hook just wrote,
        // minting a brand-new id instead of updating the real one. `refreshGoalData`'s
        // `useTxnRefresh` subscription (above) already reloads `expenses` on `notifyTxnChanged()`,
        // but that's an async round trip — this keeps the local state correct immediately too,
        // defense in depth rather than relying on that reload's timing alone.
        await saveExpenseRecord(put);
        logActivity({
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'expense',
          entityId: put.id,
          summary: `${existing ? 'Updated' : 'Added'} ${put.type}: ${put.description}`
        });
      }
      if (deleteId) await removeExpenseRecord(deleteId);
      if (put || deleteId) notifyTxnChanged();
      return put?.id;
    },
    [saveExpenseRecord, removeExpenseRecord]
  );

  // Add or edit a manual, bookkeeping-only contribution (amount + date, no linked transaction) — kept
  // solely so a legacy contribution created before 2026-08-02 (when "Add contribution" always opened
  // `ExpenseForm` and always created a real transaction) can still be edited/deleted. New contributions
  // never take this path — see `saveGoalContributionTxn` below, which is what `GoalsTab.tsx`'s
  // "Add contribution" actually calls now.
  const saveContribution = useCallback(
    async (
      goalId: string,
      input: { amount: number; date: number; notes?: string },
      editing?: GoalContribution | null,
      txn?: ContributionTxnOption
    ) => {
      let linkedTxnId = editing?.linkedTxnId;
      if (txn) {
        const existingTxn = linkedTxnId ? (expenses.find((e) => e.id === linkedTxnId) ?? null) : null;
        const goal = goals.find((g) => g.id === goalId);
        linkedTxnId = await syncLinkedGoalTxn(existingTxn, {
          record: txn.record,
          sourceAccountId: txn.sourceAccountId,
          ...(txn.destinationAccountId ? { destinationAccountId: txn.destinationAccountId } : {}),
          amount: input.amount,
          date: input.date,
          description: goal ? `Contribution: ${goal.name}` : 'Goal contribution'
        });
      }
      const now = Date.now();
      const contribution: GoalContribution = {
        id: editing?.id ?? crypto.randomUUID(),
        goalId,
        amount: input.amount,
        date: input.date,
        origin: 'manual',
        ...(linkedTxnId ? { linkedTxnId } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        createdAt: editing?.createdAt ?? now,
        updatedAt: now
      };
      await saveContributionRepo(contribution);
    },
    [expenses, goals, syncLinkedGoalTxn, saveContributionRepo]
  );

  // "Add contribution" (2026-08-02): the actual `ExpenseForm` save path, goal-preset — the caller
  // already assembled a complete Expense (category, tags, receipt, payment mode, everything the form
  // collects), so this persists it directly rather than reconstructing a narrower one the way
  // `syncLinkedGoalTxn`/`reconcileLinkedGoalTxn` do for the legacy toggle-based flow above. Still a
  // manual-origin contribution (goal-owned, editable/deletable from Goal Detail), same ownership as
  // `saveContribution` always used — only the UI that creates it changed, not what it means.
  const saveGoalContributionTxn = useCallback(
    async (
      goalId: string,
      expense: Expense,
      editingContribution: GoalContribution | null,
      newTagSetAside?: Record<string, boolean>
    ) => {
      const existingExpense = expenses.find((e) => e.id === expense.id);
      // `saveExpenseRecord`, not `expensesRepo.put()` directly — keeps this hook's own local
      // `expenses` state correct immediately, same fix as `syncLinkedGoalTxn` above (the caller
      // always supplies a real, stable id here, so this specific call site was never at risk of the
      // duplicate-id bug — but a stale local array is still wrong for any other read of `expenses`
      // in this same hook before `refreshGoalData`'s async reload catches up).
      await saveExpenseRecord(expense);
      for (const tag of expense.hashtags) {
        const existingTag = hashtags.find((h) => h.name === tag);
        if (existingTag) {
          await saveHashtagRepo({ ...existingTag, usageCount: existingTag.usageCount + 1 });
        } else {
          const setAside = newTagSetAside?.[tag] ?? false;
          await saveHashtagRepo({
            id: crypto.randomUUID(),
            name: tag,
            usageCount: 1,
            setAside,
            hideInSafeMode: setAside,
            createdAt: Date.now()
          });
        }
      }
      logActivity({
        action: existingExpense ? 'UPDATE' : 'CREATE',
        entityType: 'expense',
        entityId: expense.id,
        summary: `${existingExpense ? 'Updated' : 'Added'} ${expense.type}: ${expense.description}`
      });
      const now = Date.now();
      const contribution: GoalContribution = {
        id: editingContribution?.id ?? crypto.randomUUID(),
        goalId,
        amount: expense.amount,
        date: expense.date,
        origin: 'manual',
        linkedTxnId: expense.id,
        createdAt: editingContribution?.createdAt ?? now,
        updatedAt: now
      };
      await saveContributionRepo(contribution);
      notifyTxnChanged();
    },
    [expenses, hashtags, saveHashtagRepo, saveContributionRepo, saveExpenseRecord]
  );

  // Delete a manual contribution, cascading to its linked transaction if it owns one. Expense-origin
  // contributions (seeded from the expense form) aren't deleted from here — that link is removed by
  // turning the Goal toggle off on the transaction itself, same "one capability, one control" rule
  // `docs/DESIGN_GUIDELINES.md` already applies elsewhere.
  const removeContribution = useCallback(
    async (contribution: GoalContribution) => {
      if (contribution.origin === 'manual' && contribution.linkedTxnId) {
        // `removeExpenseRecord`, not `expensesRepo.delete()` directly — same staleness fix as above.
        await removeExpenseRecord(contribution.linkedTxnId);
        notifyTxnChanged();
      }
      await removeContributionRepo(contribution.id);
    },
    [removeContributionRepo, removeExpenseRecord]
  );

  // Every transaction already linked to any goal — used to offer only unlinked ones in "Link existing".
  const goalLinkedTxnIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of contributions) if (c.linkedTxnId) ids.add(c.linkedTxnId);
    return ids;
  }, [contributions]);

  // Retroactively tag an already-recorded transaction as a goal contribution — the "Link existing"
  // footer action in `GoalDetailView.tsx`. Reuses `reconcileGoalLink` directly (same pure function
  // `seedGoalFromExpense` in `useExpenses.ts` uses): there's no existing contribution for this txn yet,
  // so it always creates a fresh expense-origin one.
  const linkTransaction = useCallback(
    async (goalId: string, txn: Expense) => {
      const { toPut, toDelete } = reconcileGoalLink(
        txn.id,
        contributions,
        { goalId, amount: txn.amount, date: txn.date },
        Date.now()
      );
      // `saveContributionRepo`/`removeContributionRepo` (this hook's own `useLoggedRepository`
      // wrapper, already destructured above), not `goalContributionsRepo.put()`/`.delete()` directly
      // — same duplicate/staleness bug class found and fixed elsewhere in this file (2026-08-26):
      // writing straight to the repo means this hook's own `contributions` state never learns about
      // it until some other reload happens, so re-linking a second transaction within the same
      // mount could miss a contribution this exact function just created. This call site also never
      // broadcast `notifyTxnChanged()` at all — a second, independent instance of the same missing-
      // notify bug already fixed once in `useExpenses.ts`'s `seedIouFromExpense` (the IOU-side
      // sibling of this exact function) — so re-linking a transaction here never told any other
      // screen (this one included, once it stops treating its own writes as exempt) that anything
      // had changed.
      for (const c of toPut) {
        await saveContributionRepo(c);
        logActivity({
          action: 'CREATE',
          entityType: 'goalContribution',
          entityId: c.id,
          summary: `₹${c.amount} toward goal (from transaction)`
        });
      }
      for (const delId of toDelete) await removeContributionRepo(delId);
      if (toPut.length > 0 || toDelete.length > 0) notifyTxnChanged();
    },
    [contributions, saveContributionRepo, removeContributionRepo]
  );

  return {
    goals,
    saveGoal,
    removeGoal,
    totalSaved,
    totalTarget,
    contributions,
    contributionsByGoal,
    effectiveSaved,
    accounts,
    saveAccount,
    expenses,
    categories,
    hashtags,
    saveContribution,
    saveGoalContributionTxn,
    removeContribution,
    goalLinkedTxnIds,
    linkTransaction,
    refreshGoalData
  };
}

export type { Goal, GoalContribution };
