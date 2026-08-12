import type { AccountVerificationFinding } from '@/core/bank-import/accountVerification';
import { formatCurrency } from '@/lib/formatters';
import { formatDateShort } from '@/lib/date';

/**
 * Composes the exact mockup copy (`docs/mockups/proposals/bank-balance-sync-v2.html` Frame 2d/2e/2b)
 * per finding kind — deliberately kept OUT of `core/bank-import/accountVerification.ts`, which returns
 * only structured facts (fingerprint + raw payload), matching this codebase's existing division of
 * labor (`coverage.ts`/`openingBalanceAnchor.ts` return data; `apps/mobile` writes the copy) rather than
 * duplicating locale-aware date/currency formatting inside `packages/core`.
 */

export interface VerificationCopy {
  /** One-line summary — the collapsed-banner text (Frame 2d) for a `'steps-partway'` checkpoint
   *  mismatch; also used as the sole headline for findings with no separate collapsed state. */
  headline: string;
  /** Fuller diagnostic paragraph — the expanded-banner text (Frame 2e/2b). */
  detail: string;
  /** `'investigate'` → drills into the transaction list (Frame 3, `'steps-partway'` only).
   *  `'check-opening-balance'` → the dedicated opening-balance destination (Frame 2b, `'flat-from-start'`
   *  checkpoint mismatches AND anchor disagreements alike — "one status slot, two possible causes"). */
  action: 'investigate' | 'check-opening-balance';
  actionLabel: string;
}

export function describeFinding(finding: AccountVerificationFinding): VerificationCopy {
  if (finding.kind === 'checkpoint-mismatch' && finding.checkpointMismatch) {
    const m = finding.checkpointMismatch;
    const absDiff = formatCurrency(Math.abs(m.diff));
    if (m.signature === 'steps-partway' && m.lastAgreeing) {
      const lastDate = formatDateShort(m.lastAgreeing.date);
      const firstDate = formatDateShort(m.firstDisagreeing.date);
      return {
        headline: `Balance mismatch between ${lastDate} and ${firstDate}, ${absDiff}.`,
        detail: `Every checkpoint agreed until ${lastDate}, then jumped to a steady ${m.diff > 0 ? '+' : '−'}${absDiff} from ${firstDate} on. Signature: steps in partway, then holds steady → look for one missing or duplicate transaction in that window, not a wrong opening balance.`,
        action: 'investigate',
        actionLabel: 'Investigate'
      };
    }
    // 'flat-from-start'
    const firstDate = formatDateShort(m.firstDisagreeing.date);
    if (m.diffStaysConstant === false) {
      // The opening balance is still the right first thing to check (the very first checkpoint was
      // never right either), but a later checkpoint disagreeing by a DIFFERENT amount means there's
      // evidently also a second, separate issue later on — an honest caveat, not an alarm (see
      // docs/plans/bank-balance-sync.md §10c/§17's "known limitation" callouts for the tone to match).
      return {
        headline: `Your very first checkpoint (${firstDate}) already disagreed by ${absDiff} — and the gap changes again later on.`,
        detail:
          'Signature: disagreement from day one, but not flat — check your opening balance first, but the gap size also changes later on, so there may be more than one issue.',
        action: 'check-opening-balance',
        actionLabel: 'Check opening balance'
      };
    }
    return {
      headline: `Every checkpoint has disagreed by a constant ${absDiff}, all the way back to your very first one (${firstDate}).`,
      detail: 'Signature: flat from day one, never zero → check your opening balance, not a missing transaction.',
      action: 'check-opening-balance',
      actionLabel: 'Check opening balance'
    };
  }

  if (finding.kind === 'anchor-disagreement' && finding.anchorDisagreement) {
    const a = finding.anchorDisagreement;
    const anchorDate = formatDateShort(a.oldAnchorDate);
    return {
      headline: `Your opening balance may be off by ${formatCurrency(Math.abs(a.diff))} as of ${anchorDate}.`,
      detail: `A later statement implied your ${anchorDate} balance should have been ${formatCurrency(a.impliedOldBalance)}, not ${formatCurrency(a.oldOpeningBalance)} — flagged for later instead of resolved automatically.`,
      action: 'check-opening-balance',
      actionLabel: 'Check opening balance'
    };
  }

  // 'standing-gap'
  const count = finding.standingGapExpenses?.length ?? 0;
  return {
    headline:
      count === 1
        ? '1 transaction in a covered period has no matching statement line.'
        : `${count} transactions in covered periods have no matching statement line.`,
    detail:
      'These fall inside a period your import history says is fully covered, but no statement row explains them — possibly a duplicate, a mis-logged entry, or something missing from a future re-import.',
    action: 'investigate',
    actionLabel: 'View transactions'
  };
}

/** The muted "Reviewed — you accepted…" acknowledgement line (Frame 2f). `dismissedAt` is `undefined`
 *  only in a defensive/should-never-happen case (the dismissal record went missing) — the sentence
 *  still reads fine without a trailing date rather than a component calling `Date.now()` at render
 *  time to paper over it (an impure call during render, flagged by this project's own React-purity
 *  lint rule). */
export function describeDismissed(finding: AccountVerificationFinding, dismissedAt: number | undefined): string {
  const when = dismissedAt !== undefined ? ` on ${formatDateShort(dismissedAt)}` : '';
  if (finding.kind === 'checkpoint-mismatch' && finding.checkpointMismatch) {
    const m = finding.checkpointMismatch;
    const absDiff = formatCurrency(Math.abs(m.diff));
    if (m.signature === 'steps-partway' && m.lastAgreeing) {
      return `Reviewed — you accepted the ${absDiff} variance between ${formatDateShort(m.lastAgreeing.date)} and ${formatDateShort(m.firstDisagreeing.date)}${when}.`;
    }
    const variance =
      m.diffStaysConstant === false
        ? `${absDiff} variance (which also changes later on)`
        : `${absDiff} constant variance`;
    return `Reviewed — you kept your existing opening balance despite a ${variance}${when}.`;
  }
  if (finding.kind === 'anchor-disagreement' && finding.anchorDisagreement) {
    return `Reviewed — you kept your existing opening balance despite a ${formatCurrency(Math.abs(finding.anchorDisagreement.diff))} disagreement${when}.`;
  }
  const count = finding.standingGapExpenses?.length ?? 0;
  return `Reviewed — you acknowledged ${count === 1 ? '1 unexplained transaction' : `${count} unexplained transactions`}${when}.`;
}
