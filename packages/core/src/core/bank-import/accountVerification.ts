import type { Account, BankStatementImportRecord, Expense } from '@/core/db/types';
import { computeCheckpointDiagnostics, type CheckpointMismatch } from './checkpointDiagnostics';
import { findStandingCoverageGaps, type DateRange } from './coverage';
import { recomputeAnchorAgreement, type AnchorReference } from './openingBalanceAnchor';

/**
 * The ONE persistent "unverified account" indicator (docs/plans/bank-balance-sync.md §9 Q1's resolved
 * decision, §7 Stage 4) — unifies three independent, previously-separate signals that an account isn't
 * fully trustworthy:
 *
 * 1. This module's own checkpoint-diff mismatch (`checkpointDiagnostics.ts`, Stage 4).
 * 2. The closed-loop standing-gap sweep (`coverage.ts`'s `findStandingCoverageGaps`, Stage 2's §3
 *    decision #16 hardening — until now only surfaced as a placeholder banner in
 *    `BankImportHistoryPage.tsx`, explicitly flagged there as needing to merge into this ONE badge).
 * 3. The opening-balance anchor-shift disagreement (`Account.anchorReference`, Stage 3 — persisted,
 *    now live-recomputed every call, redesigned 2026-08-09 — see `openingBalanceAnchor.ts`'s
 *    `recomputeAnchorAgreement` doc comment for the "frozen forever" bug this closes).
 *
 * The design choice this file makes: never show three competing badges. Every account has at most ONE
 * `activeFinding` at a time — when more than one of the three sources fires simultaneously, priority
 * order is checkpoint-mismatch > anchor-disagreement > standing-gap (most-precise/most-actionable
 * first; the standing-gap sweep is explicitly the "backstop" per decision #16's own wording, so it
 * naturally sits last). This is a real judgment call, not a spec'd order — the plan only says "one
 * status slot", not which finding wins when several are true at once; documented here so it's not
 * mistaken for an oversight.
 *
 * Each finding kind still carries its OWN raw payload (never forced into identical copy) — the UI
 * layer (not this file) is responsible for composing the exact mockup wording per kind, the same
 * division of labor `coverage.ts`/`openingBalanceAnchor.ts` already use (core returns structured facts,
 * `apps/mobile` writes the copy).
 */

/**
 * Which account types get the balance-sync checkpoint machinery at all (docs/plans/bank-balance-sync.md
 * §3/§16 Finding 2) — bank accounts only, never `credit_card` (inverted sign convention, explicitly out
 * of scope) or `cash`/`wallet` (nothing external to check them against). Moved here from
 * `apps/mobile/src/features/accounts/useAccountVerification.ts` (2026-08-10) so `apps/mobile/src/
 * features/home/` can also gate on it without a feature-to-feature cross-import (the architecture rule
 * this repo enforces via ESLint) — this is fundamentally a business-logic fact about which accounts this
 * feature applies to, not a UI-layer constant, so `packages/core` is the correct home for it regardless of
 * how many UI surfaces end up needing it.
 */
export const CHECKPOINT_ELIGIBLE = new Set<Account['type']>(['bank']);

export type VerificationFindingKind = 'checkpoint-mismatch' | 'anchor-disagreement' | 'standing-gap';

export interface AccountVerificationFinding {
  kind: VerificationFindingKind;
  /** A stable identifier of THIS specific finding's own identifying facts (docs/plans/
   *  bank-balance-sync.md §9 Q1's dismiss requirement: "scoped to the SPECIFIC finding, not a blanket
   *  permanent silence for the whole account"). Two different findings of the same kind (e.g. a
   *  checkpoint mismatch between a different pair of rows, once the original one is fixed) get
   *  different fingerprints, so dismissing one never silences the other. */
  fingerprint: string;
  checkpointMismatch?: CheckpointMismatch;
  standingGapExpenses?: Expense[];
  /** The UI-facing shape of a live-recomputed anchor-shift disagreement — deliberately NOT typed off
   *  `Account['anchorReference']` (which only stores the immutable `{oldOpeningBalance, oldAnchorDate,
   *  detectedAt}` fact) since `impliedOldBalance`/`diff` here are always freshly recomputed
   *  (`recomputeAnchorAgreement`), never stored. Kept the same shape it always had, pre-2026-08-09
   *  rename, so every existing UI consumer (`CheckOpeningBalancePage.tsx`'s `deriveImplied()`,
   *  `verificationCopy.ts`) keeps working unchanged. */
  anchorDisagreement?: {
    detectedAt: number;
    oldOpeningBalance: number;
    oldAnchorDate: number;
    impliedOldBalance: number;
    diff: number;
  };
}

