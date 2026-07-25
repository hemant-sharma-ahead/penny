import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { formatCurrency } from '@/lib/formatters';
import { formatDateShort } from '@/lib/date';
import { Card, EmptyState, SegmentedControl, Banner, Button, Modal, AmountInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { BackButton } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import type { BalanceForecast } from '@/core/cashflow/forecaster';
import { useCashFlow, type Horizon } from './useCashFlow';
import { useIncomeSuggestions } from './useIncomeSuggestions';
import { CashFlowTimeline } from './CashFlowTimeline';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

const HORIZON_LABEL: Record<string, string> = {
  month: 'this month',
  quarter: 'over 3 months',
  halfyear: 'over 6 months'
};

/** Human cadence for a detected interval in days. */
function intervalLabel(days: number): string {
  if (days <= 7) return 'week';
  if (days <= 14) return '2 weeks';
  if (days <= 31) return 'month';
  if (days <= 92) return 'quarter';
  return 'year';
}

/** Compact SVG sparkline of the projected daily balance, with the buffer floor marked. RN port —
 *  same path-building math as web, drawn with `react-native-svg` instead of a DOM `<svg>`. */
function BalanceSparkline({
  forecast,
  buffer,
  danger,
  primary,
  warning
}: {
  forecast: BalanceForecast;
  buffer: number;
  danger: string;
  primary: string;
  warning: string;
}) {
  const pts = forecast.daily;
  if (pts.length < 2) return null;
  const W = 320;
  const H = 64;
  const values = pts.map((p) => p.balance);
  const min = Math.min(...values, buffer);
  const max = Math.max(...values, buffer);
  const span = max - min || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * H;
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const lowIdx = pts.findIndex((p) => p.balance === forecast.lowest.balance);
  const breached = forecast.bufferBreachMs !== null;
  const stroke = breached ? danger : primary;

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {buffer > min && (
        <Line
          x1={0}
          y1={y(buffer)}
          x2={W}
          y2={y(buffer)}
          stroke={warning}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.7}
        />
      )}
      <Path d={`${path} L${W},${H} L0,${H} Z`} fill={stroke} opacity={0.08} />
      <Path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {lowIdx >= 0 && <Circle cx={x(lowIdx)} cy={y(forecast.lowest.balance)} r={3} fill={stroke} />}
    </Svg>
  );
}

/**
 * RN port of apps/web-legacy/src/features/cashflow/CashFlowPage.tsx — the "Safe to spend" screen
 * `~/features/home/GlanceHeader.tsx` links to (previously flagged as a no-op since this module didn't
 * exist on mobile). Uses `theme.primary`/`theme.danger`/etc. real hex values instead of web's
 * `STATUS`/CSS-var strings, same fix applied throughout this migration.
 */
