import { useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState } from '~/components/ui';
import { ExpenseForm } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import { calcSipNeeded, monthsUntil } from '@/core/goals/sipCalculator';
import { getRiskReturn } from '@/core/goals/meta';
import type { Account, Expense, ExpenseCategory, GoalContribution, Hashtag } from '@/core/db/types';
import type { AccountInput } from '~/hooks/useAccountForm';
import { useEventMode } from '~/context/EventModeContext';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { GoalDetailView } from './GoalDetailView';
import { LegacyContributionEditModal } from './LegacyContributionEditModal';
import { LinkTransactionModal } from './LinkTransactionModal';
import { SuggestedGoals } from './SuggestedGoals';
import type { ContributionTxnOption } from './useGoals';
import type { Goal } from './useGoals';

/** "X of Y goals in progress" + total monthly SIP still needed across every goal not yet fully funded
 *  (2026-08-02) — leads the Goals screen now that "Suggested for you" moved to the bottom (see
 *  `docs/mockups/proposals/goals-screen-summary-card-reorder-v1.html`, Option 2: a completion ring is the
 *  anchor, the SIP figure sits beside it rather than dominating the card). `calcSipNeeded` already
 *  returns 0 for a goal that's fully funded or past its target date, so summing it across every goal
 *  (not just the "remaining" ones) is correct without a second filter. */
function GoalsSummaryCard({
  goals,
  masked,
  effectiveSaved
}: {
  goals: Goal[];
  masked: boolean;
  effectiveSaved: (goal: Goal) => number;
}) {
  const theme = useThemeColors();
  const { totalSip, remaining, total } = useMemo(() => {
    let totalSip = 0;
    let remaining = 0;
    for (const g of goals) {
      const saved = effectiveSaved(g);
      if (saved < g.targetAmount) remaining++;
      totalSip += calcSipNeeded(g.targetAmount, saved, monthsUntil(g.targetDate), getRiskReturn(g.risk));
    }
    return { totalSip, remaining, total: goals.length };
  }, [goals, effectiveSaved]);

  return (
    <View className="bg-surface border border-theme rounded-2xl p-3.5 flex-row items-center gap-3.5">
      <View
        className="w-[54px] h-[54px] rounded-full items-center justify-center"
        style={{ borderWidth: 4, borderColor: theme.primary }}
      >
        <Text className="text-[13px] font-extrabold text-primary">
          {remaining}/{total}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-[10.5px] text-tertiary">Goals in progress</Text>
        <Text className="text-lg font-extrabold text-primary mt-0.5">
          {masked ? '••••' : formatCurrency(Math.ceil(totalSip))}/mo
        </Text>
        <Text className="text-[10px] text-tertiary mt-0.5">total SIP needed to stay on track</Text>
      </View>
    </View>
  );
}

interface GoalsTabProps {
  goals: Goal[];
  masked: boolean;
  saveGoal: (g: Goal) => Promise<unknown>;
  removeGoal: (id: string) => Promise<unknown>;
  contributionsByGoal: Map<string, GoalContribution[]>;
  effectiveSaved: (goal: Goal) => number;
  accounts: Account[];
  saveAccount: (data: AccountInput, editing: Account | null) => Promise<Account>;
  expenses: Expense[];
  categories: ExpenseCategory[];
  hashtags: Hashtag[];
  /** Legacy-only: edits a pre-2026-08-02 bookkeeping-only contribution (no linked transaction). */
  saveContribution: (
    goalId: string,
    input: { amount: number; date: number },
    editing?: GoalContribution | null,
    txn?: ContributionTxnOption
  ) => Promise<void>;
  /** "Add contribution" — the real path now: persists the Expense `ExpenseForm` assembled, then
   *  upserts the linked contribution. */
  saveGoalContributionTxn: (
    goalId: string,
    expense: Expense,
    editingContribution: GoalContribution | null,
    newTagSetAside?: Record<string, boolean>
  ) => Promise<void>;
  removeContribution: (contribution: GoalContribution) => Promise<void>;
  goalLinkedTxnIds: Set<string>;
  linkTransaction: (goalId: string, txn: Expense) => Promise<void>;
}

