import { useCallback, useMemo } from 'react';
import type { Account } from '@/core/db/types';
import { accountsRepo } from '@/core/db/repositories';
import type { AccountVerificationFinding } from '@/core/bank-import/accountVerification';
import { notifyAccountsChanged } from '@/hooks/useDataRefresh';

/**
 * Extracted from `CheckOpeningBalancePage.tsx` (2026-08-09, alongside the `Account.anchorReference`
 * live-recompute fix) so the SAME update/dismiss logic can also be reused by
 * `CheckpointTimelinePage.tsx`'s new anchor-boundary divider (docs/plans/bank-balance-sync.md §7
 * Stage 3/4's "two self-consistent halves, one explicit boundary marker" design) — one write path, not
 * two copies to keep in sync.
 */

export interface OpeningBalanceImplied {
  currentBalance: number;
  currentAsOfDate: number | undefined;
  impliedBalance: number;
  fingerprint: string;
  /** Which of the "one status slot, two possible causes" produced this — gates the "view full
   *  reconciliation table" secondary affordance, which only makes sense when there's an actual
   *  checkpoint timeline to show. */
  kind: AccountVerificationFinding['kind'];
  /** `CheckpointMismatch.diffStaysConstant`, `undefined` for an anchor-disagreement (no checkpoint
   *  history to check this against). `false` means a later checkpoint disagrees by a DIFFERENT amount
   *  than the first one — an honest caveat that this fix alone may not fully resolve things. */
  diffStaysConstant?: boolean;
}

/** Extracts the "was ₹X as of D" / "implied ₹Y" numbers from whichever of the two causes is active
 *  (docs/plans/bank-balance-sync.md §7 Stage 3's "one status slot, two possible causes" note) — a
 *  `'flat-from-start'` checkpoint mismatch, or an anchor disagreement. Returns `undefined` for any other
 *  finding kind (or no finding at all — nothing currently flagged). */
function deriveImplied(
  account: Account,
  finding: AccountVerificationFinding | undefined
): OpeningBalanceImplied | undefined {
  if (!finding) return undefined;
  if (finding.kind === 'checkpoint-mismatch' && finding.checkpointMismatch?.signature === 'flat-from-start') {
    const m = finding.checkpointMismatch;
    return {
      currentBalance: account.openingBalance,
      currentAsOfDate: account.openingBalanceAsOfDate ?? m.firstDisagreeing.date,
      impliedBalance: account.openingBalance + m.diff,
      fingerprint: finding.fingerprint,
      kind: finding.kind,
      // Conditional spread, not a bare property, per this codebase's `exactOptionalPropertyTypes`
      // convention (see checkpointDiagnostics.ts/accountVerification.ts's own identical pattern).
      ...(m.diffStaysConstant !== undefined ? { diffStaysConstant: m.diffStaysConstant } : {})
    };
  }
  if (finding.kind === 'anchor-disagreement' && finding.anchorDisagreement) {
    const a = finding.anchorDisagreement;
    return {
      currentBalance: a.oldOpeningBalance,
      currentAsOfDate: a.oldAnchorDate,
      impliedBalance: a.impliedOldBalance,
      fingerprint: finding.fingerprint,
      kind: finding.kind
    };
  }
  return undefined;
}

/**
 * The "update"/"dismiss" write actions for whichever "one status slot, two possible causes" finding is
 * active on an account — a `'flat-from-start'` checkpoint mismatch, or a live anchor-shift disagreement.
 * `finding` should be the caller's own `AccountVerificationStatus`-derived finding (NOT necessarily
 * `activeFinding` — a caller like `CheckpointTimelinePage`'s anchor-boundary divider deliberately looks
 * up the anchor-disagreement finding specifically from `allFindings`, independent of the priority order
 * that might otherwise hide it behind a higher-priority checkpoint-mismatch elsewhere on the page).
 */
export function useOpeningBalanceResolution(account: Account | null, finding: AccountVerificationFinding | undefined) {
  const implied = useMemo(() => (account ? deriveImplied(account, finding) : undefined), [account, finding]);

  /**
   * "Update to ₹X" — the write formula is NOT the same for both causes:
   *
   * - `'checkpoint-mismatch'` (`'flat-from-start'`): `implied.impliedBalance`/`implied.currentAsOfDate`
   *   are already expressed AT THE ACCOUNT'S OWN CURRENT ANCHOR DATE, so writing them straight into
   *   `openingBalance`/`openingBalanceAsOfDate` is correct as-is — unchanged from this function's
   *   original, pre-extraction form.
   * - `'anchor-disagreement'`: `implied.impliedBalance`/`implied.currentAsOfDate` are expressed AT THE
   *   OLD ANCHOR'S OWN DATE (e.g. ₹52,000 as of 2-Apr) — but the account's CURRENT
   *   `openingBalanceAsOfDate` (after the 2026-08-09 "always move the anchor" fix) already sits at the
   *   NEW, earlier anchor date with a back-derived value there (e.g. ₹18,000 as of 1-Jan). Writing
   *   `openingBalance: 52000` while `openingBalanceAsOfDate` stayed at 1-Jan would silently reintroduce
   *   the exact double-counting bug that fix exists to close — ₹52,000 is not a valid balance AS OF
   *   1-Jan. "Update" here instead means: stop back-deriving, go back to trusting the backfill's OWN
   *   original derivation at the CURRENT (new, earlier) anchor date — algebraically,
   *   `account.openingBalance + finding.anchorDisagreement.diff` (since `diff = impliedOldBalance -
   *   oldOpeningBalance`, adding it to the back-derived current value undoes exactly the back-derivation
   *   `backDerivedOpeningBalance()` applied at import time). `openingBalanceAsOfDate` itself is left
   *   completely untouched — it's already correct. The button's own label still reads
   *   `implied.impliedBalance` (the old-anchor-dated framing is the more intuitive one for a user to
   *   read) — only the underlying WRITE uses this corrected math.
   */
  const update = useCallback(async () => {
    if (!account || !implied) return;
    const next: Account =
      implied.kind === 'anchor-disagreement' && finding?.anchorDisagreement
        ? {
            ...account,
            openingBalance: account.openingBalance + finding.anchorDisagreement.diff,
            anchorReference: undefined,
            updatedAt: Date.now()
          }
        : {
            ...account,
            openingBalance: implied.impliedBalance,
            openingBalanceAsOfDate: account.openingBalanceAsOfDate ?? implied.currentAsOfDate,
            anchorReference: undefined,
            updatedAt: Date.now()
          };
    await accountsRepo.put(next);
    notifyAccountsChanged();
  }, [account, implied, finding]);

  const dismiss = useCallback(async () => {
    if (!account || !implied) return;
    const next: Account = {
      ...account,
      dismissedVerificationFindings: [
        ...(account.dismissedVerificationFindings ?? []).filter((d) => d.fingerprint !== implied.fingerprint),
        { fingerprint: implied.fingerprint, dismissedAt: Date.now() }
      ],
      updatedAt: Date.now()
    };
    await accountsRepo.put(next);
    notifyAccountsChanged();
  }, [account, implied]);

  return { implied, update, dismiss };
}
