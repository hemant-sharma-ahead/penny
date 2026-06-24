import type { LiabilityType } from '@/core/db/types';

export interface LoanMeta {
  label: string;
  icon: string;
  color: string;
}

/** Liability types that carry an EMI and are eligible for the loan planner. */
export const EMI_LOAN_TYPES: LiabilityType[] = [
  'home_loan',
  'car_loan',
  'personal_loan',
  'education_loan',
  'gold_loan',
  'lap'
];

export const LOAN_META: Record<string, LoanMeta> = {
  home_loan: { label: 'Home Loan', icon: 'ti-home', color: '#6366f1' },
  car_loan: { label: 'Car Loan', icon: 'ti-car', color: '#3b82f6' },
  personal_loan: { label: 'Personal Loan', icon: 'ti-user', color: '#f59e0b' },
  education_loan: { label: 'Education Loan', icon: 'ti-school', color: '#10b981' },
  gold_loan: { label: 'Gold Loan', icon: 'ti-coin', color: '#d97706' },
  lap: { label: 'Loan Against Property', icon: 'ti-building', color: '#8b5cf6' }
};

/** Returns the metadata for a liability type, falling back to a neutral default. */
export function getLoanMeta(type: string): LoanMeta {
  return LOAN_META[type] ?? { label: type, icon: 'ti-coin', color: 'var(--color-primary)' };
}
