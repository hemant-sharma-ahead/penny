import type { AssetClass } from '@/core/db/types';

// Asset-class picker options (label, icon, accent colour) shown when adding a
// new holding without a locked class.
export const ASSET_CLASSES: { value: AssetClass; label: string; icon: string; color: string }[] = [
  { value: 'mf', label: 'Mutual Fund', icon: 'ti-chart-donut', color: '#6366f1' },
  { value: 'stock', label: 'Stock', icon: 'ti-trending-up', color: '#0ea5e9' },
  { value: 'fd', label: 'FD / RD', icon: 'ti-building-bank', color: '#f59e0b' },
  { value: 'nps', label: 'NPS', icon: 'ti-building-community', color: '#10b981' },
  { value: 'ppf', label: 'PPF', icon: 'ti-safe', color: '#8b5cf6' },
  { value: 'epf', label: 'EPF', icon: 'ti-building-factory', color: '#64748b' },
  { value: 'gold', label: 'Gold', icon: 'ti-coin', color: '#d97706' },
  { value: 'vehicle', label: 'Vehicle', icon: 'ti-car', color: '#3b82f6' },
  { value: 'property', label: 'Property', icon: 'ti-building', color: '#8b5cf6' },
  { value: 'other', label: 'Other', icon: 'ti-dots', color: '#6b7280' }
];

// Per-asset-class display metadata (label / icon / accent colour).
export const ASSET_META: Record<AssetClass, { label: string; icon: string; color: string }> = {
  mf: { label: 'Mutual Funds', icon: 'ti-chart-donut', color: '#6366f1' },
  stock: { label: 'Stocks', icon: 'ti-trending-up', color: '#0ea5e9' },
  fd: { label: 'FD / RD', icon: 'ti-building-bank', color: '#f59e0b' },
  nps: { label: 'NPS', icon: 'ti-building-community', color: '#10b981' },
  ppf: { label: 'PPF', icon: 'ti-safe', color: '#8b5cf6' },
  epf: { label: 'EPF', icon: 'ti-building-factory', color: '#64748b' },
  gold: { label: 'Gold', icon: 'ti-coin', color: '#d97706' },
  vehicle: { label: 'Vehicles', icon: 'ti-car', color: '#3b82f6' },
  property: { label: 'Property', icon: 'ti-building', color: '#8b5cf6' },
  other: { label: 'Other', icon: 'ti-dots', color: '#6b7280' }
};

// Human-readable noun per asset class, used to build the form title.
// Classes omitted here (e.g. 'other') fall back to a generic title.
const ASSET_TITLE_LABELS: Partial<Record<AssetClass, string>> = {
  nps: 'NPS',
  ppf: 'PPF',
  epf: 'EPF',
  vehicle: 'Vehicle',
  property: 'Property',
  fd: 'Fixed Income',
  gold: 'Precious Metal',
  mf: 'Mutual Fund',
  stock: 'Stock'
};

// Builds the modal title. Editing keys purely on the asset class; creating uses
// "Track" for assets tracked elsewhere and "Add" for MF/Stock (which only get a
// named title when the caller locked the class). Unknown classes fall back to
// a generic title.
export function holdingFormTitle(editing: boolean, assetClass: AssetClass, lockAssetClass?: AssetClass): string {
  if (editing) {
    const label = ASSET_TITLE_LABELS[assetClass];
    return label ? `Edit ${label}` : 'Edit holding';
  }
  if (assetClass === 'mf' || assetClass === 'stock') {
    return lockAssetClass ? `Add ${ASSET_TITLE_LABELS[assetClass]}` : 'Add holding';
  }
  const label = ASSET_TITLE_LABELS[assetClass];
  return label ? `Track ${label}` : 'Add holding';
}
