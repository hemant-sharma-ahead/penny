import { useCallback, useMemo, useState } from 'react';
import { insurancePoliciesRepo, insurerMemoryRepo } from '@/core/db/repositories';
import type { Expense, InsurancePolicy, InsurerCategory } from '@/core/db/types';
import { useLoggedRepository } from '~/hooks/useLoggedRepository';
import { useRepository } from '@/hooks/useRepository';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';
import { daysUntil } from '@/lib/date';
import { buildInsurerMemory, insurerMemoryKey } from '@/core/insurance/insurerMemory';
import { isPaidUp } from '@/core/insurance/premiumSchedule';
import {
  candidateExpensesForPolicy,
  markPremiumPaid,
  unmarkLastPremiumPayment,
  type MarkPaidChoice
} from '~/hooks/useInsurancePremiumActions';

const summarizePolicy = (p: InsurancePolicy) => `${p.type} policy: ${p.insurer}`;

/** Loads insurance policies and derives premium total, expiring-soon count, and a due-sorted list.
 *  Also owns "Other" insurer suggestion memory and the Term/Life "Mark as paid" flow (delegated to the
 *  shared `~/hooks/useInsurancePremiumActions.ts` module — see that file's doc comment for why it isn't
 *  implemented directly here). */
export function useInsurance() {
  const {
    items: policies,
    save: savePolicy,
    remove: removePolicy,
    reload
  } = useLoggedRepository(insurancePoliciesRepo, {
    entityType: 'insurance',
    summarize: summarizePolicy,
    diffFields: ['annualPremium', 'renewalDate', 'nextPremiumDueDate']
  });

  const {
    items: insurerMemories,
    save: saveInsurerMemoryRepo,
    reload: reloadInsurerMemories
  } = useRepository(insurerMemoryRepo);

  // Mark-as-paid can also be triggered from the Reminders bell — a completely separate hook instance
  // (`~/hooks/useReminders.ts`) that writes through the same shared `useInsurancePremiumActions.ts`
  // module. Without this, this screen's own `policies` list would go stale until a full remount
  // (CLAUDE.md's standing "hook with no refresh-bus subscription" rule).
  useTxnRefresh(reload);

  const totalAnnualPremium = useMemo(() => policies.reduce((s, p) => s + p.annualPremium, 0), [policies]);

  const expiringCount = useMemo(
    () => policies.filter((p) => daysUntil(p.renewalDate) <= 30 && daysUntil(p.renewalDate) > 0).length,
    [policies]
  );

  // Stable per-mount "now" for the `isPaidUp` check below — not called inline during render (an impure
  // `Date.now()` call during render is unstable across re-renders), matching this app's established
  // `const [nowMs] = useState(() => Date.now())` convention (e.g. `useHealthScore.ts`, `useTaxData.ts`).
  const [nowMs] = useState(() => Date.now());

  // Term/Life sort by their real next premium due date when a schedule is set; everything else (and any
  // Term/Life policy without a schedule yet) falls back to the flat annual renewal date. A Term/Life
  // policy that finished a Limited Pay term (`isPaidUp`) is a THIRD, distinct case — `nextPremiumDueDate`
  // is `undefined` there too, but for a genuinely different reason ("nothing more is owed", not "no
  // schedule was ever set"), so it must NOT fall back to sorting by the stale/irrelevant `renewalDate`
  // either (the same ambiguity `forecaster.ts`'s insurance block had to guard against). Sorts to the end
  // instead — nothing about it needs the user's near-term attention.
  const sortKey = useCallback(
    (p: InsurancePolicy) => {
      if ((p.type === 'term' || p.type === 'life') && isPaidUp(p, nowMs)) return Number.POSITIVE_INFINITY;
      return p.nextPremiumDueDate ?? p.renewalDate;
    },
    [nowMs]
  );
  const sorted = useMemo(() => [...policies].sort((a, b) => sortKey(a) - sortKey(b)), [policies, sortKey]);

  /** Remembers a custom "Other" insurer name for next time (insurance-redesign-v4.html §⑤) — no-op for
   *  a blank name. Mirrors merchant memory's own "increment usage on the existing mapping" convention. */
  const rememberInsurer = useCallback(
    async (category: InsurerCategory, name: string) => {
      const key = insurerMemoryKey(category, name);
      if (!key) return;
      const previous = insurerMemories.find((m) => m.id === key);
      const memory = buildInsurerMemory(category, name, previous);
      if (memory) await saveInsurerMemoryRepo(memory);
    },
    [insurerMemories, saveInsurerMemoryRepo]
  );

  const markAsPaid = useCallback(
    async (policy: InsurancePolicy, choice: MarkPaidChoice) => {
      const { policy: updated } = await markPremiumPaid(policy, choice);
      reload();
      return updated;
    },
    [reload]
  );

  const unmarkPayment = useCallback(
    async (policy: InsurancePolicy, paymentId: string, alsoRemoveExpense: boolean) => {
      const updated = await unmarkLastPremiumPayment(policy, paymentId, alsoRemoveExpense);
      reload();
      return updated;
    },
    [reload]
  );

  const candidateExpenses = useCallback(
    (policy: InsurancePolicy): Promise<Expense[]> => candidateExpensesForPolicy(policy),
    []
  );

  return {
    policies,
    savePolicy,
    removePolicy,
    totalAnnualPremium,
    expiringCount,
    sorted,
    reload,
    insurerMemories,
    reloadInsurerMemories,
    rememberInsurer,
    markAsPaid,
    unmarkPayment,
    candidateExpenses
  };
}
