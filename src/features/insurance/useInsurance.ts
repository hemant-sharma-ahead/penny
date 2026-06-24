import { useMemo } from 'react';
import { insurancePoliciesRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';

function daysUntil(epochMs: number): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return Math.ceil((epochMs - todayStart.getTime()) / 86_400_000);
}

/** Loads insurance policies and derives premium total, expiring-soon count, and a renewal-sorted list. */
export function useInsurance() {
  const { items: policies, save: savePolicy, remove: removePolicy } = useRepository(insurancePoliciesRepo);

  const totalAnnualPremium = useMemo(() => policies.reduce((s, p) => s + p.annualPremium, 0), [policies]);

  const expiringCount = useMemo(
    () => policies.filter((p) => daysUntil(p.renewalDate) <= 30 && daysUntil(p.renewalDate) > 0).length,
    [policies]
  );

  const sorted = useMemo(() => [...policies].sort((a, b) => a.renewalDate - b.renewalDate), [policies]);

  return { policies, savePolicy, removePolicy, totalAnnualPremium, expiringCount, sorted };
}
