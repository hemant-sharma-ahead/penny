import { useState } from 'react';
import { View, Text } from 'react-native';
import { Button, Banner, ConfirmDialog } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { FailedImportRow } from '@/core/import/importWriter';

interface DoneStepProps {
  succeededCount: number;
  failed: FailedImportRow[];
  activityLogId: string | null;
  undone: boolean;
  retrying: boolean;
  /** How many rejected rows the user explicitly discarded (2026-08-14, redesign §9.1/Issue #1) — never
   *  silently vanish without a final count. */
  discardedCount: number;
  /** Rows still needing attention this run — left out of the commit (per §3.2, only "Staged"/"Skipped"
   *  rows are ever written) and picked up on a later re-upload pass instead. */
  stillUnresolvedCount: number;
  /** Rows excluded because their whole SOURCE ACCOUNT was skipped in the Accounts stage (2026-08-14,
   *  manual-testing gap #1) — a distinct reason from `discardedCount`/`stillUnresolvedCount`, so it gets
   *  its own dedicated line rather than being folded into either. Broken down PER ACCOUNT (2026-08-23,
   *  item 74 — was one opaque combined number before this fix) so the loss is legible, e.g. "142
   *  transactions skipped — Freecharge (89), Paytm (53)" instead of a bare "142 skipped". */
  accountSkipped: { accountName: string; count: number }[];
  /** True when this run was ended early via the Import Progress screen's Cancel confirm (2026-08-14,
   *  redesign §14 item 8), rather than running to completion. Distinct from `hasFailures` below (an
   *  actual per-row write error) — cancelling is a deliberate, successful user action, so it gets its
   *  own warning-amber (not danger) framing and its own copy, leading with what's already safe vs.
   *  what's left — same shape as the "still unresolved" framing, but distinctly worded so a stop is
   *  never confused with a category left unresolved. */
  cancelled?: boolean;
  /** Only meaningful when `cancelled` — how many of THIS run's rows were never attempted because the
   *  write loop stopped early. */
  cancelledRemainingCount?: number;
  /** Set only when `commitAndImport()` itself threw something genuinely UNEXPECTED (2026-08-14, severe
   *  bug found in verification) — never for an already-handled per-row write failure (`failed`, above)
   *  or a deliberate `cancelled`. Takes PRIORITY over both of those in the title/icon below: a genuine
   *  crash is neither an expected outcome (per-row failure) nor a deliberate one (cancel), so it gets
   *  its own danger-red framing distinct from either's warning-amber. Whatever `succeededCount` already
   *  reflects at the point of the throw is still real, already-written data — never rolled back. */
  importError?: string | null;
  onRetryFailed: () => void;
  onUndo: () => Promise<void>;
  onDone: () => void;
}

/** RN port of apps/web-react/src/features/import/DoneStep.tsx — adds partial-success handling (retry
 *  failed rows) and undo-the-whole-batch, both new since the 2026-07-28 redesign (the prior mobile
 *  DoneStep only ever showed a plain success count). */
