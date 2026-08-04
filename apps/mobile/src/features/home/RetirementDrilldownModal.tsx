import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { Modal, AmountInput, Banner } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import type { RetirementPlan } from '@/core/db/types';
import type { RetirementProjectionResult } from '@/core/calculators/retirementProjection';

const MIN_RETIREMENT_AGE_BUFFER = 1; // retirement age must stay at least this far ahead of current age
const VIOLET = '#8b5cf6';
const VIOLET_LIGHT = '#a78bfa';
const VIOLET_LIGHTEST = '#c4b5fd';

interface Props {
  plan: RetirementPlan;
  monthlyExpenseToday: number;
  projection: RetirementProjectionResult;
  currentAge: number;
  open: boolean;
  onUpdate: (patch: Partial<Omit<RetirementPlan, 'id' | 'createdAt'>>) => void;
  onClose: () => void;
}

const W = 284;
const H = 130;

/**
 * Centered drill-down (docs/DESIGN_GUIDELINES.md's "no bottom sheets" rule) reached only by tapping
 * `RetirementFundedSummary`'s "Tap for expense projection" row on Home (never the chart itself, which
 * has its own scrub gesture). Shows the expense-projection curve (today's monthly expense →
 * inflation-adjusted expense at retirement) and lets the user edit monthly expense / retirement age —
 * the two inputs this specific projection is about. Monthly SIP is deliberately **not** editable here
 * (it doesn't drive the expense side at all) — it stays a FIRE Calculator field, same shared
 * `RetirementPlan`. Both edits here write through `onUpdate`, which is `useRetirementPlan()`'s
 * `update()`, so the Home card and the FIRE Calculator stay in sync.
 */
export function RetirementDrilldownModal({
  plan,
  monthlyExpenseToday,
  projection,
  currentAge,
  open,
  onUpdate,
  onClose
}: Props) {
  const theme = useThemeColors();
  const [expenseText, setExpenseText] = useState(String(Math.round(monthlyExpenseToday)));

  const commitExpense = (v: string) => {
    setExpenseText(v);
    const n = Number(v);
    if (v !== '' && Number.isFinite(n) && n >= 0) onUpdate({ monthlyExpenseOverride: n });
  };

  const stepAge = (delta: number) => {
    const minAge = currentAge + MIN_RETIREMENT_AGE_BUFFER;
    const next = Math.min(85, Math.max(minAge, plan.retirementAge + delta));
    onUpdate({ retirementAge: next });
  };

  // A real 2-point curve (today's expense → inflation-adjusted expense at retirement), smoothed —
  // decorative shape is acceptable here (unlike the Home chart) since there's no intermediate-year
  // data to plot for expenses, only the two endpoints.
  const x0 = 14;
  const y0 = H - 4;
  const x1 = W - 24;
  const y1 = 14;
  const path = `M${x0},${y0} C${x0 + 60},${y0 - 4} ${x0 + 130},${y0 - 16} ${x1 - 30},${y1 + 18} C${x1 - 12},${y1 + 8} ${x1 - 4},${y1 + 3} ${x1},${y1}`;
  const areaPath = `${path} L${x1},${H} L${x0},${H} Z`;

  return (
    <Modal onClose={onClose} title="Expense projection" scrollable>
      <View className="gap-4">
        <Banner variant="info">
          Inflation-adjusted · {plan.inflationPct}% p.a. assumed. Updates your retirement plan everywhere — this Home
          card and the FIRE Calculator share the same numbers.
        </Banner>

        <View>
          {/* Same ambient-glow chart language as Home's Retirement Corpus hero, scaled down. */}
          <View style={{ position: 'relative', height: H, overflow: 'hidden', borderRadius: 12 }}>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                right: -20,
                top: -30,
                width: 130,
                height: 130,
                borderRadius: 65,
                opacity: 0.22,
                backgroundColor: VIOLET
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: -20,
                bottom: -30,
                width: 100,
                height: 100,
                borderRadius: 50,
                opacity: 0.25,
                backgroundColor: '#000'
              }}
            />
            <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ position: 'absolute', inset: 0 }}>
              <Defs>
                <LinearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={VIOLET} stopOpacity={0.4} />
                  <Stop offset="100%" stopColor={VIOLET} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={areaPath} fill="url(#expenseFill)" />
              <Path d={path} fill="none" stroke={VIOLET_LIGHT} strokeWidth={2.5} strokeLinecap="round" />
              <Line
                x1={x1}
                y1={y1}
                x2={x1}
                y2={H - 8}
                stroke={VIOLET}
                strokeWidth={1}
                strokeDasharray="2,4"
                opacity={0.35}
              />
              <Circle cx={x0} cy={y0} r={4} fill={VIOLET_LIGHTEST} />
              <Circle cx={x1} cy={y1} r={4} fill={VIOLET_LIGHT} />
            </Svg>
          </View>
          <View className="flex-row items-center justify-between mt-1">
            <Text className="text-[9.5px]" style={{ color: theme.textTertiary }}>
              {open ? `${formatCurrency(Math.round(monthlyExpenseToday))}/mo` : '••••/mo'} · today
            </Text>
            <Text className="text-[9.5px] font-bold" style={{ color: VIOLET_LIGHT }}>
              {open ? `${formatCurrency(Math.round(projection.expenseAtRetirement))}/mo` : '••••/mo'} · at{' '}
              {plan.retirementAge}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-2">
          <View className="flex-1">
            <Text className="text-[10px] mb-1.5" style={{ color: theme.textTertiary }}>
              Monthly expense today
            </Text>
            <AmountInput value={expenseText} onChange={commitExpense} showWords={false} />
          </View>
          <View className="flex-1">
            <Text className="text-[10px] mb-1.5" style={{ color: theme.textTertiary }}>
              Retirement age
            </Text>
            <View className="bg-surface-2 rounded-xl px-3 py-2.5 border border-theme flex-row items-center justify-between">
              <Pressable
                onPress={() => stepAge(-1)}
                className="w-6 h-6 rounded-md items-center justify-center bg-surface"
                accessibilityLabel="Decrease retirement age"
              >
                <Icon name="ti-minus" size={13} color={theme.textPrimary} />
              </Pressable>
              <Text className="text-sm font-bold" style={{ color: theme.textPrimary }}>
                {plan.retirementAge}
              </Text>
              <Pressable
                onPress={() => stepAge(1)}
                className="w-6 h-6 rounded-md items-center justify-center bg-surface"
                accessibilityLabel="Increase retirement age"
              >
                <Icon name="ti-plus" size={13} color={theme.textPrimary} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
