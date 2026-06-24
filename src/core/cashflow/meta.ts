import type { CashFlowType } from './forecaster';

export interface CashFlowMeta {
  icon: string;
  color: string;
  label: string;
}

/** Display order for cash-flow event types. */
export const CF_TYPES: CashFlowType[] = ['loan_emi', 'subscription', 'insurance', 'recurring'];

export const TYPE_CONFIG: Record<CashFlowType, CashFlowMeta> = {
  loan_emi: { icon: 'ti-building-bank', color: '#3b82f6', label: 'Loan EMI' },
  subscription: { icon: 'ti-refresh', color: '#8b5cf6', label: 'Subscription' },
  insurance: { icon: 'ti-shield', color: '#10b981', label: 'Insurance' },
  recurring: { icon: 'ti-repeat', color: '#f59e0b', label: 'Recurring' }
};

export function getCashFlowMeta(type: CashFlowType): CashFlowMeta {
  return TYPE_CONFIG[type];
}
