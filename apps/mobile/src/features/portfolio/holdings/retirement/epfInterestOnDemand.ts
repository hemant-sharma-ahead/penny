// On-demand EPF interest helpers (2026-08-08) — see docs/plans/epf-passbook-import.md §6.3/§10.3/§10.5.
// Deliberately NOT part of `packages/core` — every function here is thin orchestration over the
// already-built, already-tested core primitives (`buildEpfInterestInput`, `calculateEpfInterestForYear`,
// `getInterestRateForFy`), specific to how *this* screen (`RetirementCard.tsx`/`RetirementSheets.tsx`)
// needs to call them. Nothing here recomputes or second-guesses the core accrual rule itself.
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';
import {
  buildEpfInterestInput,
  calculateEpfInterestForYear,
  type EpfInterestCalculationResult
} from '@/core/portfolio/epfInterestCalculator';
import { epfResolveTxnEmployer } from '@/core/portfolio/epfCalculations';
import type { EpfRateTable } from '@/core/portfolio/epfInterestRates';

/** Which financial year (start year) a given epoch-ms date falls inside. */
export function dateToFyStartYear(ms: number): number {
  const d = new Date(ms);
  return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fyLabel(fyStartYear: number): string {
  return `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
}

/**
 * Sums every already-logged EPF transaction dated before a financial year's start into a plain
 * employee/employer balance total — the "prior closing balance" seed for an on-demand interest
 * calculation (`computeEpfInterestOnDemand` below) when no explicit `EpfBalanceCheckpoint` exists yet.
 * Deliberately a flat historical sum, not a recursive re-simulation of every earlier year's interest —
 * Penny never invents interest for a year the user didn't actually log or import (see the design doc's
 * "never silently invented" principle) — this only totals what's REALLY already on the ledger.
 *
 * Non-contribution types (interest/transfer_in/withdrawal/advance) carry one combined `amount` unless
 * they were themselves imported with a real employee/employer split (see `EpfImportFlow.ts`'s commit
 * logic) — this mirrors the exact convention `epfReconciliation.ts`'s own `existingAmounts()` already
 * uses, for consistency between "does this look like a conflict" and "what's the running balance".
 *
 * 2026-08-xx fix — scoped to ONE employer via `epfResolveTxnEmployer`, not the whole holding. Before
 * this fix, an interest calculation's OPENING balance for the FY was silently summed across every
 * employer's transactions ever logged, not just the target employer's own — the same cross-employer
 * contamination class as `buildEpfInterestInput`'s own fix (packages/core), just for the seed value
 * instead of the in-year deposits.
 */
export function sumEpfBalanceBeforeFy(
  employer: EpfEmployer,
  employers: EpfEmployer[],
  transactions: EpfTransaction[],
  fyStartYear: number
): { employee: number; employer: number } {
  const fyStartMs = new Date(fyStartYear, 3, 1).getTime();
  let employee = 0;
  let employer0 = 0;
  for (const t of transactions) {
    if (t.date >= fyStartMs) continue;
    if (epfResolveTxnEmployer(t, employers)?.id !== employer.id) continue;
    if (t.type === 'contribution') {
      employee += t.employeeAmount ?? 0;
      employer0 += t.employerAmount ?? 0;
    } else if (t.type === 'transfer_in' || t.type === 'interest') {
      employee += t.employeeAmount ?? t.amount ?? 0;
      employer0 += t.employerAmount ?? 0;
    } else if (t.type === 'withdrawal' || t.type === 'advance') {
      employee -= t.employeeAmount ?? t.amount ?? 0;
      employer0 -= t.employerAmount ?? 0;
    }
  }
  return { employee: Math.max(0, employee), employer: Math.max(0, employer0) };
}

/** Best-effort "which employer was active for this FY" — only feeds `buildEpfInterestInput`'s own
 *  auto-estimate fallback path (real logged contributions are always preferred when present there), so
 *  imprecision here never affects a year that already has real data. Prefers the employer whose
 *  [fromDate, toDate] range overlaps the FY, then the current employer, then the most recent past one. */
export function pickEmployerForFy(employers: EpfEmployer[], fyStartYear: number): EpfEmployer | null {
  if (employers.length === 0) return null;
  const fyStartMs = new Date(fyStartYear, 3, 1).getTime();
  const fyEndMs = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime();
  const overlapping = employers.find((e) => e.fromDate <= fyEndMs && (e.toDate ?? Infinity) >= fyStartMs);
  if (overlapping) return overlapping;
  const current = employers.find((e) => !e.toDate);
  if (current) return current;
  return [...employers].sort((a, b) => b.fromDate - a.fromDate)[0] ?? null;
}

/** Runs the core accrual simulation on demand for one financial year — shared by the "calculate it for
 *  me" assistant (`EpfTransactionSheet`) and the interest-breakdown popup (`EpfAllTransactionsSheet`).
 *  Always recomputed fresh, never stored — see docs/plans/epf-passbook-import.md §10.5. */
export function computeEpfInterestOnDemand(
  employers: EpfEmployer[],
  transactions: EpfTransaction[],
  rateTable: EpfRateTable,
  fyStartYear: number
): EpfInterestCalculationResult {
  const employer = pickEmployerForFy(employers, fyStartYear);
  if (!employer) {
    return calculateEpfInterestForYear(
      {
        fyStartYear,
        monthlyContributions: [],
        openingEmployeeBalance: 0,
        openingEmployerBalance: 0
      },
      rateTable
    );
  }
  const prior = sumEpfBalanceBeforeFy(employer, employers, transactions, fyStartYear);
  const input = buildEpfInterestInput(employer, employers, transactions, fyStartYear, {
    employee: prior.employee,
    employer: prior.employer
  });
  return calculateEpfInterestForYear(input, rateTable);
}

/** Every past, fully-closed financial year (i.e. on or before the last March 31) with no `interest`-type
 *  transaction recorded at all — powers the FY-end nudge banner(s) on `RetirementCard` (doc §10.3: one
 *  banner per gap, not just the latest). Bounded to years since the earliest employer's start date. */
export function findMissingInterestFys(employers: EpfEmployer[], transactions: EpfTransaction[]): number[] {
  if (employers.length === 0) return [];
  const earliestFy = Math.min(...employers.map((e) => dateToFyStartYear(e.fromDate)));
  const currentFy = dateToFyStartYear(Date.now());
  const lastClosedFy = currentFy - 1;
  if (lastClosedFy < earliestFy) return [];

  const interestFys = new Set(transactions.filter((t) => t.type === 'interest').map((t) => dateToFyStartYear(t.date)));
  const missing: number[] = [];
  for (let fy = earliestFy; fy <= lastClosedFy; fy++) {
    if (!interestFys.has(fy)) missing.push(fy);
  }
  return missing;
}

/** The recorded total for a stored interest transaction — prefers the real employee/employer split
 *  (present when imported from a passbook or Excel export) and falls back to the single combined
 *  `amount` field every manually-typed interest entry has always used. */
export function recordedInterestTotal(t: EpfTransaction): number {
  if (t.employeeAmount != null || t.employerAmount != null) return (t.employeeAmount ?? 0) + (t.employerAmount ?? 0);
  return t.amount ?? 0;
}

/** An employer left with no `toDate` ("current") whose only real evidence (`EpfTransaction`s with a
 *  `wagesMonth`) — see doc §10.1/Task 1 — happens to be strictly behind the current real FY, paired
 *  with the last FY that evidence actually covers. */
export interface EmployerNeedingEmploymentConfirmation {
  employer: EpfEmployer;
  lastEvidenceFy: number;
}

/** Employers left "current" purely because an import had no LATER employer to bound their `toDate`
 *  against — that is NOT itself evidence the employment is still ongoing today (importing a
 *  strictly-past-FY passbook in isolation proves nothing about "now"). Powers the "Are you still
 *  working at X?" card prompt (doc §10.1/Task 1) — one per such employer, until the user explicitly
 *  answers Yes (sets `currentEmploymentConfirmed`) or No (sets `toDate`). Already-confirmed
 *  employers, employers with a real `toDate`, employers with no contribution evidence at all, and
 *  employers whose evidence reaches the current FY are all excluded — nothing to ask about. */
export function findEmployersNeedingEmploymentConfirmation(
  employers: EpfEmployer[],
  transactions: EpfTransaction[]
): EmployerNeedingEmploymentConfirmation[] {
  const currentFy = dateToFyStartYear(Date.now());
  const result: EmployerNeedingEmploymentConfirmation[] = [];
  for (const e of employers) {
    if (e.toDate || e.currentEmploymentConfirmed) continue;
    const ownContribFys = transactions
      .filter(
        (t) =>
          t.type === 'contribution' && !!t.wagesMonth && new Date(`${t.wagesMonth}-01T00:00:00`).getTime() >= e.fromDate
      )
      .map((t) => dateToFyStartYear(new Date(`${t.wagesMonth}-01T00:00:00`).getTime()));
    if (ownContribFys.length === 0) continue;
    const lastEvidenceFy = Math.max(...ownContribFys);
    if (lastEvidenceFy < currentFy) result.push({ employer: e, lastEvidenceFy });
  }
  return result;
}