export function CashFlowPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const { shouldMask } = usePrivacy();
  const { cashflowBuffer, setCashflowBuffer } = useSettings();
  const {
    horizon,
    setHorizon,
    loading,
    grouped,
    total,
    summaryParts,
    todayStart,
    startBalance,
    forecast,
    nowMs,
    reload
  } = useCashFlow();
  const { suggestions, confirm, dismiss } = useIncomeSuggestions(nowMs, reload);
  const incomeSuggestion = suggestions[0];

  const [showBuffer, setShowBuffer] = useState(false);
  const [bufferDraft, setBufferDraft] = useState(String(cashflowBuffer));

  const masked = shouldMask(false);
  const open = !masked;
  const money = (n: number) => (open ? formatCurrency(n) : '••••');
  const horizonLabel = HORIZON_LABEL[horizon] ?? 'this month';

  const safe = Math.max(0, forecast.discretionary);
  const overcommitted = forecast.discretionary < 0;
  const paydayLine =
    forecast.daysToPayday !== null
      ? `to last the next ${forecast.daysToPayday} day${forecast.daysToPayday === 1 ? '' : 's'} till payday`
      : `to last till month-end (${forecast.daysLeft} days)`;

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView>
        <View className="px-4 pt-4 pb-6 gap-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <BackButton />
              <Text className="text-xl font-semibold text-primary">Cash Flow</Text>
            </View>
            <View className="w-44">
              <SegmentedControl
                options={[
                  { value: 'month', label: '1M' },
                  { value: 'quarter', label: '3M' },
                  { value: 'halfyear', label: '6M' }
                ]}
                value={horizon}
                onChange={(v) => setHorizon(v as Horizon)}
              />
            </View>
          </View>

          {/* Safe-to-spend hero */}
          <View className="rounded-2xl p-5" style={{ backgroundColor: theme.primary }}>
            <Text className="text-sm text-white opacity-75 mb-1">Safe to spend</Text>
            <Text className="text-3xl font-semibold text-white tracking-tight">{money(safe)}</Text>
            {!loading && (
              <Text className="text-sm text-white opacity-80 mt-1">
                {overcommitted ? 'Upcoming commitments exceed your balance' : paydayLine}
              </Text>
            )}
            {!loading && !overcommitted && safe > 0 && (
              <Text className="text-xs text-white opacity-70 mt-2">≈ {money(Math.floor(forecast.perDay))}/day</Text>
            )}
          </View>

          {/* Recurring-income suggestion */}
          {incomeSuggestion && (
            <Card radius="lg" className="gap-3">
              <View className="flex-row items-start gap-3">
                <View className="w-9 h-9 rounded-xl items-center justify-center bg-surface-2">
                  <Icon name="ti-cash" size={18} color={theme.success} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-primary">Recurring income detected</Text>
                  <Text className="text-xs text-secondary mt-0.5">
                    {money(incomeSuggestion.detectedAmount)} from "{incomeSuggestion.label}" every{' '}
                    {intervalLabel(incomeSuggestion.intervalDays)}. Add it to sharpen your forecast and payday
                    countdown.
                  </Text>
                </View>
              </View>
              {/* Same flex-1-per-button fix as the buffer modal footer below — found alongside it. */}
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button variant="secondary" size="sm" fullWidth onPress={() => dismiss(incomeSuggestion)}>
                    Not recurring
                  </Button>
                </View>
                <View className="flex-1">
                  <Button size="sm" fullWidth onPress={() => void confirm(incomeSuggestion)}>
                    Add to forecast
                  </Button>
                </View>
              </View>
            </Card>
          )}

          {/* Low-balance warning */}
          {!loading && forecast.bufferBreachMs !== null && (
            <Banner variant="danger">
              Your balance is projected to dip to {money(forecast.lowest.balance)} on{' '}
              {formatDateShort(forecast.lowest.dayMs)} — below your {money(cashflowBuffer)} safety cushion.
            </Banner>
          )}

          {/* Balance projection */}
          {!loading && (
            <Card radius="lg" className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-secondary">Balance now</Text>
                <Text className="text-sm font-semibold text-primary">{money(startBalance)}</Text>
              </View>
              <BalanceSparkline
                forecast={forecast}
                buffer={cashflowBuffer}
                danger={theme.danger}
                primary={theme.primary}
                warning={theme.warning}
              />
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-tertiary">
                  Lowest {money(forecast.lowest.balance)} · {formatDateShort(forecast.lowest.dayMs)}
                </Text>
                <Text className="text-xs" style={{ color: forecast.netFlow >= 0 ? theme.success : theme.danger }}>
                  Net {forecast.netFlow >= 0 ? '+' : '−'}
                  {money(Math.abs(forecast.netFlow))} {horizonLabel}
                </Text>
              </View>
            </Card>
          )}

          {/* Buffer editor */}
          <Pressable
            onPress={() => {
              setBufferDraft(String(cashflowBuffer));
              setShowBuffer(true);
            }}
            className="flex-row items-center justify-between rounded-xl border border-theme bg-surface-2 px-3 py-2.5"
          >
            <Text className="text-sm text-secondary">Safety cushion</Text>
            <View className="flex-row items-center gap-1.5">
              <Text className="text-sm font-medium text-primary">{money(cashflowBuffer)}</Text>
              <Icon name="ti-pencil" size={14} color={theme.textTertiary} />
            </View>
          </Pressable>

          {/* Upcoming payments */}
          {loading && (
            <View className="gap-2">
              {[1, 2, 3].map((i) => (
                <View key={i} className="rounded-xl h-16 bg-surface-2" />
              ))}
            </View>
          )}

          {!loading && grouped.length > 0 && (
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-primary">Upcoming payments</Text>
                <Text className="text-xs text-tertiary">
                  {money(total)} · {summaryParts.join(' · ')}
                </Text>
              </View>
              <CashFlowTimeline grouped={grouped} todayStart={todayStart} masked={masked} />
            </View>
          )}

          {!loading && grouped.length === 0 && (
            <Card radius="md">
              <EmptyState
                icon="ti-calendar-check"
                title="No upcoming payments"
                description="Add loans, subscriptions, or recurring expenses to see your cash flow forecast."
              />
            </Card>
          )}

          <Text className="text-xs text-center leading-relaxed text-tertiary">
            Projected from your accounts, loans, subscriptions, renewals, and recurring income & expenses. Actual
            amounts may vary.
          </Text>
        </View>
      </ScrollView>

      {showBuffer && (
        <Modal
          size="sm"
          title="Safety cushion"
          onClose={() => setShowBuffer(false)}
          footer={
            // Each button gets its own `flex-1` wrapper, not just `fullWidth` — two `fullWidth` (`w-full`)
            // siblings in a `flex-row` both try to take 100% width and overflow/overlap instead of
            // splitting the row evenly (the same bug class already fixed elsewhere in this migration —
            // see FormModal.tsx's own footer for the established pattern). Found via the 2026-07-25
            // parity sweep.
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button variant="secondary" fullWidth onPress={() => setShowBuffer(false)}>
                  Cancel
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  fullWidth
                  onPress={() => {
                    setCashflowBuffer(Number(bufferDraft) || 0);
                    setShowBuffer(false);
                  }}
                >
                  Save
                </Button>
              </View>
            </View>
          }
        >
          <Text className="text-sm text-secondary mb-3">
            The minimum balance Penny keeps in reserve. Safe-to-spend and the low-balance warning are measured against
            this cushion.
          </Text>
          <AmountInput label="Cushion amount" value={bufferDraft} onChange={setBufferDraft} autoFocus />
          <Text className="mt-3 text-xs" style={{ color: theme.primary }}>
            Tip: one month of essential expenses makes a solid cushion.
          </Text>
        </Modal>
      )}
    </SafeAreaView>
  );
}
