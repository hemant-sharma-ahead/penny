import { useState } from 'react';

/**
 * Shared "which bucket-card is expanded" state (extracted 2026-08-14 from `TransactionsStage.tsx`, per
 * manual-testing gap #2) — one bucket auto-expands (whichever `defaultExpandedKey` the caller computed,
 * e.g. "whichever non-empty bucket most needs attention first"), and stays on that computed default
 * until the user manually toggles THAT bucket; toggling one never affects its siblings' own auto/manual
 * state. Generic over the caller's own bucket-key union so Accounts (`'needsReview' | 'ready' |
 * 'skipped'`), Categories (same three), and Transactions (`'attention' | 'ready' | 'skipped' |
 * 'duplicate'`) each get their own independent state shape without a shared literal union.
 *
 * Promoted from `features/import/review/` to `hooks/` on 2026-08-15 for the same reason as this file's
 * sibling `components/shared/BucketCard.tsx` — SMS Tracking's own review queue
 * (docs/plans/sms-transaction-tracking.md §7) needed the identical mechanism, and a feature module may
 * not import another feature module's file. Every pre-existing consumer was updated to this new path;
 * behavior is unchanged.
 */
export function useBucketExpansion<T extends string>(defaultExpandedKey: T | null) {
  const [manuallyExpanded, setManuallyExpanded] = useState<Partial<Record<T, boolean>>>({});

  function isExpanded(key: T): boolean {
    return manuallyExpanded[key] ?? key === defaultExpandedKey;
  }
  function toggle(key: T) {
    setManuallyExpanded((prev) => ({ ...prev, [key]: !isExpanded(key) }));
  }

  return { isExpanded, toggle };
}