export interface DismissedFinding {
  fingerprint: string;
  dismissedAt: number;
}

export interface AccountVerificationStatus {
  /** Drives the account-list badge (mockup Frame 1) — binary by design ("needs a look" vs. not; see
   *  the mockup's own note that verified/never-imported/dismissed all look identical at list level). */
  needsAttention: boolean;
  /** The one finding the detail snapshot banner (Frame 2d/2e/2b) should show — `undefined` when there
   *  is nothing currently active (states b/c: verified / never-imported). */
  activeFinding?: AccountVerificationFinding;
  /** The most recently dismissed finding that is STILL currently firing (i.e. the underlying condition
   *  hasn't actually resolved, the user just acknowledged it) — powers the muted "Reviewed — you
   *  accepted…" line (Frame 2f). `undefined` once the condition itself is gone (nothing to acknowledge
   *  anymore) or nothing was ever dismissed. */
  dismissedFinding?: AccountVerificationFinding;
  /** Every finding currently firing, dismissed or not, in priority order — mainly for tests/debugging;
   *  UI code should read `activeFinding`/`dismissedFinding`, not this directly. */
  allFindings: AccountVerificationFinding[];
}

const PRIORITY: Record<VerificationFindingKind, number> = {
  'checkpoint-mismatch': 0,
  'anchor-disagreement': 1,
  'standing-gap': 2
};

function checkpointMismatchFingerprint(m: CheckpointMismatch): string {
  return `checkpoint:${m.lastAgreeing?.expenseId ?? 'start'}:${m.firstDisagreeing.expenseId}`;
}

function standingGapFingerprint(expenses: Expense[]): string {
  return `standing-gap:${expenses
    .map((e) => e.id)
    .sort()
    .join(',')}`;
}

function anchorDisagreementFingerprint(a: AnchorReference): string {
  return `anchor:${a.detectedAt}`;
}

function pick(findings: AccountVerificationFinding[]): AccountVerificationFinding | undefined {
  return [...findings].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])[0];
}

export interface ComputeAccountVerificationStatusParams {
  accountId: string;
  openingBalance: number;
  /** `Account.openingBalanceAsOfDate` (Stage 3) — threaded straight through to
   *  `computeCheckpointDiagnostics()` (found + fixed 2026-08-09, see that function's own doc comment):
   *  without it, the checkpoint-diff walk has no way to know a backfilled transaction dated before the
   *  anchor isn't covered by `openingBalance`, and fabricates a mismatch. `undefined` (never went
   *  through a backfill/anchor-shift) preserves prior behavior exactly. */
  openingBalanceAsOfDate?: number;
  /** Every `Expense` touching this account (as `accountId` OR `toAccountId`) — pre-scoped by the
   *  caller, same assumption `findStandingCoverageGaps`/`checkpointDiagnostics.ts` already make. */
  accountTxns: Expense[];
  /** Every `BankStatementImportRecord` for this account — pre-scoped by the caller. */
  importRecords: BankStatementImportRecord[];
  coveredRanges: DateRange[];
  /** `Account.anchorReference` — the immutable historical fact only; the live comparison against it
   *  (`impliedOldBalance`/`diff`/`agrees`) is recomputed fresh below via `recomputeAnchorAgreement`,
   *  never trusted from a stored value (found + fixed 2026-08-09 — see that function's own doc
   *  comment for the "frozen forever" bug this closes). */
  anchorReference?: Account['anchorReference'];
  /** `Account.dismissedVerificationFindings`, defaults to none. */
  dismissed?: DismissedFinding[];
  toleranceRupees?: number;
}

