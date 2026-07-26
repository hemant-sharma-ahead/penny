import { useState } from 'react';
import { View, Text } from 'react-native';
import { Card, Button, ProgressRing, AmountInput, Badge } from '~/components/ui';
import { formatCurrency, formatDate, parseNumber } from '@/lib/formatters';
import { calcSipNeeded, monthsUntil } from '@/core/goals/sipCalculator';
import { getRiskColor, getRiskReturn } from '@/core/goals/meta';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Goal } from './useGoals';

interface GoalCardProps {
  goal: Goal;
  masked: boolean;
  onEdit: (goal: Goal) => void;
  onContribute: (goal: Goal, amount: number) => void;
}

export function GoalCard({ goal, masked, onEdit, onContribute }: GoalCardProps) {
  const theme = useThemeColors();
  const [contributing, setContributing] = useState(false);
  const [amount, setAmount] = useState('');

  const pct = Math.min(goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0, 100);
  const color = getRiskColor(goal.risk);
  const months = monthsUntil(goal.targetDate);
  const sipNeeded = calcSipNeeded(goal.targetAmount, goal.currentAmount, months, getRiskReturn(goal.risk));

  function submit() {
    const n = parseNumber(amount);
    if (n <= 0) return;
    onContribute(goal, n);
    setContributing(false);
    setAmount('');
  }

  return (
    <Card>
      <View className="flex-row items-start gap-4">
        <ProgressRing percentage={pct} color={color} />

        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5 flex-1">
              <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
                {goal.name}
              </Text>
              {goal.source === 'suggested' && (
                <Badge label="Suggested" icon="ti-sparkles" color={theme.primary} size="sm" />
              )}
            </View>
            <Button
              variant="ghost"
              icon="ti-pencil"
              accessibilityLabel={`Edit ${goal.name}`}
              className="w-7 h-7 rounded-lg"
              onPress={() => onEdit(goal)}
            />
          </View>
          <Text className="text-xs mt-0.5 text-secondary">
            {masked ? '••••' : formatCurrency(goal.currentAmount)} of{' '}
            {masked ? '••••' : formatCurrency(goal.targetAmount)}
          </Text>
          <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
            <Badge label={goal.risk} color={color} variant="solid" size="sm" capitalize />
            <Text className="text-[10px] text-tertiary">
              {months > 0 ? `${months}mo left` : 'Due'} · {formatDate(goal.targetDate)}
            </Text>
          </View>
          {sipNeeded > 0 && (
            <Text className="text-[10px] mt-1 text-tertiary">
              SIP needed: {masked ? '••••' : formatCurrency(Math.ceil(sipNeeded))}
              /mo
            </Text>
          )}
        </View>
      </View>

      {contributing ? (
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <AmountInput placeholder="Amount" value={amount} onChange={setAmount} autoFocus />
          </View>
          <Button size="sm" onPress={submit}>
            Add
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              setContributing(false);
              setAmount('');
            }}
          >
            Cancel
          </Button>
        </View>
      ) : (
        <Button variant="secondary" fullWidth icon="ti-plus" onPress={() => setContributing(true)} className="mt-3">
          Add contribution
        </Button>
      )}
    </Card>
  );
}
