import { View, Pressable, Text } from 'react-native';
import { formatCurrency } from '@/lib/formatters';
import type { Budget, ExpenseCategory } from '@/core/db/types';
import { isHiddenInSafeMode } from '@/core/expenses/categoryGroups';
import { Icon } from '~/components/Icon';
import { ProgressBar } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';

interface BudgetsTabProps {
  expenseCategories: ExpenseCategory[];
  spendByCategory: Map<string, number>;
  monthBudgets: Budget[];
  shouldMask: (sensitive: boolean | undefined) => boolean;
  onOpenBudget: (cat: ExpenseCategory, existing?: Budget) => void;
}

export function BudgetsTab({
  expenseCategories,
  spendByCategory,
  monthBudgets,
  shouldMask,
  onOpenBudget
}: BudgetsTabProps) {
  const theme = useThemeColors();

  return (
    <View className="px-4 py-4 gap-3">
      {expenseCategories.length === 0 && (
        <Text className="text-sm text-center mt-8 text-tertiary">Loading categories…</Text>
      )}
      {expenseCategories.map((cat) => {
        const budget = monthBudgets.find((b) => b.categoryId === cat.id);
        const spent = spendByCategory.get(cat.id) ?? 0;
        const pct = budget ? Math.min((spent / budget.limitAmount) * 100, 100) : 0;
        const over = !!budget && spent > budget.limitAmount;
        const masked = shouldMask(isHiddenInSafeMode(cat));
        return (
          <View key={cat.id} className="bg-surface border border-theme rounded-xl px-4 py-3">
            <View className="flex-row items-center gap-2">
              <View
                className="w-7 h-7 rounded-lg items-center justify-center"
                style={{ backgroundColor: `${cat.color}18` }}
              >
                <Icon name={cat.icon} size={15} color={cat.color} />
              </View>
              <Text className="text-sm font-medium text-primary flex-1" numberOfLines={1}>
                {cat.name}
              </Text>
              {budget && (
                <Text className="text-xs" style={{ color: over ? theme.danger : theme.textTertiary }}>
                  {masked ? '••••' : formatCurrency(budget.limitAmount)}
                </Text>
              )}
              <Pressable onPress={() => onOpenBudget(cat, budget)}>
                <Text className="text-xs font-medium underline text-tertiary">{budget ? 'Edit' : 'Set limit'}</Text>
              </Pressable>
            </View>
            {budget && (
              <View className="flex-row items-center gap-2 mt-2.5">
                <View className="flex-1">
                  <ProgressBar value={pct} color={over ? theme.danger : cat.color} />
                </View>
                <Text className="text-xs" style={{ color: over ? theme.danger : theme.textSecondary }}>
                  {masked ? '••••' : formatCurrency(spent)}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
