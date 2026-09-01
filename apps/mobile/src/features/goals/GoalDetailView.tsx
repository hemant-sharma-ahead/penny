import { View, Pressable, Text } from 'react-native';
import type { Expense, Goal, GoalContribution } from '@/core/db/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Modal, Button, Badge, ProgressRing } from '~/components/ui';
import { ListRow } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { getRiskColor } from '@/core/goals/meta';

interface GoalDetailViewProps {
  goal: Goal;
  /** This goal's contributions, sorted newest-first (see `useGoals.ts`'s `contributionsByGoal`). */
  contributions: GoalContribution[];
  expensesById: Map<string, Expense>;
  effectiveSaved: number;
  masked: boolean;
  onAddContribution: () => void;
  onLinkExisting: () => void;
  onEditContribution: (c: GoalContribution) => void;
  onDeleteContribution: (c: GoalContribution) => void;
  onEditGoal: () => void;
  onClose: () => void;
}

/**
 * Full goal detail — progress + every linked contribution/transaction at once, in one place. Same
 * shape as IOU's `PersonLedgerView.tsx` (centred `Modal`, never a bottom sheet, per
 * `docs/DESIGN_GUIDELINES.md`): a progress header, a list of entries below, two footer actions.
 *
 * Expense-origin contributions (seeded from `ExpenseForm.tsx`'s Goal toggle) aren't tappable here —
 * they're owned by their transaction, same as IOU's expense-origin ledger entries; removing that link
 * happens by editing the transaction and turning its Goal toggle off, not from two places at once.
 */
export function GoalDetailView({
  goal,
  contributions,
  expensesById,
  effectiveSaved,
  masked,
  onAddContribution,
  onLinkExisting,
  onEditContribution,
  onDeleteContribution,
  onEditGoal,
  onClose
}: GoalDetailViewProps) {
  const theme = useThemeColors();
  const color = getRiskColor(goal.risk);
  const pct = Math.min(goal.targetAmount > 0 ? (effectiveSaved / goal.targetAmount) * 100 : 0, 100);

  return (
    <Modal
      onClose={onClose}
      title={goal.name}
      scrollable
      footer={
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button variant="secondary" icon="ti-link" onPress={onLinkExisting} fullWidth>
              Link existing
            </Button>
          </View>
          <View className="flex-1">
            <Button variant="primary" icon="ti-plus" onPress={onAddContribution} fullWidth>
              Add contribution
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-4">
        <View className="flex-row items-center gap-3">
          <ProgressRing percentage={pct} color={color} />
          <View className="flex-1">
            <Text className="text-xs text-tertiary">
              {masked ? '••••' : formatCurrency(effectiveSaved)} of{' '}
              {masked ? '••••' : formatCurrency(goal.targetAmount)}
            </Text>
            <Text className="text-lg font-bold" style={{ color }}>
              {Math.round(pct)}% funded
            </Text>
          </View>
          <Pressable
            onPress={onEditGoal}
            className="w-9 h-9 items-center justify-center rounded-lg"
            accessibilityLabel="Edit goal"
          >
            <Icon name="ti-pencil" size={16} color={theme.textTertiary} />
          </Pressable>
        </View>

        <View className="gap-2">
          {contributions.length === 0 && (
            <Text className="text-xs text-tertiary text-center py-6">
              No contributions yet — tap "Add contribution" below.
            </Text>
          )}
          {contributions.map((c) => {
            const linkedTxn = c.linkedTxnId ? expensesById.get(c.linkedTxnId) : undefined;
            const editable = c.origin === 'manual';
            const row = (
              <ListRow
                icon="ti-pig-money"
                iconColor={color}
                iconBg={tint(color)}
                iconSize="sm"
                align="center"
                title={
                  <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                    {linkedTxn?.description?.trim() || c.notes?.trim() || 'Contribution'}
                  </Text>
                }
                subtitle={
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-xs text-tertiary">{formatDate(c.date)}</Text>
                    {c.linkedTxnId && <Badge label="in account" color={theme.info} size="sm" />}
                  </View>
                }
                right={
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold" style={{ color: theme.success }}>
                      +{masked ? '••••' : formatCurrency(c.amount)}
                    </Text>
                    {editable && (
                      <Pressable
                        onPress={() => onDeleteContribution(c)}
                        className="w-7 h-7 items-center justify-center rounded-lg"
                        accessibilityLabel="Delete contribution"
                      >
                        <Icon name="ti-trash" size={13} color={theme.textTertiary} />
                      </Pressable>
                    )}
                  </View>
                }
              />
            );
            return (
              <View key={c.id} className="rounded-xl px-3 py-2 bg-surface-2">
                {editable ? <Pressable onPress={() => onEditContribution(c)}>{row}</Pressable> : row}
              </View>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
