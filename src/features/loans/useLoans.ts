import { useMemo } from 'react';
import { liabilitiesRepo } from '@/core/db/repositories';
import type { LiabilityType } from '@/core/db/types';
import { useRepository } from '@/hooks/useRepository';

export const EMI_LOAN_TYPES: LiabilityType[] = [
  'home_loan',
  'car_loan',
  'personal_loan',
  'education_loan',
  'gold_loan',
  'lap'
];

export function useLoans() {
  const { items: liabilities, save: saveLiability } = useRepository(liabilitiesRepo);

  const emiLoans = useMemo(() => liabilities.filter((l) => EMI_LOAN_TYPES.includes(l.type)), [liabilities]);

  return { liabilities, saveLiability, emiLoans };
}