export function GoalsTab({
  goals,
  masked,
  saveGoal,
  removeGoal,
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
  linkTransaction
}: GoalsTabProps) {
  const insets = useSafeAreaInsets();
  const { events: activeEvents } = useEventMode();
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);
  // `editing: null` ⇒ a brand-new contribution (always via `ExpenseForm`). `editing` set ⇒ branches
  // below on whether it has a `linkedTxnId` (edit via `ExpenseForm`, same as new) or not (legacy
  // bookkeeping-only, edit via `LegacyContributionEditModal`).
  const [contributionForm, setContributionForm] = useState<{ goalId: string; editing: GoalContribution | null } | null>(
    null
  );
  const [linkingGoalId, setLinkingGoalId] = useState<string | null>(null);

  const expensesById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const contributionGoalName = contributionForm
    ? (goals.find((g) => g.id === contributionForm.goalId)?.name ?? 'Goal')
    : '';
  const legacyEditing =
    contributionForm?.editing && !contributionForm.editing.linkedTxnId ? contributionForm.editing : null;

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        {goals.length > 0 && (
          <View className="px-4 pt-4">
            <GoalsSummaryCard goals={goals} masked={masked} effectiveSaved={effectiveSaved} />
          </View>
        )}
        {goals.length === 0 ? (
          <View className="px-4 py-6">
            <EmptyState icon="ti-target" title="No goals yet" description="Tap + to set your first savings goal." />
          </View>
        ) : (
          <View className="px-4 py-4 gap-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                masked={masked}
                effectiveSaved={effectiveSaved(goal)}
                onOpenDetail={setDetailGoal}
                onAddContribution={(g) => setContributionForm({ goalId: g.id, editing: null })}
                onLinkExisting={(g) => setLinkingGoalId(g.id)}
              />
            ))}
          </View>
        )}
        {/* "Suggested for you" (2026-08-02) — moved from the top to the end: your own goals get first
            attention, suggestions are a footer nudge rather than the first thing on the screen. */}
        <View className="px-4 pt-1 pb-4">
          <SuggestedGoals goals={goals} />
        </View>
      </ScrollView>

      <View className="absolute right-4" style={{ bottom: insets.bottom + 16 }}>
        <Button
          variant="primary"
          icon="ti-plus"
          accessibilityLabel="Add goal"
          className="w-14 h-14 rounded-full shadow-lg"
          onPress={() => {
            setEditingGoal(null);
            setShowForm(true);
          }}
        />
      </View>

      {showForm && (
        <GoalForm
          editing={editingGoal}
          onSave={async (goal) => {
            await saveGoal(goal);
            setShowForm(false);
          }}
          onDelete={async (id) => {
            await removeGoal(id);
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
        />
      )}

      {detailGoal && (
        <GoalDetailView
          goal={detailGoal}
          contributions={contributionsByGoal.get(detailGoal.id) ?? []}
          expensesById={expensesById}
          effectiveSaved={effectiveSaved(detailGoal)}
          masked={masked}
          onAddContribution={() => setContributionForm({ goalId: detailGoal.id, editing: null })}
          onLinkExisting={() => setLinkingGoalId(detailGoal.id)}
          onEditContribution={(c) => setContributionForm({ goalId: detailGoal.id, editing: c })}
          onDeleteContribution={(c) => void removeContribution(c)}
          onEditGoal={() => {
            setEditingGoal(detailGoal);
            setShowForm(true);
            setDetailGoal(null);
          }}
          onClose={() => setDetailGoal(null)}
        />
      )}

      {/* "Add contribution" — new or editing one that already has a linked transaction: the real
          Expense form, goal-preset (2026-08-02). */}
      {contributionForm && !legacyEditing && (
        <ExpenseForm
          categories={categories}
          hashtags={hashtags}
          editing={
            contributionForm.editing?.linkedTxnId
              ? (expensesById.get(contributionForm.editing.linkedTxnId) ?? null)
              : null
          }
          activeEvents={activeEvents}
          goalPreset={{ goalId: contributionForm.goalId, goalName: contributionGoalName }}
          saveAccount={saveAccount}
          searchMerchant={() => []}
          onSave={async (expense, newTagSetAside) => {
            await saveGoalContributionTxn(contributionForm.goalId, expense, contributionForm.editing, newTagSetAside);
            setContributionForm(null);
          }}
          onDelete={async () => {
            if (contributionForm.editing) await removeContribution(contributionForm.editing);
            setContributionForm(null);
          }}
          onClose={() => setContributionForm(null)}
        />
      )}

      {/* Editing a legacy (pre-2026-08-02) bookkeeping-only contribution — no linked transaction to
          open, so a tiny amount+date-only fallback instead of the full form above. */}
      {legacyEditing && (
        <LegacyContributionEditModal
          goalName={contributionGoalName}
          editing={legacyEditing}
          onSave={async (input) => {
            await saveContribution(legacyEditing.goalId, input, legacyEditing);
            setContributionForm(null);
          }}
          onDelete={async () => {
            await removeContribution(legacyEditing);
            setContributionForm(null);
          }}
          onClose={() => setContributionForm(null)}
        />
      )}

      {linkingGoalId && (
        <LinkTransactionModal
          goalName={goals.find((g) => g.id === linkingGoalId)?.name ?? 'Goal'}
          candidates={expenses.filter((e) => !goalLinkedTxnIds.has(e.id)).sort((a, b) => b.date - a.date)}
          accountMap={accountMap}
          masked={masked}
          onLink={(txn) => {
            void linkTransaction(linkingGoalId, txn);
            setLinkingGoalId(null);
          }}
          onClose={() => setLinkingGoalId(null)}
        />
      )}
    </>
  );
}
