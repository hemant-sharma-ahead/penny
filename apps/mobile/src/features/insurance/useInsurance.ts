import { useMemo } from 'react';
import { insurancePoliciesRepo } from '@/core/db/repositories';
import type { InsurancePolicy } from '@/core/db/types';
import { useLoggedRepository } from '~/hooks/useLoggedRepository';
import { daysUntil } from '@/lib/date';

const summarizePolicy = (p: InsurancePolicy) => `${p.type} policy: ${p.insurer}`;

/** Loads insurance policies and derives premium total, expiring-soon count, and a renewal-sorted list. */
export function useInsurance() {
  const {
    items: policies,
    save: savePolicy,
    remove: removePolicy,
    reload
  } = useLoggedRepository(insurancePoliciesRepo, {
    entityType: 'insurance',
    summarize: summarizePolicy,
    diffFields: ['annualPremium', 'renewalDate']
  });

  const totalAnnualPremium = useMemo(() => policies.reduce((s, p) => s + p.annualPremium, 0), [policies]);

  const expiringCount = useMemo(
    () => policies.filter((p) => daysUntil(p.renewalDate) <= 30 && daysUntil(p.renewalDate) > 0).length,
    [policies]
  );

  const sorted = useMemo(() => [...policies].sort((a, b) => a.renewalDate - b.renewalDate), [policies]);

  return { policies, savePolicy, removePolicy, totalAnnualPremium, expiringCount, sorted, reload };
}
