import type { Account, Expense } from '@/core/db/types';
import { delta, type CandidateTxn } from '@/core/accounts/balanceCalculator';
import type { ParsedStatementRow } from './types';

/**
 * Opening-balance capture + anchor-shift (docs/plans/bank-balance-sync.md §3 decision #10, §5, §7
 * Stage 3). Pure helpers only — `apps/mobile/src/features/bank-import/useBankImport.ts`'s commit flow
 * owns detecting when to run these and writing the resulting `Account` fields.
 */

interface CoveredRangeLike {
  start: number;
  end: number;
}

/**
 * §10a's trigger: true when this account has never had a completed bank-statement import before —
 * about statement-import history specifically, NOT whether the account has any transactions at all.
 * An account with only manually-entered / Cashew / MoneyView-sourced data has never had a real
 * statement import, so this still returns `true` for it.
 */
export function isFirstEverImport(coveredRanges: CoveredRangeLike[] | undefined): boolean {
  return (coveredRanges ?? []).length === 0;
}

/**
 * The account's current effective opening-balance anchor date (§3 decision #10/§14) —
 * `openingBalanceAsOfDate` if explicitly set, otherwise the earliest existing covered range's own
 * `start` (an unset date means the anchor was always implicit "before everything currently covered").
 * `undefined` only when neither exists — exactly the first-ever-import case, where "anchor shift"
 * doesn't apply (there's nothing yet to shift).
 */
export function currentAnchorDate(
  account: Pick<Account, 'openingBalanceAsOfDate' | 'coveredStatementRanges'>
): number | undefined {
  if (account.openingBalanceAsOfDate !== undefined) return account.openingBalanceAsOfDate;
  const ranges = account.coveredStatementRanges ?? [];
  if (ranges.length === 0) return undefined;
  // `noUncheckedIndexedAccess` types `Math.min(...array)` fine (it's not an index read), but the
  // mapped array itself needs no per-element guard since `.map` never introduces `undefined` here.
  return Math.min(...ranges.map((r) => r.start));
}

/**
 * §14's trigger: true when a new import's own date range starts earlier than the account's current
 * effective anchor. Mutually exclusive with {@link isFirstEverImport} by construction — an account
 * with no covered ranges has no anchor yet to shift; that case is the opening-balance-confirm flow's
 * own trigger instead.
 */
export function isAnchorShiftImport(
  newRangeStart: number,
  account: Pick<Account, 'openingBalanceAsOfDate' | 'coveredStatementRanges'>
): boolean {
  if (isFirstEverImport(account.coveredStatementRanges)) return false;
  const anchor = currentAnchorDate(account);
  return anchor !== undefined && newRangeStart < anchor;
}

export interface OpeningBalanceSuggestion {
  /** The implied balance immediately before `asOfDate`'s first real transaction. */
  suggestedOpeningBalance: number;
  /** The statement's own earliest row's own date. */
  asOfDate: number;
}

/**
 * A statement row's own signed effect on a running balance (+credit / −debit) — mirrors
 * `balanceCalculator.ts`'s own `delta()` sign convention (`income`/credit is `+`, `expense`/debit is
 * `-`) without needing a full `CandidateTxn`/account-id context, since a not-yet-matched statement row
 * has no account side to pick between.
 */
function signedRowAmount(row: Pick<ParsedStatementRow, 'amount' | 'direction'>): number {
  return row.direction === 'debit' ? -row.amount : row.amount;
}

/**
 * Derives a suggested opening balance from a freshly-parsed statement's own first row (chronologically
 * earliest; ties broken by `rowIndex`, i.e. the file's own printed order) — docs/plans/
 * bank-balance-sync.md §5 "opening-balance capture", §7 Stage 3. Only possible when that row itself
 * carries a `balance` value (the confirmed mapping included a Balance column AND this particular row
 * had one under it — a statement can map a balance column yet still have occasional gaps in it) —
 * returns `undefined` otherwise, the mockup's "nothing parseable, manual entry required" state. A
 * suggestion to prefill a confirm prompt, never an assumption — callers must still require explicit
 * user confirmation before writing anything to `Account.openingBalance`/`openingBalanceAsOfDate`.
 *
 * **Anchor-date convention** (this module's own design decision, since the plan text left it open):
 * `asOfDate` is the first row's OWN date, not "the day before" — bank statements only carry day-level
 * granularity, so there's no independently-real "day before" value to anchor to instead. "As of
 * &lt;date&gt;" is read the standard accounting way: the balance held at the very start of that
 * calendar day, before that day's own transactions post — which is exactly what "the real balance
 * immediately before this statement's first row" means when the row and the anchor share one day. This
 * matches `docs/mockups/proposals/bank-balance-sync-v2.html` §5's own field label ("Opening balance, as
 * of 1 Apr 2026" sitting directly against the first row's own date, not the day prior). Any later
 * balance projection from this anchor must include every transaction dated `>= asOfDate` (inclusive).
 */
