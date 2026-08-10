import { View, Text } from 'react-native';
import { Button, Card } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { UseBankImportReturn } from './useBankImport';

interface DoneStepProps {
  bi: UseBankImportReturn;
  onDone: () => void;
}

/**
 * Step `done` (mockup `#s8` "Ready to import") — a last checkpoint before the one-shot write
 * (docs/plans/bank-statement-import.md §10b: nothing above this point has touched the real vault),
 * then, once committed, the tally. The old one-shot "Reconcile now" balance-mismatch nudge (§11) was
 * removed 2026-08-09 — it was a dead end (found via on-device testing: it stayed alive alongside, and
 * duplicated, Stage 4's persistent "unverified account" badge, which this whole mechanism was supposed
 * to have been retired in favor of per docs/plans/bank-balance-sync.md §10's "Finding 1 confirmed"
 * decision — plus it read the account's pre-Stage-3-confirm `openingBalance`, always off by exactly
 * the just-confirmed opening-balance amount). See `useBankImport.ts` for the corresponding removal of
 * `balanceNudge`/`checkBalanceAgainstStatement()`.
 */
export function DoneStep({ bi, onDone }: DoneStepProps) {
  const theme = useThemeColors();

  if (!bi.committed) {
    return (
      <View className="flex-1 px-4 py-4 gap-4">
        <Card className="gap-2.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-secondary">New transactions</Text>
            <Text className="text-sm font-semibold text-primary">{bi.stagedNewTxns.length}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-secondary">Confirmed matches</Text>
            <Text className="text-sm font-semibold text-primary">{bi.matchedPairs.length}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-secondary">Lone-wolf actions</Text>
            <Text className="text-sm font-semibold text-primary">{bi.loneWolfDeletions.size}</Text>
          </View>
        </Card>
        <Text className="text-xs text-tertiary">
          Leaving this screen without importing discards everything above — nothing is saved until you tap Import.
        </Text>
        <Button variant="primary" fullWidth loading={bi.committing} onPress={() => void bi.commitAndImport()}>
          {`Import ${bi.readyCount} transaction${bi.readyCount === 1 ? '' : 's'}`}
        </Button>
      </View>
    );
  }

  const skippedCount = bi.commitResult?.skippedCount ?? 0;
  const totalRows = bi.commitResult?.totalRows ?? 0;
  const handledRows = totalRows - skippedCount;

  return (
    <View className="flex-1 px-4 py-4 gap-4">
      <Card className="items-center gap-2 py-5">
        <Icon name="ti-circle-check" size={28} color={theme.success} />
        <Text className="text-base font-semibold text-primary">Import complete</Text>
        {(bi.commitResult?.failedCount ?? 0) > 0 && (
          <Text className="text-xs text-tertiary text-center">
            {bi.commitResult?.failedCount} row(s) failed to save
          </Text>
        )}
      </Card>

      {/* Skipped-row visibility (docs/plans/bank-balance-sync.md §5/§11a, plan §7 Stage 2) — a durable,
          visible record of what was matched/added/excluded, not just a one-line "N linked" summary. */}
      <Card className="gap-2.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-secondary">New transactions</Text>
          <Text className="text-sm font-semibold text-primary">{bi.commitResult?.newCount ?? 0}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-secondary">Confirmed matches</Text>
          <Text className="text-sm font-semibold text-primary">{bi.commitResult?.matchedCount ?? 0}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-secondary">Excluded — you chose not to add</Text>
          <Text
            className="text-sm font-semibold"
            style={{ color: skippedCount > 0 ? theme.warning : theme.textPrimary }}
          >
            {skippedCount}
          </Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-secondary">Lone-wolf actions</Text>
          <Text className="text-sm font-semibold text-primary">{bi.commitResult?.deletedCount ?? 0}</Text>
        </View>
      </Card>
      {totalRows > 0 && (
        <Text className="text-xs text-tertiary -mt-2">
          {totalRows} row{totalRows === 1 ? '' : 's'} found in this file · {handledRows} handled
          {skippedCount > 0 ? `, ${skippedCount} skipped intentionally` : ''}.
        </Text>
      )}

      <Button variant="primary" fullWidth onPress={onDone}>
        Done
      </Button>
    </View>
  );
}
