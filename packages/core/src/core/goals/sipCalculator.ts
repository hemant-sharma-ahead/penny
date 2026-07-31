export function calcSipNeeded(
  targetAmount: number,
  currentAmount: number,
  monthsLeft: number,
  annualReturnPct: number
): number {
  if (monthsLeft <= 0) return 0;
  const r = annualReturnPct / 100 / 12;
  const fvOfCurrent = currentAmount * Math.pow(1 + r, monthsLeft);
  const remaining = targetAmount - fvOfCurrent;
  if (remaining <= 0) return 0;
  if (r === 0) return remaining / monthsLeft;
  return (remaining * r) / (Math.pow(1 + r, monthsLeft) - 1);
}

export function monthsUntil(epochMs: number): number {
  const now = new Date();
  const target = new Date(epochMs);
  const diff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return Math.max(0, diff);
}
