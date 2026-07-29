import { useState } from 'react';
import { View, Text } from 'react-native';
import { Button } from '~/components/ui';
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
  onRetryFailed,
  onUndo,
  onDone
}: DoneStepProps) {
  const theme = useThemeColors();
  const [undoing, setUndoing] = useState(false);

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

  return (
    <View className="flex-1 items-center justify-center gap-6 py-12 px-2">
      <View
        className="w-16 h-16 rounded-full items-center justify-center"
        style={{ backgroundColor: tint(hasFailures ? theme.warning : theme.success) }}
      >
        <Icon
          name={hasFailures ? 'ti-alert-triangle' : 'ti-check'}
          size={32}
          color={hasFailures ? theme.warning : theme.success}
        />
      </View>
      <View className="items-center">
        <Text className="text-xl font-semibold text-primary">
          {hasFailures ? 'Import partially complete' : 'Import complete'}
        </Text>
        <Text className="text-sm text-secondary mt-1 text-center">
          {succeededCount} expense{succeededCount !== 1 ? 's' : ''} added to your vault
          {hasFailures && ` · ${failed.length} row${failed.length !== 1 ? 's' : ''} failed`}
        </Text>
      </View>

      {hasFailures && (
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
          <Button
            variant="ghost"
            fullWidth
            loading={undoing}
            onPress={async () => {
              setUndoing(true);
              await onUndo();
              setUndoing(false);
            }}
          >
            Undo this import
          </Button>
        )}
      </View>
    </View>
  );
}
