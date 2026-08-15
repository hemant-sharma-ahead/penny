import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Button, Banner, ProgressBar, ConfirmDialog } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { FailedImportRow } from '@/core/import/importWriter';
import type { ImportPhase } from './useImport';
import { DoneStep } from './DoneStep';

/** Pre-start-only heuristic (no real run data exists yet) — a rough, documented guess, not measured.
 *  Superseded immediately once the Importing sub-state's own rolling ms/row average has any real data
 *  (see `msPerRowSoFar` below); only ever shown before "Start Import" is tapped. */
const ESTIMATED_MS_PER_ROW = 25;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `~${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
  const minutes = Math.round(totalSeconds / 60);
  return `~${minutes} minute${minutes === 1 ? '' : 's'}`;
}

interface ImportProgressStepProps {
  phase: ImportPhase;
  totalTransactionCount: number;
  progress: { completed: number; total: number };
  startedAt: number | null;
  onStartImport: () => void;
  onRequestCancel: () => void;
  // Complete sub-state — forwarded straight through to `DoneStep.tsx`, reused verbatim (2026-08-14,
  // redesign §14 item 8 — not redesigned for this screen).
  succeededCount: number;
  failed: FailedImportRow[];
  activityLogId: string | null;
  undone: boolean;
  retrying: boolean;
  discardedCount: number;
  stillUnresolvedCount: number;
  accountSkippedCount: number;
  cancelled: boolean;
  cancelledRemainingCount: number;
  /** Set only when `commitAndImport()` itself threw something genuinely UNEXPECTED (2026-08-14, severe
   *  bug found in verification — see `useImport.ts`'s own doc comment on this field). Forwarded straight
   *  to `DoneStep.tsx`, which gives it top priority over its own `cancelled`/`hasFailures` framings. */
  importError: string | null;
  onRetryFailed: () => void;
  onUndo: () => Promise<void>;
  onDone: () => void;
}

/**
 * The 'done' wizard step's real content (2026-08-14, CSV-import redesign §14 item 8 —
 * docs/plans/csv-expense-import-redesign.md, mockup docs/mockups/proposals/expense-import-progress-v1.html).
 * Absorbs what used to be a single blind `commitAndImport()` call fired straight from Transactions
 * stage's Import button — tapping Import used to start writing immediately with only a spinner in the
 * button itself, with nothing stopping the header back-chevron from firing mid-write (a real bug found
 * in testing). One component, three internal sub-states (`ImportPhase`) — never a fourth wizard `Step`;
 * `WizardProgress.tsx`'s step count/labels are unaffected.
 *
 * - **Pre-start**: nothing written yet — back navigation (to Transactions) still fully allowed.
 * - **Importing**: the real write loop is running (`useImport.ts`'s `commitAndImport`, now instrumented
 *   with live `onProgress`/`shouldCancel` hooks into `writeImportBatchDetailed`). Back navigation is
 *   locked everywhere for this sub-state — see `ImportPage.tsx`'s header-backHandler/`BackHandler`/
 *   `gestureEnabled` wiring, all keyed off this same `phase`.
 * - **Complete**: reuses `DoneStep.tsx`'s existing layout verbatim, not redesigned — just adds a
 *   distinct "stopped early via Cancel" framing (`cancelled`/`cancelledRemainingCount`) alongside its
 *   existing normal-finish/partial-failure framings.
 */
export function ImportProgressStep({
  phase,
  totalTransactionCount,
  progress,
  startedAt,
  onStartImport,
  onRequestCancel,
  succeededCount,
  failed,
  activityLogId,
  undone,
  retrying,
  discardedCount,
  stillUnresolvedCount,
  accountSkippedCount,
  cancelled,
  cancelledRemainingCount,
  importError,
  onRetryFailed,
  onUndo,
  onDone
}: ImportProgressStepProps) {
  const theme = useThemeColors();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // `Date.now()` is impure, so it can't be called directly during render (react-hooks/purity) — ticked
  // into state instead, same pattern `PrivacyModeSwitcher.tsx`'s own countdown uses. Only needs to run
  // while actually importing (the ETA is the only thing that reads it); 500ms is plenty smooth for a
  // seconds-granularity "~N seconds left" label.
  const [tickNow, setTickNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== 'importing') return;
    const id = setInterval(() => setTickNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'complete') {
    return (
      <DoneStep
        succeededCount={succeededCount}
        failed={failed}
        activityLogId={activityLogId}
        undone={undone}
        retrying={retrying}
        discardedCount={discardedCount}
        stillUnresolvedCount={stillUnresolvedCount}
        accountSkippedCount={accountSkippedCount}
        cancelled={cancelled}
        cancelledRemainingCount={cancelledRemainingCount}
        importError={importError}
        onRetryFailed={onRetryFailed}
        onUndo={onUndo}
        onDone={onDone}
      />
    );
  }

  if (phase === 'importing') {
    const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
    // Rolling average ms/row from what's ACTUALLY happened in this run so far — re-derived on every
    // progress tick (extrapolated against rows remaining), never a hardcoded placeholder.
    const elapsedMs = startedAt ? tickNow - startedAt : 0;
    const msPerRowSoFar = progress.completed > 0 ? elapsedMs / progress.completed : null;
    const remaining = progress.total - progress.completed;
    const etaLabel =
      msPerRowSoFar !== null && remaining > 0 ? `${formatDuration(msPerRowSoFar * remaining)} left` : null;

    return (
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <View className="items-center">
          <Text className="text-2xl font-extrabold text-primary">
            {progress.completed} <Text className="text-sm font-bold text-tertiary">of {progress.total}</Text>
          </Text>
          {etaLabel && <Text className="text-xs text-secondary mt-0.5">{etaLabel}</Text>}
        </View>

        <View className="w-full">
          <ProgressBar value={pct} size="md" animate />
        </View>

        <View className="flex-row items-center gap-1.5">
          <Icon name="ti-loader-2" size={12} color={theme.textTertiary} />
          <Text className="text-[10.5px] font-semibold text-tertiary">Saving transactions…</Text>
        </View>

        <View className="w-full mt-2">
          <Button variant="secondary" fullWidth onPress={() => setShowCancelConfirm(true)}>
            Cancel
          </Button>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Icon name="ti-lock" size={10} color={theme.textTertiary} />
          <Text className="text-[9px] font-bold uppercase tracking-wide text-tertiary">
            Back is locked until this finishes
          </Text>
        </View>

        <ConfirmDialog
          isOpen={showCancelConfirm}
          onClose={() => setShowCancelConfirm(false)}
          onConfirm={() => {
            onRequestCancel();
            setShowCancelConfirm(false);
          }}
          title="Stop importing?"
          message={`${progress.completed} already added will stay — the remaining ${remaining} will need a re-upload later.`}
          confirmLabel="Stop import"
          confirmVariant="danger"
        />
      </View>
    );
  }

  // Pre-start
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <View
        className="w-16 h-16 rounded-full items-center justify-center"
        style={{ backgroundColor: tint(theme.info) }}
      >
        <Icon name="ti-cloud-upload" size={28} color={theme.info} />
      </View>
      <View className="items-center">
        <Text className="text-lg font-bold text-primary text-center">
          You&apos;re about to import{'\n'}
          {totalTransactionCount} transaction{totalTransactionCount !== 1 ? 's' : ''}
        </Text>
        <Text className="text-xs text-secondary mt-1.5">
          Estimated time: {formatDuration(totalTransactionCount * ESTIMATED_MS_PER_ROW)}
        </Text>
      </View>
      <Banner variant="info">
        Don&apos;t close the app until it&apos;s done. Once it starts, you can cancel any time — anything already saved
        will stay.
      </Banner>
      <View className="w-full mt-1">
        <Button variant="primary" fullWidth onPress={onStartImport}>
          Start Import
        </Button>
      </View>
    </View>
  );
}