export function deriveOpeningBalanceSuggestion(rows: ParsedStatementRow[]): OpeningBalanceSuggestion | undefined {
  let first: ParsedStatementRow | undefined;
  for (const row of rows) {
    if (!first || row.date < first.date || (row.date === first.date && row.rowIndex < first.rowIndex)) {
      first = row;
    }
  }
  if (!first || first.balance === undefined) return undefined;
  return {
    suggestedOpeningBalance: first.balance - signedRowAmount(first),
    asOfDate: first.date
  };
}

/**
 * Builds synthetic `CandidateTxn`s from freshly-parsed (not-yet-committed) statement rows, for feeding
 * straight into `delta()`/the anchor-shift disagreement check below, before those rows have gone
 * through matching/staging into real `Expense` records. Deliberately plain `expense`/`income` only —
 * this pre-review snapshot has no way to know whether a row will end up a `transfer` (that's only
 * decided during the review step), a narrow, documented simplification of this Stage 3 check (see
 * {@link computeAnchorShiftCheck}'s own doc comment).
 */
export function rowsAsCandidateTxns(rows: ParsedStatementRow[], accountId: string): CandidateTxn[] {
  return rows.map((row) => ({
    accountId,
    amount: row.amount,
    type: row.direction === 'debit' ? 'expense' : 'income'
  }));
}

export interface AnchorShiftCheck {
  newOpeningBalance: number;
  newAnchorDate: number;
  oldOpeningBalance: number;
  oldAnchorDate: number;
  /** What the new anchor + every recorded transaction between the two anchor dates implies the OLD
   *  anchor date's own balance should have been. */
  impliedOldBalance: number;
  /** `impliedOldBalance - oldOpeningBalance` — positive means the backfill implies a HIGHER old
   *  balance than currently recorded. */
  diff: number;
  /** `|diff| <= toleranceRupees` — the clean §14a case when true, the §14b disagreement when false. */
  agrees: boolean;
}

/**
 * The anchor-shift disagreement check (docs/plans/bank-balance-sync.md §3 decision #10/§14a/§14b, §7
 * Stage 3) — projects forward from the NEW, earlier anchor to see what balance that implies at the OLD
 * anchor's own date, and compares it to the OLD `openingBalance` (±₹1 tolerance by default, the same
 * convention the now-removed `balanceCheck.ts` used). Reuses `delta()` (not a reinvented sign convention) — never
 * auto-resolves anything, purely a read-only diagnostic; the caller decides what to do with
 * `agrees`/`diff` (§14b: surface a three-choice prompt, never auto-resolve).
 *
 * `txnsBetweenAnchors` must be pre-scoped by the caller to exactly the window
 * `[newAnchorDate, oldAnchorDate)` — new-anchor-date INCLUSIVE (its own day's activity is part of what
 * the new anchor is "before", see `deriveOpeningBalanceSuggestion`'s doc comment), old-anchor-date
 * EXCLUSIVE (that date's own transactions are already accounted for by the OLD anchor's own "before
 * that day" semantics — including them here would double-count against `oldOpeningBalance`).
 *
 * **Known Stage 3 simplification, intentionally left as a Stage 4 hook**: this is a narrow,
 * self-contained calculation scoped to just the two anchor points (§7 Stage 3's own stated scope) — it
 * does NOT attempt the general "recompute every checkpoint after any retrospective import" rule (§10b),
 * which needs Stage 4's full checkpoint-diff-walking engine (not built yet). In particular, if
 * `txnsBetweenAnchors` ends up containing both a pre-existing (unmatched) Penny transaction and a
 * newly-imported statement row that turn out to be the SAME real-world event once real matching runs
 * over this exact window, this check has no way to know that and could double-count it — low risk in
 * practice (the whole point of an anchor-shift is backfilling a period Penny had nothing recorded for),
 * but a real, documented limitation. **Stage 4's diagnostic engine, once built, should re-run its own
 * full recompute after any retrospective import rather than trusting this check's result as final** —
 * this comment is that hook/extension point.
 */
export function computeAnchorShiftCheck(
  accountId: string,
  newOpeningBalance: number,
  newAnchorDate: number,
  oldOpeningBalance: number,
  oldAnchorDate: number,
  txnsBetweenAnchors: CandidateTxn[],
  toleranceRupees = 1
): AnchorShiftCheck {
  const impliedOldBalance = txnsBetweenAnchors.reduce((bal, t) => bal + delta(accountId, t), newOpeningBalance);
  const diff = impliedOldBalance - oldOpeningBalance;
  return {
    newOpeningBalance,
    newAnchorDate,
    oldOpeningBalance,
    oldAnchorDate,
    impliedOldBalance,
    diff,
    agrees: Math.abs(diff) <= toleranceRupees
  };
}

