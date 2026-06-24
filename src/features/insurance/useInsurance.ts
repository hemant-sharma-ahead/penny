import { useMemo } from 'react';
import { insurancePoliciesRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { daysUntil } from '@/lib/date';

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
