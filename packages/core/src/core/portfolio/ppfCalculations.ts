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

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Real PPF rule (verified 2026-08-08, was WRONG before this fix — a pre-existing bug, not
 *  introduced this session): the 15-year tenure is counted from the END of the financial year the
 *  account was opened in, not from the raw opening date itself. An account opened 10-Jul-2015 (within
 *  FY2015-16, which ends 31-Mar-2016) matures 15 years after that FY-end — 31-Mar-2031, i.e. 1-Apr-2031
 *  — NOT 10-Jul-2030 (what a naive "opening date + 15 calendar years" calculation gives, which is what
 *  this function did before). The previous formula understated the true maturity date by up to
 *  almost a full year depending on where in the FY the account was actually opened. */
export function ppfMaturityMs(openingMs: number): number {
  const openingFy = dateToFyStartYear(openingMs);
  return new Date(openingFy + 16, 3, 1).getTime(); // 1 April, 15 years after the opening FY's end
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

/** Total deposits for a specific financial year (start year, e.g. 2023 for FY2023-24) — powers the
 *  "See all transactions" popup's per-FY progress bars (one per year in the ledger, not just the
 *  live one). `ppfThisYearDeposits` below is just this called with the current FY. */
export function ppfDepositsForFy(txns: PpfTransaction[], fyStartYear: number): number {
  const fyStartMs = new Date(fyStartYear, 3, 1).getTime();
  const fyEndMs = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime();
  return txns
    .filter((t) => t.type === 'deposit' && t.date >= fyStartMs && t.date <= fyEndMs)
    .reduce((s, t) => s + t.amount, 0);
}

export function ppfThisYearDeposits(txns: PpfTransaction[]): number {
  return ppfDepositsForFy(txns, dateToFyStartYear(ppfFyStart().getTime()));
}

export function isBeforeFifth(dateMs: number): boolean {
  return new Date(dateMs).getDate() <= 5;
}

/** Which financial year (start year) a given date falls inside — April through December belong to
 *  the FY starting that same calendar year; January through March belong to the FY that started the
 *  previous calendar year. Same 3-line helper EPF's own files already duplicate locally rather than
 *  share (`epfExcelExport.ts`/`epfExcelImport.ts`) — kept here, exported, so PPF's own new files
 *  (`ppfInterestCalculator.ts`, `ppfReconciliation.ts`) have one shared copy instead of a third. */
export function dateToFyStartYear(ms: number): number {
  const d = new Date(ms);
  return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fyLabel(fyStartYear: number): string {
  return `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
}

/** Running balance as of the end of a given financial year (deposits/interest add, withdrawals
 *  subtract) — the input the partial-withdrawal formula below needs (balance "at the end of" a
 *  specific year, not the account's current balance). */
export function ppfBalanceAsOfFyEnd(txns: PpfTransaction[], fyEndYear: number): number {
  const cutoffMs = new Date(fyEndYear + 1, 2, 31, 23, 59, 59, 999).getTime();
  return txns
    .filter((t) => t.date <= cutoffMs)
    .reduce((sum, t) => sum + (t.type === 'withdrawal' ? -t.amount : t.amount), 0);
}

export interface PpfWithdrawalEligibility {
  eligible: boolean;
  /** The financial year (start year) partial withdrawal first becomes available — always
   *  `openingFyStartYear + 6` (real rule: allowed from the 7th financial year onward, i.e. after
   *  completing 6 full years), shown regardless of current eligibility so a not-yet-eligible account
   *  can still say "eligible from FY X". */
  eligibleFromFy: number;
  /** 0 when not yet eligible. When eligible: 50% of whichever is LOWER — the balance at the end of
   *  the 4th financial year preceding the current one, or the balance at the end of the immediately
   *  preceding one (the real PPF partial-withdrawal formula). Rounded to the nearest rupee. */
  maxWithdrawable: number;
}

/** Real PPF partial-withdrawal rule (verified 2026-08-08): allowed once per financial year, from the
 *  7th financial year onward, capped at 50% of the LOWER of (balance at the end of the 4th preceding
 *  FY, balance at the end of the immediately preceding FY). Returns `null` only when the account's
 *  opening date isn't known at all — never guesses a starting point. */
export function ppfWithdrawalEligibility(
  txns: PpfTransaction[],
  ppfOpeningDate: number | undefined
): PpfWithdrawalEligibility | null {
  if (ppfOpeningDate == null) return null;
  const openingFy = dateToFyStartYear(ppfOpeningDate);
  const eligibleFromFy = openingFy + 6;
  const currentFy = dateToFyStartYear(Date.now());
  const eligible = currentFy >= eligibleFromFy;
  if (!eligible) return { eligible, eligibleFromFy, maxWithdrawable: 0 };

  const fourthPrecedingBalance = ppfBalanceAsOfFyEnd(txns, currentFy - 4);
  const immediatePrecedingBalance = ppfBalanceAsOfFyEnd(txns, currentFy - 1);
  const base = Math.min(fourthPrecedingBalance, immediatePrecedingBalance);
  const maxWithdrawable = Math.max(0, Math.round(base * 0.5));
  return { eligible, eligibleFromFy, maxWithdrawable };
}

export function ppfBuildCardData(meta: AssetMeta, balance: number): PpfCardData {
  const now = Date.now();
  const txns: PpfTransaction[] = meta.ppfTransactions ?? [];
  const sortedTxns = [...txns].sort((a, b) => b.date - a.date);
  const maturityMs = meta.ppfOpeningDate ? ppfMaturityMs(meta.ppfOpeningDate) : null;
  const yearsLeft = maturityMs ? Math.max(0, (maturityMs - now) / YEAR_MS) : null;
  // Anchored to `maturityMs` (not the raw opening date) so `yearsElapsed + yearsLeft` always sums to
  // exactly 15 and the maturity progress bar can never disagree with the "N yrs left" text next to
  // it — both now derive from the one corrected FY-end-based maturity date, not two independently
  // (and, before this fix, inconsistently) computed anchors.
  const yearsElapsed = maturityMs != null ? Math.min(15, Math.max(0, 15 - (maturityMs - now) / YEAR_MS)) : null;
  const annualContrib = meta.annualContribution ?? 0;
  const projected =
    yearsLeft != null && annualContrib > 0 ? ppfProjectedCorpus(balance, annualContrib, Math.ceil(yearsLeft)) : null;
  const fyDeposits = ppfThisYearDeposits(txns);
  const fyPct = Math.min(100, (fyDeposits / PPF_MAX_ANNUAL) * 100);
  const nowMonth = new Date(now).getMonth();
  const showAprilTip = (nowMonth === 2 || nowMonth === 3) && fyDeposits === 0;
  return { sortedTxns, maturityMs, yearsLeft, yearsElapsed, projected, fyDeposits, fyPct, showAprilTip };
}
