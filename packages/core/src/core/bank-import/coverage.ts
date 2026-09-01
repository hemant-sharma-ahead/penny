import type { BankStatementImportRecord, Expense } from '@/core/db/types';
import { daysBetween } from '@/lib/date';

/**
 * Covered-date-range tracking + continuity gate (docs/plans/bank-balance-sync.md §5/§7 Stage 2,
 * §11b/§15). Pure helpers only — `useBankImport.ts`'s commit flow owns building/persisting the actual
 * `ImportBatchSummary` entries on `Account.coveredStatementRanges`.
 */

export interface DateRange {
  start: number;
  end: number;
}

export interface CoverageGap {
  /** First day of the gap — the day right after the closest prior range's own end. */
  gapStart: number;
  /** Last day of the gap — the day right before the new range's own start. */
  gapEnd: number;
}

function addDays(epochMs: number, days: number): number {
  const d = new Date(epochMs);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/**
 * Compares a new import's own actual date range against an account's existing covered ranges
 * (§11b's table): a new range that picks up exactly where the closest prior one ended → no gap
 * (`null`); a new range that leaves a genuine gap → the gap's own boundary dates; an overlapping range
 * → also `null` — overlap is never treated as an error (§15), only a genuine empty span between ranges
 * is. Advisory only — callers must never block an import on this, only warn (§11b/§5).
 */
export function detectCoverageGap(newRange: DateRange, existingRanges: DateRange[]): CoverageGap | null {
  const priorEnds = existingRanges.filter((r) => r.end < newRange.start).map((r) => r.end);
  if (priorEnds.length === 0) return null;
  const closestPriorEnd = Math.max(...priorEnds);
  // Adjacent (next calendar day) or closer → no real gap. `daysBetween` rounds, so this is robust to
  // any incidental time-of-day noise on either boundary.
  if (daysBetween(closestPriorEnd, newRange.start) <= 1) return null;
  return { gapStart: addDays(closestPriorEnd, 1), gapEnd: addDays(newRange.start, -1) };
}

/**
 * Skipped-row count (§11a) — rows the statement file actually contained that ended up neither
 * confirmed as a match nor added as new by commit time. A plain `Math.max(0, …)` rather than trusting
 * the arithmetic to never go negative, since `matchedCount`/`addedCount` are caller-supplied tallies,
 * not something this function itself derives from the same source of truth.
 */
export function countSkippedRows(totalRows: number, matchedCount: number, addedCount: number): number {
  return Math.max(0, totalRows - matchedCount - addedCount);
}

/**
 * Merges a list of (possibly overlapping, possibly touching) date ranges into their minimal
 * non-overlapping union, sorted ascending by `start`. Exported so a caller can also render the
 * merged union directly if useful, not just consume `findStandingCoverageGaps`'s own output.
 */
export function mergeCoveredRanges(ranges: DateRange[]): DateRange[] {
  if (ranges.length === 0) return [];
  const [first, ...rest] = [...ranges].sort((a, b) => a.start - b.start);
  // Unreachable given the length check above, but `noUncheckedIndexedAccess` types a destructured
  // array element as possibly-`undefined` regardless — this direct guard narrows `first` for the type
  // checker without a non-null assertion (forbidden by this project's eslint config).
  if (first === undefined) return [];
  // `last` is a plain variable, never re-read from `merged` by index, specifically so it's never
  // subject to the same possibly-undefined narrowing problem the line above works around.
  let last: DateRange = { ...first };
  const merged: DateRange[] = [last];
  for (const r of rest) {
    // `<=` (not `<`) so two ranges that merely touch (no calendar-day gap between them) also merge —
    // membership testing below only needs "is this date inside ANY of these spans", so leaving two
    // touching-but-unmerged ranges wouldn't itself be a correctness bug, but merging keeps the union
    // minimal and avoids ever having to reason about a seam that isn't a real gap.
    if (r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      last = { ...r };
      merged.push(last);
    }
  }
  return merged;
}

/**
 * The closed-loop sweep (docs/plans/bank-balance-sync.md §3 decision #16) — a full derived re-check
 * meant to run after every import commits for an account, needing no new persisted tracking list of
 * its own. Any expense dated within the union of the account's own covered statement ranges (periods
 * its own import history claims are fully explained) that has NO corresponding
 * `BankStatementImportRecord.linkedTxnId` pointing at it is a standing, actionable gap — a genuinely
 * unexplained transaction sitting inside a period the account itself says is fully covered. Same
 * "always derived, never stored" philosophy `computeBalance()` already follows — this is a read-only
 * diagnostic, not a new mutable entity.
 *
 * Deliberately separate from, and does not touch, `deriveLoneWolves()`/`LoneWolf.status`
 * (`matcher.ts`) — that mechanism only ever runs live, during one specific import's own review
 * screen, scoped to that one statement's own date range, and stays exactly as-is (§16: "the
 * in-review-screen `'provisional'`/`'escalated'` softening ... can stay as a softer in-the-moment
 * hint ... it just stops being the *only* mechanism; the full sweep is the backstop"). This function
 * re-derives the full picture from an account's ENTIRE covered history every time it's called, so
 * nothing importable slips away silently just because the user never revisits an old review screen.
 *
 * @param coveredRanges the account's own `Account.coveredStatementRanges` (any object with a
 *   `start`/`end` — `ImportBatchSummary`'s extra fields are ignored).
 * @param expenses the account's own `Expense[]` — callers must pre-scope this to the one account
 *   being swept (this function has no `accountId` parameter and does no filtering of its own, unlike
 *   e.g. `matchStatementRows`, since every input array here is assumed already account-scoped).
 * @param importRecords the account's own `BankStatementImportRecord[]` (same pre-scoping assumption).
 */
export function findStandingCoverageGaps(
  coveredRanges: DateRange[],
  expenses: Expense[],
  importRecords: BankStatementImportRecord[]
): Expense[] {
  const union = mergeCoveredRanges(coveredRanges);
  if (union.length === 0) return [];
  const linkedIds = new Set(importRecords.map((r) => r.linkedTxnId));
  return expenses.filter((e) => !linkedIds.has(e.id) && union.some((r) => e.date >= r.start && e.date <= r.end));
}

/**
 * The account's own "statement verified till" date (mobile punch-list item 4) — the latest `end` across
 * an account's covered statement ranges' union, or `undefined` if the account has never had a statement
 * imported at all (an empty `coveredRanges` array). A one-line formula, but shared here (rather than
 * left duplicated inline) so `AccountDetailModal.tsx`'s verification banner and `AccountList.tsx`'s
 * list-tile caption always derive the exact same value from the exact same source of truth.
 */
export function computeVerifiedThroughDate(coveredRanges: DateRange[]): number | undefined {
  return coveredRanges.length === 0 ? undefined : Math.max(...coveredRanges.map((r) => r.end));
}

/**
 * The "unverified tail" sweep (mobile punch-list item 4b) — a NEW, SEPARATE signal from
 * `findStandingCoverageGaps` above, not a variant of it. That function only ever looks INSIDE the
 * union of an account's covered statement ranges (a transaction dated within a period the account
 * claims is fully explained, but with no statement row backing it). This function looks at the exact
 * opposite span: transactions dated AFTER the covered union's own end — i.e. new activity recorded
 * since the last statement was ever imported, which the closed-loop sweep above has no way to see at
 * all (there's no "covered range" for it to fall inside of). An account can be otherwise perfectly
 * clean (no checkpoint-mismatch, no anchor-disagreement, no standing-gap) and still have this: it just
 * means the user hasn't imported a fresher statement since transacting more.
 *
 * Deliberately NOT folded into `accountVerification.ts`'s `VerificationFindingKind` one-badge system —
 * see that file's own doc comment: it's a closed, 3-kind negative-finding enum with its own priority
 * ordering and existing test coverage, and this is a non-negative, independent signal ("you have newer
 * activity to verify", not "something here is wrong") shown ALONGSIDE that badge system as a third tile
 * state, never merged into it.
 *
 * Same conventions as `findStandingCoverageGaps`: a pure helper, no `accountId` parameter — every input
 * array is assumed already pre-scoped by the caller to the one account being checked. Uses the exact
 * same "not in `importRecords`'s `linkedTxnId` set" test for what counts as unexplained.
 *
 * @param coveredRanges the account's own `Account.coveredStatementRanges` (any object with a
 *   `start`/`end` — `ImportBatchSummary`'s extra fields are ignored).
 * @param expenses the account's own `Expense[]`, pre-scoped by the caller.
 * @param importRecords the account's own `BankStatementImportRecord[]`, pre-scoped by the caller.
 */
export function findUnverifiedTailExpenses(
  coveredRanges: DateRange[],
  expenses: Expense[],
  importRecords: BankStatementImportRecord[]
): Expense[] {
  const verifiedThroughDate = computeVerifiedThroughDate(coveredRanges);
  if (verifiedThroughDate === undefined) return [];
  const linkedIds = new Set(importRecords.map((r) => r.linkedTxnId));
  return expenses.filter((e) => !linkedIds.has(e.id) && e.date > verifiedThroughDate);
}
