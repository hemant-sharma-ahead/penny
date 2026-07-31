import type { Holding, InsurancePolicy, Liability } from '@/core/db/types';

// ── FY helpers ────────────────────────────────────────────────────────────────

export interface FYInfo {
  start: number; // epoch ms, April 1
  end: number; // epoch ms, March 31 end of day
  label: string; // "FY 2026-27"
  daysLeft: number;
  isQ4: boolean; // Jan-Mar — time to invest!
}

export function currentFY(nowMs: number): FYInfo {
  const d = new Date(nowMs);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan
  const fyStartYear = month >= 3 ? year : year - 1; // April = month 3
  const start = new Date(fyStartYear, 3, 1).getTime();
  const end = new Date(fyStartYear + 1, 2, 31, 23, 59, 59).getTime();
  const daysLeft = Math.max(0, Math.ceil((end - nowMs) / 86_400_000));
  const isQ4 = month <= 2; // Jan, Feb, Mar
  return {
    start,
    end,
    label: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,
    daysLeft,
    isQ4
  };
}

// ── Deduction limits (current law, post-Budget 2024) ─────────────────────────

export const LIMITS = {
  SEC_80C: 150_000, // ₹1.5L
  SEC_80D_SELF: 25_000, // ₹25K self + family
  SEC_80D_PARENTS: 25_000, // ₹25K parents
  SEC_24B: 200_000, // ₹2L home loan interest (self-occupied)
  NPS_80CCD_1B: 50_000 // ₹50K over 80C, via NPS
} as const;

// ── 80C ───────────────────────────────────────────────────────────────────────

export interface Sec80CItem {
  label: string;
  amount: number;
  source: 'inferred' | 'manual';
}

/** Infer 80C-eligible amounts from stored data. Returns items with amounts > 0. */
export function inferSec80C(policies: InsurancePolicy[], liabilities: Liability[]): Sec80CItem[] {
  const items: Sec80CItem[] = [];

  // Life / term insurance premiums
  const lifePremium = policies
    .filter((p) => p.type === 'term' || p.type === 'life')
    .reduce((s, p) => s + p.annualPremium, 0);
  if (lifePremium > 0) items.push({ label: 'Life/term insurance premium', amount: lifePremium, source: 'inferred' });

  // Home loan principal repayment estimate
  const homeLoan = liabilities.find((l) => l.type === 'home_loan' && l.emiAmount && l.emiAmount > 0);
  if (homeLoan?.emiAmount) {
    const annualInterest = homeLoan.outstandingAmount * (homeLoan.interestRate / 100);
    const annualPrincipal = Math.max(0, homeLoan.emiAmount * 12 - annualInterest);
    if (annualPrincipal > 0)
      items.push({
        label: 'Home loan principal repayment (est.)',
        amount: Math.round(annualPrincipal),
        source: 'inferred'
      });
  }

  return items;
}

// ── 80D ───────────────────────────────────────────────────────────────────────

export interface Sec80DResult {
  selfPremium: number; // inferred from health policies
  parentsPremium: number; // manual entry
}

export function inferSec80D(policies: InsurancePolicy[]): number {
  return policies.filter((p) => p.type === 'health').reduce((s, p) => s + p.annualPremium, 0);
}

// ── 24B ───────────────────────────────────────────────────────────────────────

export interface Sec24BResult {
  annualInterest: number; // estimated
  hasHomeLoan: boolean;
}

export function inferSec24B(liabilities: Liability[]): Sec24BResult {
  const loan = liabilities.find((l) => l.type === 'home_loan');
  if (!loan) return { annualInterest: 0, hasHomeLoan: false };
  const annualInterest = Math.round(loan.outstandingAmount * (loan.interestRate / 100));
  return { annualInterest, hasHomeLoan: true };
}

// ── Capital gains ─────────────────────────────────────────────────────────────

export interface CapGainItem {
  name: string;
  assetClass: string;
  investedAmount: number;
  currentValue: number;
  gain: number;
  gainPct: number;
  holdingDays: number;
  isLongTerm: boolean;
  ltThresholdDays: number; // days needed for LT treatment
  taxRatePct: number | null; // null = slab rate
  estimatedTax: number | null;
}

const LONG_TERM_DAYS: Record<string, number> = {
  stock: 365,
  mf: 365,
  gold: 730, // 2 years post-Budget 2024
  fd: 1095, // 3 years
  nps: 1095,
  ppf: 0, // PPF is exempt
  other: 730
};

const LTCG_RATE: Record<string, number | null> = {
  stock: 12.5,
  mf: 12.5,
  gold: 12.5,
  fd: 12.5,
  nps: null,
  ppf: 0,
  other: 12.5
};

const STCG_RATE: Record<string, number | null> = {
  stock: 20,
  mf: 20,
  gold: null, // slab
  fd: null, // slab
  nps: null,
  ppf: 0,
  other: null
};

// Per-year equity LTCG exemption (₹1.25L as of Budget 2024)
export const EQUITY_LTCG_EXEMPTION = 125_000;

