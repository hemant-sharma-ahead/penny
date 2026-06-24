import { useMemo } from 'react';
import { liabilitiesRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { EMI_LOAN_TYPES } from '@/core/loans/meta';

export { EMI_LOAN_TYPES };

export function useLoans() {
  const { items: liabilities, save: saveLiability } = useRepository(liabilitiesRepo);

  const emiLoans = useMemo(() => liabilities.filter((l) => EMI_LOAN_TYPES.includes(l.type)), [liabilities]);

  return { liabilities, saveLiability, emiLoans };
}
