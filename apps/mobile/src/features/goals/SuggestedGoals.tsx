import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useToast } from '~/context/ToastContext';
import { useProfile } from '@/hooks/useProfile';
import { useRetirementPlan } from '@/hooks/useRetirementPlan';
import { useRepository } from '@/hooks/useRepository';
import { formatCompact } from '@/lib/formatters';
import { deriveAge } from '@/lib/date';
import { createGoalFromTemplate } from '@/core/advisor/guidance';
import { lifeStageGoalTemplates, type RetirementSuggestion } from '@/core/advisor/lifeStageGoals';
import { calcRetirementProjection, calcInvestableCorpus } from '@/core/calculators/retirementProjection';
import { calcLiquidFunds } from '@/core/accounts/balanceCalculator';
import { calcMonthlyLivingSpend } from '@/core/expenses/monthlySpend';
import { holdingsRepo, accountsRepo, expensesRepo, expenseCategoriesRepo } from '@/core/db/repositories';
import type { Account, Expense, ExpenseCategory, Goal, Holding } from '@/core/db/types';
import { notifyGoalsChanged } from '@/hooks/useDataRefresh';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

/** Loose match for goal-name dedup — punctuation/casing/spacing shouldn't matter (found via a real
 *  mismatch: demo data seeds "Home Down Payment", the template's fixed name is "Home down-payment" —
 *  a plain trim+lowercase compare treats those as different goals and keeps suggesting a duplicate). */
function normalizeGoalName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * "Suggested for you" — life-stage goal templates from the opt-in profile (education corpus, home
 * down-payment, retirement…). One tap adds a `source:'suggested'` goal. Deduped against existing goals;
 * hidden when nothing new to suggest. Powered on-device by the profile — advice only.
 *
 * **Retirement corpus is computed from real data, not a flat guessed constant** (2026-08-05 — a flat
 * ₹2Cr constant could be off by an order of magnitude from someone's real number, e.g. ₹28Cr, which
 * actively undermines the app's own "financially aware" purpose). Reuses `calcRetirementProjection()`
 * and the same stored `RetirementPlan` Home's own Retirement Corpus chart reads, gathering the same raw
 * inputs independently here (holdings/accounts/expenses/categories) since a feature module can't
 * cross-import `features/home`'s own hook — this keeps the *suggested* number always in sync with
 * Home's, recomputed live on every render while it's still just a suggestion. Skipped entirely (not
 * shown as a suggestion at all) when there's no real expense data yet to base it on, rather than
 * falling back to a guessed number — see `RetirementSuggestion`'s doc comment in `lifeStageGoals.ts`.
 * Once added, the goal's `targetAmount` is a normal editable field like any other goal — it does not
 * keep recomputing after that point.
 */
export function SuggestedGoals({ goals }: { goals: Goal[] }) {
  const theme = useThemeColors();
  const { profile } = useProfile();
  const { plan } = useRetirementPlan();
  const { items: holdings } = useRepository<Holding>(holdingsRepo);
  const { items: accounts } = useRepository<Account>(accountsRepo);
  const { items: expenses } = useRepository<Expense>(expensesRepo);
  const { items: categories } = useRepository<ExpenseCategory>(expenseCategoriesRepo);
  const { showToast } = useToast();
  const [adding, setAdding] = useState<string | null>(null);

  const retirement = useMemo<RetirementSuggestion | null>(() => {
    if (!plan) return null;
    const currentAge = profile?.dob ? deriveAge(profile.dob) : null;
    if (currentAge === null) return null;
    const monthlyExpenseToday = plan.monthlyExpenseOverride ?? calcMonthlyLivingSpend(expenses, categories).living;
    if (monthlyExpenseToday <= 0) return null; // not enough data — see doc comment above
    const liquidFunds = calcLiquidFunds(accounts, expenses);
    const investableCorpusToday = calcInvestableCorpus(holdings, liquidFunds);
    const { corpusNeeded, yearsToRetirement } = calcRetirementProjection({
      currentAge,
      retirementAge: plan.retirementAge,
      investableCorpusToday,
      monthlyExpenseToday,
      monthlyInvestment: plan.monthlyInvestment,
      expectedReturnPct: plan.expectedReturnPct,
      inflationPct: plan.inflationPct,
      swrPct: plan.swrPct
    });
    return { targetAmount: corpusNeeded, yearsToRetirement };
  }, [plan, profile, holdings, accounts, expenses, categories]);

  const existing = new Set(goals.map((g) => normalizeGoalName(g.name)));
  const templates = lifeStageGoalTemplates(profile, retirement).filter((t) => !existing.has(normalizeGoalName(t.name)));
  if (templates.length === 0) return null;

  async function add(name: string) {
    const t = templates.find((x) => x.name === name);
    if (!t || adding) return;
    setAdding(name);
    try {
      await createGoalFromTemplate(t);
      notifyGoalsChanged();
      showToast({ message: `Added "${t.name}" to your goals` });
    } finally {
      setAdding(null);
    }
  }

  return (
    <View className="rounded-2xl bg-surface border border-theme p-3 mb-1">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary px-1 mb-1">
        Suggested for you
      </Text>
      {templates.map((t, i) => (
        <View key={t.name} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-theme' : ''}`}>
          <View
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: tint(theme.primary) }}
          >
            <Icon name={t.icon ?? 'ti-target'} size={16} color={theme.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-[13px] font-semibold text-primary" numberOfLines={1}>
              {t.name}
            </Text>
            <Text className="text-[11px] text-tertiary">Target ~{formatCompact(t.targetAmount)}</Text>
          </View>
          <Pressable
            onPress={() => void add(t.name)}
            disabled={adding !== null}
            className="rounded-full px-3 py-1.5"
            style={{ backgroundColor: theme.primary, opacity: adding !== null ? 0.5 : 1 }}
          >
            <Text className="text-[11px] font-bold text-white">{adding === t.name ? 'Adding…' : 'Add'}</Text>
          </Pressable>
        </View>
      ))}
      <Text className="text-[10px] text-tertiary px-1 mt-1.5">
        Based on your profile · edit amounts & dates anytime.
      </Text>
    </View>
  );
}