export function computeCapitalGains(holdings: Holding[], nowMs: number): CapGainItem[] {
  return holdings
    .filter((h) => {
      const cv = h.currentValue ?? h.investedAmount;
      return cv > 0 && h.assetClass !== 'ppf'; // PPF is fully exempt
    })
    .map((h) => {
      const currentValue = h.currentValue ?? h.investedAmount;
      const gain = currentValue - h.investedAmount;
      const gainPct = h.investedAmount > 0 ? (gain / h.investedAmount) * 100 : 0;
      const holdingDays = Math.floor((nowMs - h.createdAt) / 86_400_000);
      const ltDays = LONG_TERM_DAYS[h.assetClass] ?? 730;
      const isLongTerm = holdingDays >= ltDays;
      const rate = isLongTerm ? (LTCG_RATE[h.assetClass] ?? null) : (STCG_RATE[h.assetClass] ?? null);

      let estimatedTax: number | null = null;
      if (gain > 0 && rate !== null) {
        if (isLongTerm && (h.assetClass === 'stock' || h.assetClass === 'mf')) {
          // Apply ₹1.25L exemption across all equity LTCG — approximated per holding here
          estimatedTax = Math.max(0, gain - EQUITY_LTCG_EXEMPTION) * (rate / 100);
        } else {
          estimatedTax = gain * (rate / 100);
        }
      }

      return {
        name: h.name,
        assetClass: h.assetClass,
        investedAmount: h.investedAmount,
        currentValue,
        gain,
        gainPct,
        holdingDays,
        isLongTerm,
        ltThresholdDays: ltDays,
        taxRatePct: rate,
        estimatedTax
      };
    })
    .filter((item) => item.gain !== 0 || item.holdingDays < item.ltThresholdDays) // show gains and soon-to-mature holdings
    .sort((a, b) => b.gain - a.gain);
}

// ── Combined summary ──────────────────────────────────────────────────────────

export interface TaxSummary {
  fy: FYInfo;
  inferred80C: Sec80CItem[];
  inferred80DAmount: number;
  sec24B: Sec24BResult;
  capGains: CapGainItem[];
  totalEquityLtcg: number;
  totalEquityStcg: number;
  totalOtherLtcg: number;
  totalOtherStcg: number;
}

export function computeTaxSummary(
  policies: InsurancePolicy[],
  liabilities: Liability[],
  holdings: Holding[],
  nowMs: number
): TaxSummary {
  const fy = currentFY(nowMs);
  const inferred80C = inferSec80C(policies, liabilities);
  const inferred80DAmount = inferSec80D(policies);
  const sec24B = inferSec24B(liabilities);
  const capGains = computeCapitalGains(holdings, nowMs);

  const equityLtcg = capGains.filter((g) => (g.assetClass === 'stock' || g.assetClass === 'mf') && g.isLongTerm);
  const equityStcg = capGains.filter((g) => (g.assetClass === 'stock' || g.assetClass === 'mf') && !g.isLongTerm);
  const otherLtcg = capGains.filter((g) => g.assetClass !== 'stock' && g.assetClass !== 'mf' && g.isLongTerm);
  const otherStcg = capGains.filter((g) => g.assetClass !== 'stock' && g.assetClass !== 'mf' && !g.isLongTerm);

  return {
    fy,
    inferred80C,
    inferred80DAmount,
    sec24B,
    capGains,
    totalEquityLtcg: equityLtcg.reduce((s, g) => s + Math.max(0, g.gain), 0),
    totalEquityStcg: equityStcg.reduce((s, g) => s + Math.max(0, g.gain), 0),
    totalOtherLtcg: otherLtcg.reduce((s, g) => s + Math.max(0, g.gain), 0),
    totalOtherStcg: otherStcg.reduce((s, g) => s + Math.max(0, g.gain), 0)
  };
}

export const EQUITY_LTCG_RATE = 0.125;
export const EQUITY_STCG_RATE = 0.2;
export const OTHER_LTCG_RATE = 0.125;

export interface CapitalGainsTax {
  equityLtcgTax: number;
  equityStcgTax: number;
  otherLtcgTax: number;
  /** LTCG tax across equity (post-exemption) + other assets. */
  totalLtcgTax: number;
  totalStcgTax: number;
  /** Combined estimated tax shown in the summary (equity + other LTCG, equity STCG). */
  totalTax: number;
}

/** Estimates capital-gains tax from the aggregated gain totals in a TaxSummary. */
export function computeCapitalGainsTax(
  s: Pick<TaxSummary, 'totalEquityLtcg' | 'totalEquityStcg' | 'totalOtherLtcg'>
): CapitalGainsTax {
  const equityLtcgTax = Math.max(0, s.totalEquityLtcg - EQUITY_LTCG_EXEMPTION) * EQUITY_LTCG_RATE;
  const equityStcgTax = s.totalEquityStcg * EQUITY_STCG_RATE;
  const otherLtcgTax = s.totalOtherLtcg * OTHER_LTCG_RATE;
  const totalLtcgTax = equityLtcgTax + otherLtcgTax;
  const totalStcgTax = equityStcgTax;
  return {
    equityLtcgTax,
    equityStcgTax,
    otherLtcgTax,
    totalLtcgTax,
    totalStcgTax,
    totalTax: totalLtcgTax + totalStcgTax
  };
}