export function computeAccountVerificationStatus(
  params: ComputeAccountVerificationStatusParams
): AccountVerificationStatus {
  const {
    accountId,
    openingBalance,
    openingBalanceAsOfDate,
    accountTxns,
    importRecords,
    coveredRanges,
    anchorReference,
    dismissed = [],
    toleranceRupees = 1
  } = params;

  const findings: AccountVerificationFinding[] = [];

  // Checkpoint-mismatch detection must NOT walk through a still-disputed anchor-shift window (found
  // 2026-08-09, reviewing this same day's live-recompute fix): once `anchorReference` is set, the
  // account's own CURRENT `openingBalance`/`openingBalanceAsOfDate` sit at the new, earlier, back-derived
  // anchor (so `computeBalance()`'s total stays correct) — but that back-derived value was calibrated to
  // reproduce the OLD anchor's own balance at `oldAnchorDate`, not to match the backfilled statement's OWN
  // originally-imported checkpoints along the way. Walking the full ledger from the new anchor would
  // therefore make every checkpoint in the disputed window disagree by a flat, spurious amount — a SECOND,
  // fabricated 'checkpoint-mismatch' finding for the exact same root cause the anchor-disagreement finding
  // below already owns, which would then WIN the account's one-badge priority order and route the user to
  // the wrong ("Update"-for-checkpoint-mismatch) formula. For mismatch-detection purposes only, use the
  // OLD, still-independently-trusted anchor instead — exactly reconstructing what this check looked like
  // before the disputed window existed. The account's REAL stored fields (used everywhere else, including
  // `CheckpointTimelinePage.tsx`'s own full-ledger display) are untouched by this — this is scoped
  // entirely to the badge/finding computation below.
  const mismatchOpeningBalance = anchorReference ? anchorReference.oldOpeningBalance : openingBalance;
  const mismatchAnchorDate = anchorReference ? anchorReference.oldAnchorDate : openingBalanceAsOfDate;

  const diagnostics = computeCheckpointDiagnostics(
    accountId,
    mismatchOpeningBalance,
    accountTxns,
    mismatchAnchorDate,
    toleranceRupees
  );
  if (diagnostics.mismatch) {
    findings.push({
      kind: 'checkpoint-mismatch',
      fingerprint: checkpointMismatchFingerprint(diagnostics.mismatch),
      checkpointMismatch: diagnostics.mismatch
    });
  }

  if (anchorReference && openingBalanceAsOfDate !== undefined) {
    const check = recomputeAnchorAgreement(
      accountId,
      openingBalanceAsOfDate,
      anchorReference,
      accountTxns,
      toleranceRupees
    );
    if (!check.agrees) {
      findings.push({
        kind: 'anchor-disagreement',
        fingerprint: anchorDisagreementFingerprint(anchorReference),
        anchorDisagreement: {
          detectedAt: anchorReference.detectedAt,
          oldOpeningBalance: check.oldOpeningBalance,
          oldAnchorDate: check.oldAnchorDate,
          impliedOldBalance: check.impliedOldBalance,
          diff: check.diff
        }
      });
    }
  }

  const standingGaps = findStandingCoverageGaps(coveredRanges, accountTxns, importRecords);
  if (standingGaps.length > 0) {
    findings.push({
      kind: 'standing-gap',
      fingerprint: standingGapFingerprint(standingGaps),
      standingGapExpenses: standingGaps
    });
  }

  const dismissedFingerprints = new Set(dismissed.map((d) => d.fingerprint));
  const active = findings.filter((f) => !dismissedFingerprints.has(f.fingerprint));
  const dismissedActive = findings.filter((f) => dismissedFingerprints.has(f.fingerprint));
  const activeFinding = pick(active);
  const dismissedFinding = pick(dismissedActive);

  // Built with conditional spreads, not bare properties, because `exactOptionalPropertyTypes` (this
  // package's tsconfig) treats an optional field as "absent or the real type", never "explicitly set to
  // `undefined`" — matches `checkpointDiagnostics.ts`'s own identical convention.
  return {
    needsAttention: active.length > 0,
    ...(activeFinding ? { activeFinding } : {}),
    ...(dismissedFinding ? { dismissedFinding } : {}),
    allFindings: findings
  };
}
