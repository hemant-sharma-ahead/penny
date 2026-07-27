import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { formatCurrency, formatCompact, toMonthYearKey } from '@/lib/formatters';
import { ListContainer, SectionLabel, Banner, Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import type { ThemeTokens } from '@penny/core/theme/tokens';
import type { MonthPoint } from '@/core/expenses/annualAnalytics';
import type { MonthlyRecap, Anomaly } from '@/core/expenses/monthlyInsights';
import { AnnualChart } from './AnnualChart';

// ── Local helpers ─────────────────────────────────────────────────────────────

function offsetMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y ?? 0, (mo ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(m: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, mo] = m.split('-');
  return `${months[(parseInt(mo ?? '1', 10) - 1) % 12] ?? ''} ${y ?? ''}`.trim();
}

function RecapStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const theme = useThemeColors();
  return (
    <View className="w-[48%] min-w-0">
      <Text className="text-[10px] text-tertiary uppercase tracking-wide">{label}</Text>
      <Text className="text-sm font-semibold" numberOfLines={1} style={{ color: color ?? theme.textPrimary }}>
        {value}
      </Text>
    </View>
  );
}

// ── Month picker modal ────────────────────────────────────────────────────────

const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Web's local `MonthPickerModal` was a hand-rolled `fixed inset-0` overlay, never converted to the shared
 * `Modal` even on web (distinct from transactions' own `MonthPickerModal`). Rebuilt here on the real
 * `Modal` component, same "year nav + 4-col month grid" content, per this migration's standing rule for
 * every hand-rolled-modal fix.
 */
function MonthPickerModal({
  value,
  onSelect,
  onClose,
  maxMonth
}: {
  value: string;
  onSelect: (m: string) => void;
  onClose: () => void;
  maxMonth?: string;
}) {
  const theme = useThemeColors();
  const [year, setYear] = useState(() => parseInt(value.split('-')[0] ?? String(new Date().getFullYear()), 10));
  const maxYear = maxMonth
    ? parseInt(maxMonth.split('-')[0] ?? String(new Date().getFullYear()), 10)
    : new Date().getFullYear();

  return (
    <Modal onClose={onClose} size="sm">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => setYear((y) => y - 1)}
          className="w-9 h-9 items-center justify-center rounded-lg"
          accessibilityLabel="Previous year"
        >
          <Icon name="ti-chevron-left" size={18} color={theme.textSecondary} />
        </Pressable>
        <Text className="text-base font-semibold text-primary">{year}</Text>
        <Pressable
          onPress={() => setYear((y) => y + 1)}
          disabled={year >= maxYear}
          className="w-9 h-9 items-center justify-center rounded-lg"
          style={{ opacity: year >= maxYear ? 0.3 : 1 }}
          accessibilityLabel="Next year"
        >
          <Icon name="ti-chevron-right" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-2 mt-4">
        {MONTH_LABELS_SHORT.map((label, idx) => {
          const m = `${year}-${String(idx + 1).padStart(2, '0')}`;
          const isSelected = m === value;
          const isDisabled = maxMonth ? m > maxMonth : false;
          return (
            <View key={m} className="w-[23%]">
              <Pressable
                onPress={() => {
                  onSelect(m);
                  onClose();
                }}
                disabled={isDisabled}
                className="py-2.5 rounded-xl items-center"
                style={{
                  backgroundColor: isSelected ? theme.primary : theme.surfaceSecondary,
                  opacity: isDisabled ? 0.3 : 1
                }}
              >
                <Text className="text-sm font-medium" style={{ color: isSelected ? '#fff' : theme.textSecondary }}>
                  {label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Modal>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────

interface DonutSegment {
  group: string;
  amount: number;
  color: string;
  label: string;
}

interface DonutArc {
  key: string;
  color: string;
  dasharray: string;
  rotation: number;
}

const DONUT_R = 58;
const DONUT_CX = 80;
const DONUT_CY = 80;
const DONUT_C = 2 * Math.PI * DONUT_R;

// Same "one stroked <Circle> per segment via strokeDasharray + rotation" technique already proven
// on-device by Home's FinancialHealthCard ring (see ringSegments() there) — reused verbatim here for
// per-category-group spend arcs instead of per-scoring-pillar arcs. RN has no `conic-gradient` or
// `strokeDashoffset`-driven partial-stroke trick that behaves reliably across platforms, so every segment
// is a full circle showing only its own arc, rotated into place by the running cumulative fraction.
function donutSegments(segments: DonutSegment[], total: number): DonutArc[] {
  const out: DonutArc[] = [];
  let cumulative = 0;
  for (const seg of segments.filter((s) => s.amount > 0)) {
    const fraction = total > 0 ? seg.amount / total : 0;
    const dash = Math.max(fraction * DONUT_C - 2, 0);
    out.push({
      key: seg.group,
      color: seg.color,
      dasharray: `${dash} ${DONUT_C}`,
      rotation: total > 0 ? -90 + (cumulative / total) * 360 : -90
    });
    cumulative += seg.amount;
  }
  return out;
}

function IntentDonut({ segments, total, theme }: { segments: DonutSegment[]; total: number; theme: ThemeTokens }) {
  const arcs = donutSegments(segments, total);

  return (
    <Svg viewBox="0 0 160 160" width={160} height={160}>
      <Circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R} fill="none" stroke={theme.border} strokeWidth={20} />
      {arcs.map((seg) => (
        <Circle
          key={seg.key}
          cx={DONUT_CX}
          cy={DONUT_CY}
          r={DONUT_R}
          fill="none"
          stroke={seg.color}
          strokeWidth={20}
          strokeDasharray={seg.dasharray}
          rotation={seg.rotation}
          origin={`${DONUT_CX}, ${DONUT_CY}`}
        />
      ))}
      <SvgText
        x={DONUT_CX}
        y={DONUT_CY - 7}
        textAnchor="middle"
        fill={theme.textPrimary}
        fontSize={17}
        fontWeight="700"
      >
        {formatCompact(total)}
      </SvgText>
      <SvgText x={DONUT_CX} y={DONUT_CY + 10} textAnchor="middle" fill={theme.textTertiary} fontSize={9}>
        this month
      </SvgText>
    </Svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AnalyticsTabProps {
  analyticsView: 'monthly' | 'annual';
  onChangeAnalyticsView: (v: 'monthly' | 'annual') => void;
  analyticsYear: number;
  onChangeAnalyticsYear: (y: number) => void;
  selectedMonth: string;
  onChangeSelectedMonth: (m: string) => void;
  expandedGroup: string | null;
  onChangeExpandedGroup: (g: string | null) => void;
  expandedEventId: string | null;
  onChangeExpandedEventId: (id: string | null) => void;
  showAnalyticsMonthPicker: boolean;
  onChangeShowAnalyticsMonthPicker: (v: boolean) => void;
  analyticsData: Array<{
    group: string;
    amount: number;
    color: string;
    label: string;
    cats: Array<{
      catId: string;
      name: string;
      icon: string;
      color: string;
      amount: number;
      budgetLimit: number | undefined;
    }>;
    budgetTotal: number;
  }>;
  analyticsTotal: number;
  monthTotal: number;
  setAsideData: Array<{ group: string; amount: number; label: string; color: string; icon: string }>;
  setAsideTotal: number;
  prevMonthData: Map<string, number>;
  spendVelocity: { daysElapsed: number; daysInMonth: number; projected: number } | null;
  recap: MonthlyRecap;
  anomalies: Anomaly[];
  annualData: MonthPoint[];
  prevYearData: MonthPoint[];
  annualSavings: { income: number; expense: number; saved: number; rate: number };
  annualMovers: Array<{
    categoryId: string;
    name: string;
    color: string;
    pct: number;
    current: number;
    average: number;
  }>;
  annualTotal: number;
  annualMax: number;
  eventsThisMonth: Array<{
    id: string;
    name: string;
    color: string;
    amount: number;
    cats: Array<{ catId: string; name: string; icon: string; color: string; amount: number }>;
  }>;
  hashtagSummary: Array<{ tag: string; amount: number }>;
  masked: boolean;
  promoteHashtagToEvent: (tag: string) => void;
}

export function AnalyticsTab({
  analyticsView,
  onChangeAnalyticsView,
  analyticsYear,
  onChangeAnalyticsYear,
  selectedMonth,
  onChangeSelectedMonth,
  expandedGroup,
  onChangeExpandedGroup,
  expandedEventId,
  onChangeExpandedEventId,
  showAnalyticsMonthPicker,
  onChangeShowAnalyticsMonthPicker,
  analyticsData,
  analyticsTotal,
  monthTotal,
  setAsideData,
  setAsideTotal,
  prevMonthData,
  spendVelocity,
  recap,
  anomalies,
  annualData,
  prevYearData,
  annualSavings,
  annualMovers,
  annualTotal,
  annualMax,
  eventsThisMonth,
  hashtagSummary,
  masked,
  promoteHashtagToEvent
}: AnalyticsTabProps) {
  const theme = useThemeColors();

  return (
    <View className="px-4 py-4 gap-4">
      {/* View toggle + navigation */}
      <View className="flex-row items-center justify-between gap-3">
        {/* Monthly / Annual toggle */}
        <View className="flex-row gap-0.5 bg-surface-2 rounded-lg p-0.5 flex-shrink-0">
          {(['monthly', 'annual'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => onChangeAnalyticsView(v)}
              className="px-3 py-1.5 rounded-md"
              style={
                analyticsView === v
                  ? { backgroundColor: theme.surface, boxShadow: '0px 0px 3px rgba(0, 0, 0, 0.1)' }
                  : undefined
              }
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: analyticsView === v ? theme.textPrimary : theme.textTertiary }}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Monthly navigation */}
        {analyticsView === 'monthly' && (
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => {
                onChangeSelectedMonth(offsetMonth(selectedMonth, -1));
                onChangeExpandedGroup(null);
              }}
              className="w-7 h-7 items-center justify-center rounded-lg"
              accessibilityLabel="Previous month"
            >
              <Icon name="ti-chevron-left" size={16} color={theme.textSecondary} />
            </Pressable>
            <Pressable onPress={() => onChangeShowAnalyticsMonthPicker(true)} className="px-2.5 py-1 rounded-lg">
              <Text className="text-sm font-semibold text-primary">{monthLabel(selectedMonth)}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onChangeSelectedMonth(offsetMonth(selectedMonth, 1));
                onChangeExpandedGroup(null);
              }}
              disabled={selectedMonth >= toMonthYearKey()}
              style={{ opacity: selectedMonth >= toMonthYearKey() ? 0.3 : 1 }}
              className="w-7 h-7 items-center justify-center rounded-lg"
              accessibilityLabel="Next month"
            >
              <Icon name="ti-chevron-right" size={16} color={theme.textSecondary} />
            </Pressable>
          </View>
        )}

        {/* Annual navigation */}
        {analyticsView === 'annual' && (
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => onChangeAnalyticsYear(analyticsYear - 1)}
              className="w-7 h-7 items-center justify-center rounded-lg"
              accessibilityLabel="Previous year"
            >
              <Icon name="ti-chevron-left" size={16} color={theme.textSecondary} />
            </Pressable>
            <Text className="px-2.5 py-1 text-sm font-semibold text-primary">{analyticsYear}</Text>
            <Pressable
              onPress={() => onChangeAnalyticsYear(analyticsYear + 1)}
              disabled={analyticsYear >= new Date().getFullYear()}
              style={{ opacity: analyticsYear >= new Date().getFullYear() ? 0.3 : 1 }}
              className="w-7 h-7 items-center justify-center rounded-lg"
              accessibilityLabel="Next year"
            >
              <Icon name="ti-chevron-right" size={16} color={theme.textSecondary} />
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Annual view ── */}
      {analyticsView === 'annual' && (
        <>
          {annualTotal === 0 && annualSavings.income === 0 ? (
            <View className="p-10 items-center">
              <Icon name="ti-chart-bar" size={44} color={theme.textTertiary} />
              <Text className="text-sm mt-3 text-tertiary">No activity in {analyticsYear}.</Text>
            </View>
          ) : (
            <>
              {/* Savings-rate headline */}
              {annualSavings.income > 0 && (
                <View className="bg-surface border border-theme rounded-2xl p-4 flex-row items-center justify-between">
                  <View>
                    <Text className="text-xs font-medium text-tertiary uppercase tracking-wide">
                      Saved in {analyticsYear}
                    </Text>
                    <Text
                      className="text-lg font-bold"
                      style={{ color: annualSavings.saved >= 0 ? theme.success : theme.danger }}
                    >
                      {!masked ? formatCurrency(annualSavings.saved) : '••••'}
                    </Text>
                  </View>
                  <Text
                    className="text-2xl font-bold"
                    style={{ color: annualSavings.saved >= 0 ? theme.success : theme.danger }}
                  >
                    {Math.round(annualSavings.rate * 100)}%
                  </Text>
                </View>
              )}

              {/* Income vs expense chart */}
              <View className="bg-surface border border-theme rounded-2xl p-4 gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-medium text-tertiary uppercase tracking-wide">Income vs spend</Text>
                  <Text className="text-sm font-semibold text-primary">
                    Spent {!masked ? formatCurrency(annualTotal) : '••••'}
                  </Text>
                </View>
                <AnnualChart
                  series={annualData}
                  prevYear={prevYearData}
                  max={annualMax}
                  masked={masked}
                  onSelectMonth={(m) => {
                    onChangeSelectedMonth(m);
                    onChangeAnalyticsView('monthly');
                    onChangeExpandedGroup(null);
                  }}
                />
              </View>

              {/* Biggest movers */}
              {annualMovers.length > 0 && (
                <View>
                  <SectionLabel>Biggest movers · last month</SectionLabel>
                  <ListContainer>
                    {annualMovers.map((mv) => {
                      const up = mv.pct >= 0;
                      return (
                        <View key={mv.categoryId} className="flex-row items-center gap-3 px-4 py-3">
                          <View className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: mv.color }} />
                          <Text className="text-sm font-medium text-primary flex-1">{mv.name}</Text>
                          <View className="flex-row items-center gap-0.5">
                            <Icon
                              name={up ? 'ti-arrow-up-right' : 'ti-arrow-down-right'}
                              size={14}
                              color={up ? theme.danger : theme.success}
                            />
                            <Text
                              className="text-sm font-semibold"
                              style={{ color: up ? theme.danger : theme.success }}
                            >
                              {Math.abs(Math.round(mv.pct * 100))}%
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ListContainer>
                  <Text className="text-[11px] text-tertiary mt-1.5 px-1">vs your prior 3-month average</Text>
                </View>
              )}

              <Text className="text-[11px] text-center text-tertiary">
                Tap any month in the chart to open its details.
              </Text>
            </>
          )}
        </>
      )}

      {/* ── Monthly view ── */}
      {analyticsView === 'monthly' &&
      analyticsData.length === 0 &&
      setAsideData.length === 0 &&
      eventsThisMonth.length === 0 ? (
        <View className="p-10 items-center">
          <Icon name="ti-chart-donut" size={44} color={theme.textTertiary} />
          <Text className="text-sm mt-3 text-tertiary">No expenses in {monthLabel(selectedMonth)}.</Text>
        </View>
      ) : analyticsView === 'monthly' ? (
        <>
          {/* All-inclusive month total — daily-routine + set aside + events */}
          <View className="bg-surface border border-theme rounded-xl p-4">
            <Text className="text-xs text-secondary">Total spent · {monthLabel(selectedMonth)}</Text>
            <Text className="text-2xl font-bold text-primary mt-0.5">
              {!masked ? formatCurrency(monthTotal) : '••••'}
            </Text>
            <Text className="text-[11px] text-tertiary mt-1">
              Daily-routine {!masked ? formatCompact(analyticsTotal) : '••••'} · Set aside{' '}
              {!masked ? formatCompact(setAsideTotal) : '••••'}
              {monthTotal - analyticsTotal - setAsideTotal > 0 &&
                ` · Events ${!masked ? formatCompact(monthTotal - analyticsTotal - setAsideTotal) : '••••'}`}
            </Text>
          </View>

          {/* Spend velocity — current month only */}
          {spendVelocity && (
            <View className="bg-surface border border-theme rounded-xl p-3.5 flex-row items-center gap-4">
              <View className="flex-1 min-w-0">
                <Text className="text-xs text-secondary">
                  {spendVelocity.daysElapsed} of {spendVelocity.daysInMonth} days elapsed
                </Text>
                <Text className="text-sm font-semibold text-primary mt-0.5">
                  On track for {!masked ? formatCurrency(spendVelocity.projected) : '••••'} this month
                </Text>
                <Text className="text-[10px] text-tertiary mt-0.5">
                  Projected at your current pace · excludes event spend
                </Text>
              </View>
              <View className="flex-shrink-0 items-end gap-1">
                <View className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((spendVelocity.daysElapsed / spendVelocity.daysInMonth) * 100)}%`,
                      backgroundColor: theme.primary
                    }}
                  />
                </View>
                <Text className="text-[10px] text-tertiary">
                  {Math.round((spendVelocity.daysElapsed / spendVelocity.daysInMonth) * 100)}% of month
                </Text>
              </View>
            </View>
          )}

          {/* Anomaly nudges */}
          {anomalies.map((a) => (
            <Banner key={a.categoryId} variant="warning" icon="ti-flame">
              <Text className="font-bold">{a.name}</Text> is {Math.round(a.pct * 100)}% over your average
              {!masked && ` (${formatCurrency(a.amount)} vs ~${formatCurrency(a.average)})`}.
            </Banner>
          ))}

          {/* Monthly recap card */}
          {(recap.expense > 0 || recap.income > 0) && (
            <View className="bg-surface border border-theme rounded-2xl p-4 gap-2.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                  {monthLabel(recap.month)} recap
                </Text>
                {recap.deltaPct !== null && (
                  <View className="flex-row items-center gap-0.5">
                    <Icon
                      name={recap.deltaPct > 0 ? 'ti-arrow-up-right' : 'ti-arrow-down-right'}
                      size={13}
                      color={recap.deltaPct > 0 ? theme.danger : theme.success}
                    />
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: recap.deltaPct > 0 ? theme.danger : theme.success }}
                    >
                      {Math.abs(Math.round(recap.deltaPct * 100))}% vs last month
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row flex-wrap gap-y-2">
                <RecapStat label="Spent" value={!masked ? formatCurrency(recap.expense) : '••••'} />
                <RecapStat
                  label="Net"
                  value={!masked ? formatCurrency(recap.net) : '••••'}
                  color={recap.net >= 0 ? theme.success : theme.danger}
                />
                <RecapStat label="Transactions" value={String(recap.txnCount)} />
                {recap.topCategory && (
                  <RecapStat
                    label="Top category"
                    value={recap.topCategory.name + (!masked ? ` · ${formatCompact(recap.topCategory.amount)}` : '')}
                  />
                )}
              </View>
            </View>
          )}

          {/* Donut — daily-routine groups only */}
          {analyticsData.length > 0 && (
            <View className="bg-surface border border-theme rounded-2xl p-4 flex-row items-center gap-4">
              <View className="flex-shrink-0">
                <IntentDonut segments={analyticsData} total={analyticsTotal} theme={theme} />
              </View>
              <View className="gap-1.5 flex-1 min-w-0">
                {analyticsData.slice(0, 5).map((seg) => (
                  <View key={seg.group} className="flex-row items-center gap-1.5">
                    <View className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                    <Text className="text-xs text-secondary flex-1" numberOfLines={1}>
                      {seg.label}
                    </Text>
                    <Text className="text-xs font-medium text-primary flex-shrink-0">
                      {!masked ? formatCompact(seg.amount) : '••••'}
                    </Text>
                  </View>
                ))}
                {analyticsData.length > 5 && (
                  <Text className="text-[10px] text-tertiary mt-0.5">+{analyticsData.length - 5} more groups</Text>
                )}
              </View>
            </View>
          )}

          {/* Events — above groups, only when present */}
          {eventsThisMonth.length > 0 && (
            <>
              <SectionLabel className="-mb-2">Events</SectionLabel>
              {eventsThisMonth.map((ev) => {
                const isExpanded = expandedEventId === ev.id;
                return (
                  <View key={ev.id} className="bg-surface border border-theme rounded-xl overflow-hidden">
                    <Pressable
                      className="px-4 py-3 flex-row items-center gap-3"
                      onPress={() => onChangeExpandedEventId(isExpanded ? null : ev.id)}
                    >
                      <View className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                      <Text className="text-sm font-medium text-primary flex-1" numberOfLines={1}>
                        {ev.name}
                      </Text>
                      <Text className="text-sm font-semibold text-primary flex-shrink-0">
                        {!masked ? formatCurrency(ev.amount) : '••••'}
                      </Text>
                      <Icon
                        name={isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}
                        size={13}
                        color={theme.textTertiary}
                      />
                    </Pressable>
                    {isExpanded && (
                      <View className="border-t border-theme">
                        {ev.cats.map((cat) => (
                          <View
                            key={cat.catId}
                            className="px-4 py-2.5 flex-row items-center gap-2 bg-surface-2 border-b border-theme"
                          >
                            <View
                              className="w-6 h-6 rounded-lg items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: tint(cat.color, 12) }}
                            >
                              <Icon name={cat.icon} size={13} color={cat.color} />
                            </View>
                            <Text className="text-xs text-secondary flex-1" numberOfLines={1}>
                              {cat.name}
                            </Text>
                            <Text className="text-xs font-semibold text-primary flex-shrink-0">
                              {!masked ? formatCurrency(cat.amount) : '••••'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {/* Set aside — non-routine spend (travel, family support, legal, financial, lending),
              summarised on its own so it never distorts the daily-routine picture. */}
          {setAsideData.length > 0 && (
            <>
              <SectionLabel className="-mb-2">Set aside · not daily-routine</SectionLabel>
              <ListContainer>
                {setAsideData.map((seg) => (
                  <View key={seg.group} className="px-4 py-3 flex-row items-center gap-3">
                    <View
                      className="w-7 h-7 rounded-lg items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: tint(seg.color, 12) }}
                    >
                      <Icon name={seg.icon} size={14} color={seg.color} />
                    </View>
                    <Text className="text-sm font-medium text-primary flex-1" numberOfLines={1}>
                      {seg.label}
                    </Text>
                    <Text className="text-sm font-semibold text-primary flex-shrink-0">
                      {!masked ? formatCurrency(seg.amount) : '••••'}
                    </Text>
                  </View>
                ))}
                <View className="px-4 py-2.5 flex-row items-center gap-3 bg-surface-2 border-t border-theme">
                  <Text className="text-xs text-secondary flex-1">Total set aside</Text>
                  <Text className="text-xs font-semibold text-secondary flex-shrink-0">
                    {!masked ? formatCurrency(setAsideTotal) : '••••'}
                  </Text>
                </View>
              </ListContainer>
            </>
          )}

          {/* Groups — compact rows, detail on expand */}
          {analyticsData.length > 0 && (
            <>
              <SectionLabel className="-mb-2">Daily-routine spending</SectionLabel>
              <ListContainer>
                {analyticsData.map((seg) => {
                  const pct = analyticsTotal > 0 ? (seg.amount / analyticsTotal) * 100 : 0;
                  const prevAmount = prevMonthData.get(seg.group) ?? 0;
                  const delta = prevAmount > 0 ? Math.round(((seg.amount - prevAmount) / prevAmount) * 100) : null;
                  const overBudget = seg.budgetTotal > 0 && seg.amount > seg.budgetTotal;
                  const isExpanded = expandedGroup === seg.group;

                  return (
                    <View key={seg.group}>
                      {/* Compact row */}
                      <Pressable
                        className="px-4 py-3 flex-row items-center gap-3"
                        onPress={() => onChangeExpandedGroup(isExpanded ? null : seg.group)}
                      >
                        <View className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                        <Text className="text-sm font-medium text-primary flex-1" numberOfLines={1}>
                          {seg.label} <Text className="font-normal text-tertiary text-xs">({Math.round(pct)}%)</Text>
                        </Text>
                        {delta !== null && (
                          <View
                            className="px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tint(delta > 0 ? theme.danger : theme.success, 14) }}
                          >
                            <Text
                              className="text-[10px] font-semibold"
                              style={{ color: delta > 0 ? theme.danger : theme.success }}
                            >
                              {delta > 0 ? '↑' : '↓'}
                              {Math.abs(delta)}%
                            </Text>
                          </View>
                        )}
                        {overBudget && (
                          <View
                            className="px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tint(theme.danger, 14) }}
                          >
                            <Text className="text-[10px] font-semibold" style={{ color: theme.danger }}>
                              over
                            </Text>
                          </View>
                        )}
                        <Text className="text-sm font-semibold text-primary flex-shrink-0">
                          {!masked ? (
                            seg.budgetTotal > 0 ? (
                              <>
                                {formatCurrency(seg.amount)}{' '}
                                <Text className="text-xs font-normal text-tertiary">
                                  of {formatCurrency(seg.budgetTotal)}
                                </Text>
                              </>
                            ) : (
                              formatCurrency(seg.amount)
                            )
                          ) : (
                            '••••'
                          )}
                        </Text>
                        <Icon
                          name={isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}
                          size={13}
                          color={theme.textTertiary}
                        />
                      </Pressable>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <View className="px-4 pb-3 bg-surface-2 border-t border-theme">
                          {/* Category drill-down */}
                          <View className="mt-1 gap-1">
                            {seg.cats.map((cat) => {
                              const catPct = seg.amount > 0 ? (cat.amount / seg.amount) * 100 : 0;
                              const catBudgetPct = cat.budgetLimit
                                ? Math.min((cat.amount / cat.budgetLimit) * 100, 100)
                                : 0;
                              const catOver = !!cat.budgetLimit && cat.amount > cat.budgetLimit;
                              return (
                                <View key={cat.catId} className="gap-1 py-2 border-t border-theme">
                                  <View className="flex-row items-center gap-2">
                                    <View
                                      className="w-5 h-5 rounded-md items-center justify-center flex-shrink-0"
                                      style={{ backgroundColor: tint(cat.color, 12) }}
                                    >
                                      <Icon name={cat.icon} size={11} color={cat.color} />
                                    </View>
                                    <Text className="text-xs text-secondary flex-1" numberOfLines={1}>
                                      {cat.name}
                                    </Text>
                                    <Text className="text-xs font-semibold text-primary flex-shrink-0">
                                      {!masked ? (
                                        cat.budgetLimit !== undefined ? (
                                          <>
                                            {formatCurrency(cat.amount)}{' '}
                                            <Text className="font-normal text-tertiary">
                                              of {formatCurrency(cat.budgetLimit)}
                                            </Text>
                                          </>
                                        ) : (
                                          formatCurrency(cat.amount)
                                        )
                                      ) : (
                                        '••••'
                                      )}
                                    </Text>
                                  </View>
                                  {/* One bar: budget if set, share-within-group if not */}
                                  {cat.budgetLimit !== undefined ? (
                                    <View className="h-1 rounded-full bg-surface-3">
                                      <View
                                        className="h-1 rounded-full"
                                        style={{
                                          width: `${catBudgetPct}%`,
                                          backgroundColor: catOver ? theme.danger : theme.success
                                        }}
                                      />
                                    </View>
                                  ) : (
                                    <View className="h-1 rounded-full bg-surface-3">
                                      <View
                                        className="h-1 rounded-full"
                                        style={{ width: `${catPct}%`, backgroundColor: cat.color }}
                                      />
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ListContainer>
            </>
          )}

          {/* Non-event hashtag summary — with promote action */}
          {hashtagSummary.length > 0 && (
            <View className="bg-surface border border-theme rounded-xl p-3.5 gap-2.5">
              <SectionLabel>Other hashtags</SectionLabel>
              {hashtagSummary.map(({ tag, amount }) => (
                <View key={tag} className="flex-row items-center gap-2">
                  <Text className="text-sm font-medium flex-1" style={{ color: theme.primary }}>
                    #{tag}
                  </Text>
                  <Text className="text-sm font-semibold text-primary flex-shrink-0">
                    {!masked ? formatCurrency(amount) : '••••'}
                  </Text>
                  <Pressable
                    onPress={() => promoteHashtagToEvent(tag)}
                    className="w-7 h-7 items-center justify-center rounded-lg flex-shrink-0"
                    accessibilityLabel={`Mark #${tag} as event`}
                  >
                    <Icon name="ti-flag-plus" size={15} color={theme.textTertiary} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}

      {/* Month picker modal */}
      {showAnalyticsMonthPicker && (
        <MonthPickerModal
          value={selectedMonth}
          onSelect={onChangeSelectedMonth}
          onClose={() => onChangeShowAnalyticsMonthPicker(false)}
          maxMonth={toMonthYearKey()}
        />
      )}
    </View>
  );
}
