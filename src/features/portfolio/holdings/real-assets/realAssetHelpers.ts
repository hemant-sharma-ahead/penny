const REAL_ASSET_STALENESS_DAYS = 90;

export function realAssetIsStale(lastUpdatedAt?: number): boolean {
  if (!lastUpdatedAt) return true;
  return Date.now() - lastUpdatedAt > REAL_ASSET_STALENESS_DAYS * 24 * 60 * 60 * 1000;
}

export function realAssetStalenessLabel(lastUpdatedAt?: number): string {
  if (!lastUpdatedAt) return 'Never updated';
  const days = Math.floor((Date.now() - lastUpdatedAt) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 30) return `Updated ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Updated ${months} month${months > 1 ? 's' : ''} ago`;
}
