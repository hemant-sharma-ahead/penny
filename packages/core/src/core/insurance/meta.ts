import type { InsuranceType } from '@/core/db/types';

export interface PolicyMeta {
  label: string;
  icon: string;
  color: string;
}

export const POLICY_META: Record<InsuranceType, PolicyMeta> = {
  term: { label: 'Term', icon: 'ti-umbrella', color: '#ef4444' },
  health: { label: 'Health', icon: 'ti-heart-rate-monitor', color: '#10b981' },
  vehicle: { label: 'Vehicle', icon: 'ti-car', color: '#f59e0b' },
  home: { label: 'Home', icon: 'ti-home', color: '#6366f1' },
  travel: { label: 'Travel', icon: 'ti-plane', color: '#0ea5e9' },
  life: { label: 'Life / ULIP', icon: 'ti-heart', color: '#8b5cf6' },
  other: { label: 'Other', icon: 'ti-shield', color: '#6b7280' }
};

export function getPolicyMeta(type: InsuranceType): PolicyMeta {
  return POLICY_META[type];
}