/**
 * The immutable historical fact worth remembering forever about a flagged anchor-shift disagreement
 * (§3 decision #10/§14b, redesigned 2026-08-09 — see {@link recomputeAnchorAgreement}'s own doc comment
 * for the bug this fixes) — mirrors `Account['anchorReference']`'s shape exactly
 * (`packages/core/src/core/db/types/index.ts`). Declared standalone here (not derived via
 * `NonNullable<Account['anchorReference']>`) purely so this module's own exports read self-contained;
 * keep the two shapes in sync by hand if either ever changes.
 */
export interface AnchorReference {
  oldOpeningBalance: number;
  oldAnchorDate: number;
  /** The backfill's OWN original, un-back-derived implied opening balance at `Account.
   *  openingBalanceAsOfDate` (`AnchorShiftCheck.newOpeningBalance` at the moment the disagreement was
   *  first flagged) — frozen here specifically because `Account.openingBalance` itself is NOT this value
   *  once "Keep"/"Review" is chosen (see `backDerivedOpeningBalance`'s own doc comment: it's deliberately
   *  back-derived to reproduce `oldOpeningBalance`, not to preserve the backfill's own claim). Found +
   *  fixed 2026-08-09 (second pass, on-device): without this, `recomputeAnchorAgreement` had nothing left
   *  to check the disagreement against except the account's own back-derived value — which is
   *  algebraically GUARANTEED to reproduce `oldOpeningBalance` when walked through the same window,
   *  making the live check tautologically always agree, immediately erasing every "Keep, flag" disagreement
   *  the moment it was created. This field is what actually holds the disputed claim. */
  newOpeningBalance: number;
  detectedAt: number;
}

/**
 * The value to persist as the account's own new opening balance at the new, earlier anchor date when
 * the user chooses NOT to trust the newly-backfilled statement's own derivation (the "Keep"/"Review
 * rows first" branches of §14b) — back-derived so that projecting forward through the SAME window this
 * check itself used still reproduces the OLD, trusted anchor's own value exactly, preserving every
 * already-verified checkpoint after it untouched. Pure algebra on already-computed `AnchorShiftCheck`
 * fields: since `diff = impliedOldBalance - oldOpeningBalance` and `impliedOldBalance = newOpeningBalance
 * + netWindow`, back-deriving for `oldOpeningBalance` instead of `newOpeningBalance` just subtracts the
 * same `diff`.
 */
export function backDerivedOpeningBalance(check: AnchorShiftCheck): number {
  return check.newOpeningBalance - check.diff;
}

/**
 * The LIVE re-check (fixes the frozen-forever bug found via on-device testing 2026-08-09 — see
 * `docs/mockups/proposals/bank-balance-sync-v3.html`'s "#optiond" section and its follow-up callout) —
 * re-runs the exact same comparison `computeAnchorShiftCheck` made at import time, but against CURRENT
 * transactions, every time verification status is computed. This is what makes a later corrective
 * import (deleting a wrong row, adding a missing one) resolve the finding on its own, the same way a
 * checkpoint-mismatch already does (`checkpointDiagnostics.ts`) — nothing here is ever cached.
 *
 * **Deliberately projects forward from `reference.newOpeningBalance` — NEVER from the account's own
 * current `openingBalance`** (second bug, found + fixed 2026-08-09, on-device: choosing "Keep, flag"
 * showed "verified" immediately, every time, regardless of how large the real disagreement was). The
 * account's own `openingBalance` is `backDerivedOpeningBalance()`'s output — by definition the exact
 * value that reproduces `reference.oldOpeningBalance` when walked through this same window, so using it
 * here would make `agrees` tautologically always `true`. `reference.newOpeningBalance` is the backfill's
 * own, un-back-derived claim, frozen at the moment the disagreement was first detected — an independent
 * fact to actually check the CURRENT window transactions against, not something the check would trivially
 * always satisfy.
 *
 * `currentAnchorDate` must be the account's own CURRENT `openingBalanceAsOfDate` — by construction (see
 * `useBankImport.ts`'s commit-time write), it already sits at the new, earlier anchor date regardless of
 * which §14b choice was made, and is the same date `reference.newOpeningBalance` is itself as-of.
 */
export function recomputeAnchorAgreement(
  accountId: string,
  currentAnchorDate: number,
  reference: AnchorReference,
  accountTxns: Expense[],
  toleranceRupees = 1
): AnchorShiftCheck {
  const windowTxns = accountTxns.filter(
    (t) =>
      (t.accountId === accountId || t.toAccountId === accountId) &&
      t.date >= currentAnchorDate &&
      t.date < reference.oldAnchorDate
  );
  return computeAnchorShiftCheck(
    accountId,
    reference.newOpeningBalance,
    currentAnchorDate,
    reference.oldOpeningBalance,
    reference.oldAnchorDate,
    windowTxns,
    toleranceRupees
  );
}
