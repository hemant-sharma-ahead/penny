import type { AssetMeta, PpfTransaction } from '@/core/db/types';

export const PPF_RATE = 0.071;
export const PPF_MAX_ANNUAL = 150_000;

export interface PpfCardData {
  sortedTxns: PpfTransaction[];
  maturityMs: number | null;
  yearsLeft: number | null;
  yearsElapsed: number | null;
  projected: number | null;
  fyDeposits: number;
  fyPct: number;
  showAprilTip: boolean;
}

export function ppfMaturityMs(openingMs: number): number {
  const d = new Date(openingMs);
  d.setFullYear(d.getFullYear() + 15);
  return d.getTime();
}

export function ppfProjectedCorpus(balanceNow: number, annualContrib: number, yearsLeft: number): number {
  if (yearsLeft <= 0) return balanceNow;
  const r = PPF_RATE;
  return balanceNow * Math.pow(1 + r, yearsLeft) + annualContrib * ((Math.pow(1 + r, yearsLeft) - 1) / r);
}

export function ppfFyStart(): Date {
  const now = new Date();
  return now.getMonth() >= 3 ? new Date(now.getFullYear(), 3, 1) : new Date(now.getFullYear() - 1, 3, 1);
}

export function ppfThisYearDeposits(txns: PpfTransaction[]): number {
  const fyStart = ppfFyStart().getTime();
  return txns.filter((t) => t.type === 'deposit' && t.date >= fyStart).reduce((s, t) => s + t.amount, 0);
}

export function isBeforeFifth(dateMs: number): boolean {
  return new Date(dateMs).getDate() <= 5;
}

export function ppfBuildCardData(meta: AssetMeta, balance: number): PpfCardData {
  const now = Date.now();
  const txns: PpfTransaction[] = meta.ppfTransactions ?? [];
  const sortedTxns = [...txns].sort((a, b) => b.date - a.date);
  const maturityMs = meta.ppfOpeningDate ? ppfMaturityMs(meta.ppfOpeningDate) : null;
  const yearsLeft = maturityMs ? Math.max(0, (maturityMs - now) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const yearsElapsed = meta.ppfOpeningDate
    ? Math.min(15, (now - meta.ppfOpeningDate) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const annualContrib = meta.annualContribution ?? 0;
  const projected =
    yearsLeft != null && annualContrib > 0 ? ppfProjectedCorpus(balance, annualContrib, Math.ceil(yearsLeft)) : null;
  const fyDeposits = ppfThisYearDeposits(txns);
  const fyPct = Math.min(100, (fyDeposits / PPF_MAX_ANNUAL) * 100);
  const nowMonth = new Date(now).getMonth();
  const showAprilTip = (nowMonth === 2 || nowMonth === 3) && fyDeposits === 0;
  return { sortedTxns, maturityMs, yearsLeft, yearsElapsed, projected, fyDeposits, fyPct, showAprilTip };
}
