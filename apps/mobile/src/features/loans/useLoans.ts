import { useMemo } from 'react';
import { liabilitiesRepo } from '@/core/db/repositories';
import type { Liability } from '@/core/db/types';
import { useLoggedRepository } from '~/hooks/useLoggedRepository';
import { EMI_LOAN_TYPES } from '@/core/loans/meta';

export { EMI_LOAN_TYPES };

const summarizeLiability = (l: Liability) => `loan: ${l.name}`;

export function useLoans() {
  const {
    items: liabilities,
    save: saveLiability,
    remove: deleteLiability,
    reload
  } = useLoggedRepository(liabilitiesRepo, {
    entityType: 'liability',
    summarize: summarizeLiability,
    diffFields: ['outstandingAmount', 'principalAmount']
  });

  const emiLoans = useMemo(() => liabilities.filter((l) => EMI_LOAN_TYPES.includes(l.type)), [liabilities]);

  return { liabilities, saveLiability, deleteLiability, emiLoans, reload };
}
