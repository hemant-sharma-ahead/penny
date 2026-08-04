import { View, Pressable, Text } from 'react-native';
import { formatCurrency } from '@/lib/formatters';
import { Button, Card } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { UseBankImportReturn } from './useBankImport';

interface DoneStepProps {
  bi: UseBankImportReturn;
  onDone: () => void;
  onReconcile: () => void;
}

/**
 * Step `done` (mockup `#s8` "Ready to import" + `#s10` balance nudge) — a last checkpoint before the
 * one-shot write (docs/plans/bank-statement-import.md §10b: nothing above this point has touched the
 * real vault), then, once committed, the tally + an optional post-import balance-mismatch nudge (§11)
 * — a pure confidence check, never an auto-correction; "Reconcile now" just routes back to Accounts
 * where the existing Reconcile action already lives (this feature can't open `ReconcileModal`
 * directly — that's `features/accounts/`-internal, and cross-feature import isn't allowed).
 */
export function DoneStep({ bi, onDone, onReconcile }: DoneStepProps) {
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

  return (
    <View className="flex-1 px-4 py-4 gap-4">
      <Card className="items-center gap-2 py-6">
        <Icon name="ti-circle-check" size={32} color={theme.success} />
        <Text className="text-base font-semibold text-primary">Import complete</Text>
        <Text className="text-xs text-tertiary text-center">
          {bi.commitResult?.newCount ?? 0} new transaction{(bi.commitResult?.newCount ?? 0) === 1 ? '' : 's'} added ·{' '}
          {bi.commitResult?.linkedCount ?? 0} linked to your statement
          {(bi.commitResult?.failedCount ?? 0) > 0 ? ` · ${bi.commitResult?.failedCount} row(s) failed to save` : ''}
        </Text>
      </Card>

      {bi.balanceNudge && (
        <Pressable
          onPress={onReconcile}
          className="flex-row gap-2 rounded-xl border p-3"
          style={{ backgroundColor: '#3a2412', borderColor: '#5c3a17' }}
        >
          <Icon name="ti-alert-triangle" size={16} color={theme.warning} />
          <Text className="flex-1 text-xs leading-relaxed" style={{ color: '#f0d0a0' }}>
            Statement shows a closing balance of {formatCurrency(bi.balanceNudge.statementClosing)}, but Penny computes{' '}
            {formatCurrency(bi.balanceNudge.computed)} —{' '}
            {formatCurrency(Math.abs(bi.balanceNudge.statementClosing - bi.balanceNudge.computed))} gap.{' '}
            <Text style={{ color: theme.success, fontWeight: '700' }}>Reconcile now ›</Text>
          </Text>
        </Pressable>
      )}

      <Button variant="primary" fullWidth onPress={onDone}>
        Done
      </Button>
    </View>
  );
}