export function DoneStep({
  succeededCount,
  failed,
  activityLogId,
  undone,
  retrying,
  discardedCount,
  stillUnresolvedCount,
  accountSkipped,
  cancelled = false,
  cancelledRemainingCount = 0,
  importError = null,
  onRetryFailed,
  onUndo,
  onDone
}: DoneStepProps) {
  const theme = useThemeColors();
  const [undoing, setUndoing] = useState(false);
  // Found 2026-08-27, real-user report: this fired immediately on tap, with no confirmation — a
  // single mis-tap right after a large successful import could silently remove all of it. Same
  // `ConfirmDialog` pattern already used for other destructive-but-easy-to-fat-finger actions
  // elsewhere (e.g. person delete/archive).
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);

  if (undone) {
    return (
      <View className="flex-1 items-center justify-center gap-4 py-12">
        <Text className="text-lg font-semibold text-primary">Import undone</Text>
        <Text className="text-sm text-secondary text-center">The imported transactions were removed.</Text>
        <Button variant="primary" fullWidth onPress={onDone}>
          Go to Expenses
        </Button>
      </View>
    );
  }

  const hasFailures = failed.length > 0;
  // Item 74 (2026-08-23) — the plain total this line still needs, derived from the per-account
  // breakdown rather than carried as its own separate number, so the two can never drift apart.
  const accountSkippedCount = accountSkipped.reduce((sum, a) => sum + a.count, 0);
  // A stopped-early run (`cancelled`) gets its own distinct icon/tint/title, taking priority over the
  // hasFailures framing — cancelling is a deliberate, successful user action (nothing failed), so it
  // shares `hasFailures`' warning-amber (not danger-red) tint but its own copy and icon
  // (`ti-player-stop-filled`, matching the mockup) rather than being folded into "partially complete".
  // `importError` (2026-08-14, verification-round fix) outranks BOTH — a genuine crash is neither an
  // expected outcome (per-row failure) nor a deliberate one (cancel), so it's the one case that gets
  // danger-red rather than warning-amber.
  const warnTint = cancelled || hasFailures;

  return (
    <View className="flex-1 items-center justify-center gap-6 py-12 px-2">
      <View
        className="w-16 h-16 rounded-full items-center justify-center"
        style={{ backgroundColor: tint(importError ? theme.danger : warnTint ? theme.warning : theme.success) }}
      >
        <Icon
          name={importError || hasFailures ? 'ti-alert-triangle' : cancelled ? 'ti-player-stop-filled' : 'ti-check'}
          size={cancelled && !importError ? 26 : 32}
          color={importError ? theme.danger : warnTint ? theme.warning : theme.success}
        />
      </View>
      <View className="items-center">
        <Text className="text-xl font-semibold text-primary">
          {importError
            ? 'Something went wrong'
            : cancelled
              ? 'Import stopped'
              : hasFailures
                ? 'Import partially complete'
                : 'Import complete'}
        </Text>
        {/* Partial commits are the EXPECTED common case now (2026-08-14, manual-testing gap — §3.2/
         *  Issue #4's per-bucket partial commit), not an edge case — this line leads with exactly what
         *  the user needs to see, never silently: how many imported now, and (when nonzero) how many
         *  are still waiting and what to do about them. */}
        <Text className="text-sm text-secondary mt-1 text-center">
          {importError
            ? succeededCount > 0
              ? `${succeededCount} transaction${succeededCount !== 1 ? 's' : ''} saved before this happened — they'll stay; the rest weren't attempted.`
              : `Nothing was saved before this happened.`
            : cancelled
              ? `${succeededCount} added · ${cancelledRemainingCount} left for later — re-upload this file later to pick ${cancelledRemainingCount === 1 ? 'it' : 'them'} up.`
              : stillUnresolvedCount > 0
                ? `${succeededCount} imported now · ${stillUnresolvedCount} left unresolved — re-upload this file later to pick ${stillUnresolvedCount === 1 ? 'it' : 'them'} up.`
                : `${succeededCount} expense${succeededCount !== 1 ? 's' : ''} added to your vault`}
          {!importError && hasFailures && ` · ${failed.length} row${failed.length !== 1 ? 's' : ''} failed`}
        </Text>
        {/* Nothing vanishes silently (2026-08-14, redesign §9.1) — a discarded row is always accounted
         *  for too, even though it's a distinct reason from "still unresolved" above. */}
        {discardedCount > 0 && (
          <Text className="text-xs text-tertiary mt-2 text-center">{discardedCount} discarded</Text>
        )}
        {/* Dedicated line (2026-08-14, manual-testing gap #1) — a skipped account is a distinct reason
         *  from discarded/still-unresolved, so it's never folded into that same sentence. Broken down PER
         *  ACCOUNT (2026-08-23, item 74) — e.g. "142 transactions skipped — Freecharge (89), Paytm (53)"
         *  instead of one opaque combined number, so the loss is legible. */}
        {accountSkippedCount > 0 && (
          <Text className="text-xs text-tertiary mt-1 text-center">
            {accountSkippedCount} transaction{accountSkippedCount !== 1 ? 's' : ''} skipped —{' '}
            {accountSkipped.map((a) => `${a.accountName} (${a.count})`).join(', ')}
          </Text>
        )}
      </View>

      {/* The raw error message (2026-08-14, verification-round fix) — never silently swallowed, per this
       *  repo's reliability rule. A plain `Banner`, not folded into the title/subtext above, so the
       *  actual technical reason is still available without crowding the headline result. */}
      {importError && (
        <Banner variant="danger" title="What happened">
          {importError}
        </Banner>
      )}

      {!importError && hasFailures && (
        <View className="w-full gap-2">
          <Text className="text-xs text-center" style={{ color: theme.danger }}>
            {failed.length} row{failed.length !== 1 ? 's' : ''} couldn&apos;t be saved (e.g. a transient encryption
            error). The rest are already in your vault — you can retry just the failed ones.
          </Text>
          <Button variant="secondary" fullWidth loading={retrying} onPress={onRetryFailed}>
            Retry {failed.length} failed row{failed.length !== 1 ? 's' : ''}
          </Button>
        </View>
      )}

      <View className="w-full gap-2">
        <Button variant="primary" fullWidth onPress={onDone}>
          Go to Expenses
        </Button>
        {activityLogId && succeededCount > 0 && (
          <Button variant="ghost" fullWidth loading={undoing} onPress={() => setShowUndoConfirm(true)}>
            Undo this import
          </Button>
        )}
      </View>

      <ConfirmDialog
        isOpen={showUndoConfirm}
        onClose={() => setShowUndoConfirm(false)}
        onConfirm={() => {
          setShowUndoConfirm(false);
          setUndoing(true);
          void onUndo().finally(() => setUndoing(false));
        }}
        title="Undo this import?"
        message={`This removes all ${succeededCount} transaction${succeededCount !== 1 ? 's' : ''} this import just added. This can't be undone again.`}
        confirmLabel="Undo import"
        confirmVariant="danger"
      />
    </View>
  );
}
