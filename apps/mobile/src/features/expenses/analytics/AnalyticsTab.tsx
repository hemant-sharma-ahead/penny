import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { formatCurrency, formatCompact, formatDate, toMonthYearKey } from '@/lib/formatters';
import { ListContainer, SectionLabel, Banner, Modal } from '~/components/ui';
import { DidYouKnowCard } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import type { ThemeTokens } from '@penny/core/theme/tokens';
import type { Account } from '@/core/db/types';
import type { MonthPoint } from '@/core/expenses/annualAnalytics';
import type { MonthlyRecap, Anomaly } from '@/core/expenses/monthlyInsights';
import type { CashFlowSummary } from '@/core/expenses/cashFlowSummary';
import type { GroupSegment, SetAsideSegment, EventSegment } from './useExpenseAnalytics';
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

/** One Net/Transactions/Top category/Avg-per-day tile — `flex-1` (not a fixed `%` width) so all four
 *  always share one non-wrapping row (2026-08-02, per feedback that 2-per-row wrapping read poorly). */
function RecapStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const theme = useThemeColors();
  return (
    <View className="flex-1 min-w-0">
      <Text className="text-[10px] text-tertiary uppercase tracking-wide" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-sm font-semibold" numberOfLines={1} style={{ color: color ?? theme.textPrimary }}>
        {value}
      </Text>
    </View>
  );
}

/** Dot + label + amount chip — the total-spent routine/set-aside/events breakdown, replacing the old
 *  run-on "Daily-routine ₹X · Set aside ₹Y · Events ₹Z" sentence (see the Pulse Card in
 *  docs/mockups/proposals/analytics-monthly-cards-redesign-v1.html, Option A's chip style). */
function BreakdownChip({
  color,
  label,
  amount,
  masked
}: {
  color: string;
  label: string;
  amount: number;
  masked: boolean;
}) {
  return (
    <View className="flex-row items-center gap-1.5 bg-surface-2 rounded-full py-1 pl-1.5 pr-2.5">
      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-[10px] font-semibold text-secondary">
        {label} {!masked ? formatCompact(amount) : '••••'}
      </Text>
    </View>
  );
}

/** The merged "Total spent" card — total, routine/set-aside/events breakdown, vs-prior-period trend,
 *  recap stats (net/transactions/top category/avg-per-day) and (monthly only) anomaly nudges, all in one
 *  card. Used for both the monthly and annual views (2026-08-02) — same shape, just a different
 *  period/scope, so the redesign requested for Monthly ("similar information... on yearly basis") isn't a
 *  second implementation. */
function PulseCard({
  periodLabel,
  total,
  masked,
  deltaPct,
  deltaLabel,
  routineAmount,
  setAsideAmount,
  eventsAmount,
  hasRecap,
  net,
  txnCount,
  topCategory,
  avgPerDay,
  anomalies
}: {
  periodLabel: string;
  total: number;
  masked: boolean;
  deltaPct: number | null;
  deltaLabel: string;
  routineAmount: number;
  setAsideAmount: number;
  eventsAmount: number;
  hasRecap: boolean;
  net: number;
  txnCount: number;
  topCategory?: { name: string; amount: number };
  avgPerDay: number;
  anomalies?: Anomaly[];
}) {
  const theme = useThemeColors();
  return (
    <View className="bg-surface border border-theme rounded-2xl p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-secondary">Total spent · {periodLabel}</Text>
        {deltaPct !== null && (
          <View className="flex-row items-center gap-0.5">
            <Icon
              name={deltaPct > 0 ? 'ti-arrow-up-right' : 'ti-arrow-down-right'}
              size={12}
              color={deltaPct > 0 ? theme.danger : theme.success}
            />
            <Text className="text-[11px] font-semibold" style={{ color: deltaPct > 0 ? theme.danger : theme.success }}>
              {Math.abs(Math.round(deltaPct * 100))}% {deltaLabel}
            </Text>
          </View>
        )}
      </View>
      <Text className="text-2xl font-bold text-primary mt-0.5">{!masked ? formatCurrency(total) : '••••'}</Text>

      <View className="flex-row flex-wrap gap-1.5 mt-2.5">
        <BreakdownChip color={theme.info} label="Routine" amount={routineAmount} masked={masked} />
        <BreakdownChip color={theme.neutral} label="Set aside" amount={setAsideAmount} masked={masked} />
        {eventsAmount > 0 && (
          <BreakdownChip color={theme.warning} label="Events" amount={eventsAmount} masked={masked} />
        )}
      </View>

      {hasRecap && (
        <View className="flex-row gap-2 mt-3 pt-3 border-t border-theme">
          <RecapStat
            label="Net"
            value={!masked ? formatCurrency(net) : '••••'}
            color={net >= 0 ? theme.success : theme.danger}
          />
          <RecapStat label="Transactions" value={String(txnCount)} />
          {topCategory && (
            <RecapStat
              label="Top category"
              value={topCategory.name + (!masked ? ` · ${formatCompact(topCategory.amount)}` : '')}
            />
          )}
          <RecapStat label="Avg/day" value={!masked ? formatCompact(avgPerDay) : '••••'} />
        </View>
      )}

      {anomalies?.map((a) => (
        <View
          key={a.categoryId}
          className="flex-row items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5 mt-2"
          style={{ backgroundColor: tint(theme.warning, 15) }}
        >
          <Icon name="ti-flame" size={12} color={theme.warning} />
          <Text className="text-[11px]" style={{ color: theme.warning }}>
            <Text className="font-bold">{a.name}</Text> is {Math.round(a.pct * 100)}% over average
            {!masked && ` (${formatCurrency(a.amount)} vs ~${formatCurrency(a.average)})`}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The merged "Cash Flow" tile — one 4-column row (Initial / Income / Spend / Computed left) per account,
 *  all inside one card rather than one card per account. Used for both monthly and annual (2026-08-02) —
 *  same per-account math (`computeCashFlowSummary`), just a different date range.
 *
 *  Column labels (2026-08-02) sit ONCE, above every row, rather than repeated per row — that single header
 *  is what guarantees every account's Initial/Income/Spend/Computed-left line up vertically (every row
 *  below shares the exact same 4-equal-column layout the header defines). Values use `formatCompact`
 *  (₹79.6L, not ₹79,59,335) + `numberOfLines`/`adjustsFontSizeToFit` so a large balance never wraps to a
 *  second line. "Computed left" is labelled explicitly (not just "Left") because it's a derived figure
 *  from your logged transactions — it matches the account's real running balance carried into the next
 *  period UNLESS that account was reconciled during this one, in which case the banner below states the
 *  real reconciled figure and the gap explicitly. */
function CashFlowTile({
  periodLabel,
  summaries,
  masked
}: {
  periodLabel: string;
  summaries: Array<{ account: Account; summary: CashFlowSummary }>;
  masked: boolean;
}) {
  const theme = useThemeColors();
  if (summaries.length === 0) return null;
  const fmt = (n: number) => (!masked ? formatCompact(n) : '••••');
  return (
    <View className="bg-surface border border-theme rounded-2xl p-4">
      <View className="flex-row items-center gap-1.5 mb-2">
        <Icon name="ti-wallet" size={14} color={theme.warning} />
        <Text className="text-xs font-semibold text-primary">Cash Flow · {periodLabel}</Text>
      </View>

      <View className="flex-row gap-1.5">
        <Text className="flex-1 text-[9px] text-tertiary uppercase tracking-wide" numberOfLines={1}>
          Initial
        </Text>
        <Text className="flex-1 text-[9px] text-tertiary uppercase tracking-wide" numberOfLines={1}>
          Income
        </Text>
        <Text className="flex-1 text-[9px] text-tertiary uppercase tracking-wide" numberOfLines={1}>
          Spend
        </Text>
        <Text className="flex-1 text-[9px] text-tertiary uppercase tracking-wide" numberOfLines={1}>
          Computed left
        </Text>
      </View>

      {summaries.map(({ account, summary }, i) => (
        <View key={account.id} className={`py-2.5 ${i > 0 ? 'border-t border-dashed border-theme' : ''}`}>
          <View className="flex-row items-center gap-1.5 mb-1.5">
            <View
              className="w-5 h-5 rounded-md items-center justify-center"
              style={{ backgroundColor: tint(account.color, 13) }}
            >
              <Icon name={account.icon} size={11} color={account.color} />
            </View>
            <Text className="text-[11.5px] font-semibold text-primary" numberOfLines={1}>
              {account.name}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Text
              className="flex-1 text-[13px] font-bold text-primary"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {fmt(summary.initial)}
            </Text>
            <Text
              className="flex-1 text-[13px] font-bold"
              style={{ color: theme.success }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              +{fmt(summary.income)}
            </Text>
            <Text
              className="flex-1 text-[13px] font-bold"
              style={{ color: theme.danger }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              -{fmt(summary.expenses)}
            </Text>
            <View className="flex-1 items-start">
              <View
                className="rounded-md px-1.5 py-0.5 max-w-full"
                style={{ backgroundColor: tint(theme.primary, 15) }}
              >
                <Text
                  className="text-[13px] font-extrabold"
                  style={{ color: theme.primary }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {fmt(summary.computedLeft)}
                </Text>
              </View>
            </View>
          </View>
          {summary.reconciledActual !== undefined && summary.reconciledDate !== undefined && (
            <Banner variant="warning" icon="ti-alert-triangle" className="mt-1.5">
              <Text className="font-bold">
                You reconciled to {!masked ? formatCurrency(summary.reconciledActual) : '••••'}
              </Text>{' '}
              on {formatDate(summary.reconciledDate)}
              {!masked &&
                ` — ${formatCurrency(Math.abs(summary.reconciledActual - summary.computedLeft))} ${
                  summary.reconciledActual > summary.computedLeft ? 'more' : 'less'
                } than your logged transactions account for.`}
            </Banner>
          )}
        </View>
      ))}
    </View>
  );
}

// ── Month picker modal ────────────────────────────────────────────────────────

const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** All Time's `DailyRoutineSection` has no "previous period" to diff against (see this file's All Time
 *  render block) — a stable empty `Map` so every group's delta badge computation harmlessly no-ops
 *  (`prevAmount` is always 0 → `delta` stays `null`) without allocating a fresh Map every render. */
const EMPTY_PREV_GROUP_DATA = new Map<string, number>();

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

function IntentDonut({
  segments,
  total,
  theme,
  caption
}: {
  segments: DonutSegment[];
  total: number;
  theme: ThemeTokens;
  caption: string;
}) {
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
        {caption}
      </SvgText>
    </Svg>
  );
}

/** "Daily Living" card — the ring + top-5 groups list. Shared by the monthly and annual views
 *  (2026-08-02) — same component, just a different scope's `GroupSegment[]`/total/caption. */
function DailyLivingCard({
  segments,
  total,
  masked,
  caption
}: {
  segments: GroupSegment[];
  total: number;
  masked: boolean;
  caption: string;
}) {
  const theme = useThemeColors();
  if (segments.length === 0) return null;
  return (
    <View className="bg-surface border border-theme rounded-2xl p-4 flex-row items-center gap-4">
      <View className="flex-shrink-0">
        <IntentDonut segments={segments} total={total} theme={theme} caption={caption} />
      </View>
      <View className="gap-1.5 flex-1 min-w-0">
        {segments.slice(0, 5).map((seg) => (
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
        {segments.length > 5 && (
          <Text className="text-[10px] text-tertiary mt-0.5">+{segments.length - 5} more groups</Text>
        )}
      </View>
    </View>
  );
}

/** Events breakdown — shared by monthly and annual (2026-08-02). */
function EventsSection({
  events,
  expandedEventId,
  onChangeExpandedEventId,
  masked
}: {
  events: EventSegment[];
  expandedEventId: string | null;
  onChangeExpandedEventId: (id: string | null) => void;
  masked: boolean;
}) {
  const theme = useThemeColors();
  if (events.length === 0) return null;
  return (
    <>
      <SectionLabel className="-mb-2">Events</SectionLabel>
      {events.map((ev) => {
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
              <Icon name={isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={13} color={theme.textTertiary} />
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
  );
}

/** "Set aside" (non-routine spend) breakdown — shared by monthly and annual (2026-08-02).
 *
 *  Item 24 (docs/plans/real-device-testing-pass.md Phase 2): rebuilt to mirror
 *  `DailyRoutineSection`'s exact expand/collapse pattern (tap a row → nested category breakdown +
 *  "View all transactions" link) instead of tapping straight through to the transactions modal.
 *  `expandedGroup` is the SAME lifted state `DailyRoutineSection` uses, not a second one — a Set Aside
 *  group's key and a Daily Routine group's key are guaranteed disjoint by `classify()` (a group is
 *  exclusively 'routine' or 'setAside'), so sharing it is safe and keeps this screen to "only one
 *  expanded group open at a time" overall, matching Daily Routine's own single-expansion design intent
 *  rather than letting both sections balloon open independently. The compact row keeps its own existing
 *  icon-square look (distinct from Daily Routine's colored dot) — only the interaction/expand behavior
 *  needs to match, not the row's visual style. */
function SetAsideSection({
  data,
  total,
  expandedGroup,
  onChangeExpandedGroup,
  masked,
  onViewCategory,
  onViewGroup
}: {
  data: SetAsideSegment[];
  total: number;
  expandedGroup: string | null;
  onChangeExpandedGroup: (g: string | null) => void;
  masked: boolean;
  onViewCategory: (catId: string, label: string) => void;
  onViewGroup: (group: string, label: string) => void;
}) {
  const theme = useThemeColors();
  if (data.length === 0) return null;
  return (
    <>
      <SectionLabel className="-mb-2">Set aside · not daily-routine</SectionLabel>
      <ListContainer>
        {data.map((seg) => {
          const isExpanded = expandedGroup === seg.group;
          return (
            <View key={seg.group}>
              {/* Compact row */}
              <Pressable
                className="px-4 py-3 flex-row items-center gap-3"
                onPress={() => onChangeExpandedGroup(isExpanded ? null : seg.group)}
              >
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
                <Icon name={isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={13} color={theme.textTertiary} />
              </Pressable>

              {/* Expanded detail */}
              {isExpanded && (
                <View className="px-4 pb-3 bg-surface-2 border-t border-theme">
                  <View className="mt-1 gap-1">
                    {seg.cats.map((cat) => {
                      const catPct = seg.amount > 0 ? (cat.amount / seg.amount) * 100 : 0;
                      return (
                        <Pressable
                          key={cat.catId}
                          onPress={() => onViewCategory(cat.catId, cat.name)}
                          className="gap-1 py-2 border-t border-theme"
                        >
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
                              {!masked ? formatCurrency(cat.amount) : '••••'}
                            </Text>
                            <Icon name="ti-chevron-right" size={11} color={theme.textTertiary} />
                          </View>
                          <View className="h-1 rounded-full bg-surface-3">
                            <View
                              className="h-1 rounded-full"
                              style={{ width: `${catPct}%`, backgroundColor: cat.color }}
                            />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    onPress={() => onViewGroup(seg.group, seg.label)}
                    className="flex-row items-center gap-1 pt-2.5 self-start"
                  >
                    <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                      View all transactions in {seg.label}
                    </Text>
                    <Icon name="ti-chevron-right" size={12} color={theme.primary} />
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
        <View className="px-4 py-2.5 flex-row items-center gap-3 bg-surface-2 border-t border-theme">
          <Text className="text-xs text-secondary flex-1">Total set aside</Text>
          <Text className="text-xs font-semibold text-secondary flex-shrink-0">
            {!masked ? formatCurrency(total) : '••••'}
          </Text>
        </View>
      </ListContainer>
    </>
  );
}

/** "Daily-routine spending" expandable group list — shared by monthly and annual (2026-08-02). Budget
 *  overlays only ever appear when `seg.budgetTotal > 0`, which is only true for the monthly scope (budgets
 *  are a monthly-only concept — the annual caller passes groups with `budgetTotal: 0`), so this degrades
 *  gracefully to a plain amount list for the year without any annual-specific branching. */
function DailyRoutineSection({
  data,
  total,
  prevGroupData,
  expandedGroup,
  onChangeExpandedGroup,
  masked,
  onViewCategory,
  onViewGroup
}: {
  data: GroupSegment[];
  total: number;
  prevGroupData: Map<string, number>;
  expandedGroup: string | null;
  onChangeExpandedGroup: (g: string | null) => void;
  masked: boolean;
  onViewCategory: (catId: string, label: string) => void;
  onViewGroup: (group: string, label: string) => void;
}) {
  const theme = useThemeColors();
  if (data.length === 0) return null;
  return (
    <>
      <SectionLabel className="-mb-2">Daily-routine spending</SectionLabel>
      <ListContainer>
        {data.map((seg) => {
          const pct = total > 0 ? (seg.amount / total) * 100 : 0;
          const prevAmount = prevGroupData.get(seg.group) ?? 0;
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
                        <Text className="text-xs font-normal text-tertiary">of {formatCurrency(seg.budgetTotal)}</Text>
                      </>
                    ) : (
                      formatCurrency(seg.amount)
                    )
                  ) : (
                    '••••'
                  )}
                </Text>
                <Icon name={isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={13} color={theme.textTertiary} />
              </Pressable>

              {/* Expanded detail */}
              {isExpanded && (
                <View className="px-4 pb-3 bg-surface-2 border-t border-theme">
                  {/* Category drill-down */}
                  <View className="mt-1 gap-1">
                    {seg.cats.map((cat) => {
                      const catPct = seg.amount > 0 ? (cat.amount / seg.amount) * 100 : 0;
                      const catBudgetPct = cat.budgetLimit ? Math.min((cat.amount / cat.budgetLimit) * 100, 100) : 0;
                      const catOver = !!cat.budgetLimit && cat.amount > cat.budgetLimit;
                      return (
                        <Pressable
                          key={cat.catId}
                          onPress={() => onViewCategory(cat.catId, cat.name)}
                          className="gap-1 py-2 border-t border-theme"
                        >
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
                            <Icon name="ti-chevron-right" size={11} color={theme.textTertiary} />
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
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    onPress={() => onViewGroup(seg.group, seg.label)}
                    className="flex-row items-center gap-1 pt-2.5 self-start"
                  >
                    <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                      View all transactions in {seg.label}
                    </Text>
                    <Icon name="ti-chevron-right" size={12} color={theme.primary} />
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </ListContainer>
    </>
  );
}

/** Non-event hashtag summary (with promote-to-event action) — shared by monthly and annual (2026-08-02). */
function HashtagsSection({
  data,
  masked,
  onViewTag,
  promoteHashtagToEvent
}: {
  data: Array<{ tag: string; amount: number }>;
  masked: boolean;
  onViewTag: (tag: string) => void;
  promoteHashtagToEvent: (tag: string) => void;
}) {
  const theme = useThemeColors();
  if (data.length === 0) return null;
  return (
    <View className="bg-surface border border-theme rounded-xl p-3.5 gap-2.5">
      <SectionLabel>Other hashtags</SectionLabel>
      {data.map(({ tag, amount }) => (
        <View key={tag} className="flex-row items-center gap-2">
          <Pressable onPress={() => onViewTag(tag)} className="flex-row items-center gap-2 flex-1">
            <Text className="text-sm font-medium flex-1" style={{ color: theme.primary }} numberOfLines={1}>
              #{tag}
            </Text>
            <Text className="text-sm font-semibold text-primary flex-shrink-0">
              {!masked ? formatCurrency(amount) : '••••'}
            </Text>
          </Pressable>
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
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type AnalyticsViewMode = 'monthly' | 'annual' | 'allTime';

/** Segmented-control labels — kept as an explicit map rather than deriving from the mode string (e.g.
 *  capitalizing `v`), since `'allTime'.charAt(0).toUpperCase() + 'allTime'.slice(1)` would render
 *  "AllTime" with no space, not the "All Time" label the approved mockup uses. */
const VIEW_LABELS: Record<AnalyticsViewMode, string> = { monthly: 'Monthly', annual: 'Annual', allTime: 'All Time' };

interface AnalyticsTabProps {
  analyticsView: AnalyticsViewMode;
  onChangeAnalyticsView: (v: AnalyticsViewMode) => void;
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
  analyticsData: GroupSegment[];
  analyticsTotal: number;
  monthTotal: number;
  setAsideData: SetAsideSegment[];
  setAsideTotal: number;
  prevMonthData: Map<string, number>;
  spendVelocity: { daysElapsed: number; daysInMonth: number; projected: number } | null;
  monthlyAvgPerDay: number;
  recap: MonthlyRecap;
  anomalies: Anomaly[];
  cashFlowSummaries: Array<{ account: Account; summary: CashFlowSummary }>;
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
  /** Annual equivalents (2026-08-02) of every monthly breakdown — same shapes/semantics scoped to
   *  `analyticsYear` instead of `selectedMonth` — see `useExpenseAnalytics.ts`. */
  annualCashFlowSummaries: Array<{ account: Account; summary: CashFlowSummary }>;
  annualGroupData: GroupSegment[];
  annualGroupTotal: number;
  annualSetAsideData: SetAsideSegment[];
  annualSetAsideTotal: number;
  annualEvents: EventSegment[];
  annualHashtagSummary: Array<{ tag: string; amount: number }>;
  prevYearGroupData: Map<string, number>;
  annualRecap: { txnCount: number; topCategory?: { name: string; amount: number } };
  annualDeltaPct: number | null;
  annualAvgPerDay: number;
  /** All Time equivalents (2026-08-16) of the monthly/annual breakdowns above — unscoped (every
   *  expense-type transaction ever recorded). Deliberately has NO delta/anomaly/velocity/movers/chart
   *  counterpart — see `AnalyticsTab`'s render body and `useExpenseAnalytics.ts` for why. */
  allTimeGroupData: GroupSegment[];
  allTimeGroupTotal: number;
  allTimeSetAsideData: SetAsideSegment[];
  allTimeSetAsideTotal: number;
  allTimeEvents: EventSegment[];
  allTimeHashtagSummary: Array<{ tag: string; amount: number }>;
  allTimeCashFlowSummaries: Array<{ account: Account; summary: CashFlowSummary }>;
  allTimeTotal: number;
  allTimeNet: number;
  allTimeRecap: { txnCount: number; topCategory?: { name: string; amount: number } };
  allTimeAvgPerDay: number;
  eventsThisMonth: EventSegment[];
  hashtagSummary: Array<{ tag: string; amount: number }>;
  masked: boolean;
  promoteHashtagToEvent: (tag: string) => void;
  /** "View transactions" drill-down (2026-08-02) — opens `EntityTransactionsModal` right here, scoped to
   *  whichever group/category/tag was tapped (in whichever view — monthly or annual — is open). See
   *  `AnalyticsSlice.tsx`'s own doc comment for why this is an in-place modal rather than a deep-link to
   *  the Transactions tab. */
  onViewGroup: (group: string, label: string) => void;
  onViewCategory: (catId: string, label: string) => void;
  onViewTag: (tag: string) => void;
  /** Tier 2 "Did You Know" ambient card (2026-08-16) — sits at the very bottom, below whichever view
   *  (Monthly/Annual/All Time) is active. Navigates to the "Discover Penny" hub. */
  onSeeAllTips: () => void;
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
  monthlyAvgPerDay,
  recap,
  anomalies,
  cashFlowSummaries,
  annualData,
  prevYearData,
  annualSavings,
  annualMovers,
  annualTotal,
  annualMax,
  annualCashFlowSummaries,
  annualGroupData,
  annualGroupTotal,
  annualSetAsideData,
  annualSetAsideTotal,
  annualEvents,
  annualHashtagSummary,
  prevYearGroupData,
  annualRecap,
  annualDeltaPct,
  annualAvgPerDay,
  allTimeGroupData,
  allTimeGroupTotal,
  allTimeSetAsideData,
  allTimeSetAsideTotal,
  allTimeEvents,
  allTimeHashtagSummary,
  allTimeCashFlowSummaries,
  allTimeTotal,
  allTimeNet,
  allTimeRecap,
  allTimeAvgPerDay,
  eventsThisMonth,
  hashtagSummary,
  masked,
  promoteHashtagToEvent,
  onViewGroup,
  onViewCategory,
  onViewTag,
  onSeeAllTips
}: AnalyticsTabProps) {
  const theme = useThemeColors();

  return (
    <View className="px-4 py-4 gap-4">
      {/* View toggle + navigation */}
      <View className="flex-row items-center justify-between gap-3">
        {/* Monthly / Annual / All Time toggle */}
        <View className="flex-row gap-0.5 bg-surface-2 rounded-lg p-0.5 flex-shrink-0">
          {(['monthly', 'annual', 'allTime'] as const).map((v) => (
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
                {VIEW_LABELS[v]}
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
              {/* Daily Living card — up top (2026-08-02), same as monthly. */}
              <DailyLivingCard
                segments={annualGroupData}
                total={annualGroupTotal}
                masked={masked}
                caption="this year"
              />

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

              {/* "Pulse card" + "Cash Flow" tile — same cards as the monthly view, scoped to the whole
                  year (2026-08-02), positioned right after the chart. */}
              <PulseCard
                periodLabel={String(analyticsYear)}
                total={annualTotal}
                masked={masked}
                deltaPct={annualDeltaPct}
                deltaLabel="vs last year"
                routineAmount={annualGroupTotal}
                setAsideAmount={annualSetAsideTotal}
                eventsAmount={annualTotal - annualGroupTotal - annualSetAsideTotal}
                hasRecap={annualSavings.income > 0 || annualTotal > 0}
                net={annualSavings.saved}
                txnCount={annualRecap.txnCount}
                topCategory={annualRecap.topCategory}
                avgPerDay={annualAvgPerDay}
              />

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

              {/* Events / Daily-routine / Set-aside detail / hashtags — annual scope (2026-08-02), same
                  sections the monthly view shows below its own Pulse Card. Daily Routine ahead of Set
                  Aside, and Cash Flow moved to the very end (2026-08-18 reorder, per real-device testing
                  feedback) — nothing else in this list moved. */}
              <EventsSection
                events={annualEvents}
                expandedEventId={expandedEventId}
                onChangeExpandedEventId={onChangeExpandedEventId}
                masked={masked}
              />
              <DailyRoutineSection
                data={annualGroupData}
                total={annualGroupTotal}
                prevGroupData={prevYearGroupData}
                expandedGroup={expandedGroup}
                onChangeExpandedGroup={onChangeExpandedGroup}
                masked={masked}
                onViewCategory={onViewCategory}
                onViewGroup={onViewGroup}
              />
              <SetAsideSection
                data={annualSetAsideData}
                total={annualSetAsideTotal}
                expandedGroup={expandedGroup}
                onChangeExpandedGroup={onChangeExpandedGroup}
                masked={masked}
                onViewCategory={onViewCategory}
                onViewGroup={onViewGroup}
              />
              <HashtagsSection
                data={annualHashtagSummary}
                masked={masked}
                onViewTag={onViewTag}
                promoteHashtagToEvent={promoteHashtagToEvent}
              />
              <CashFlowTile periodLabel={String(analyticsYear)} summaries={annualCashFlowSummaries} masked={masked} />

              <Text className="text-[11px] text-center text-tertiary">
                Tap any month in the chart to open its details.
              </Text>
            </>
          )}
        </>
      )}

      {/* ── All Time view (2026-08-16) ── per the approved mockup (docs/mockups/proposals/
          expenses-batch-fixes-v1.html §3): Daily Living, the Total-spent (Pulse) card, Cash Flow, and the
          Events/Set-aside/Daily-routine/Hashtags breakdowns all carry over unchanged (same scope-generic
          components, just fed the unscoped `allTimeXxx` data) — but the Pulse Card gets no delta badge
          (`deltaPct={null}`) and no anomalies, and there's deliberately no spend-velocity card, Biggest
          Movers card, or income-vs-spend chart here: all of those need a "previous period" that a lifetime
          scope doesn't have, and faking one would show a number nobody asked for. */}
      {analyticsView === 'allTime' && (
        <>
          {allTimeGroupData.length === 0 && allTimeSetAsideData.length === 0 && allTimeEvents.length === 0 ? (
            <View className="p-10 items-center">
              <Icon name="ti-chart-donut" size={44} color={theme.textTertiary} />
              <Text className="text-sm mt-3 text-tertiary">No expenses recorded yet.</Text>
            </View>
          ) : (
            <>
              <DailyLivingCard
                segments={allTimeGroupData}
                total={allTimeGroupTotal}
                masked={masked}
                caption="all time"
              />

              <PulseCard
                periodLabel="All time"
                total={allTimeTotal}
                masked={masked}
                deltaPct={null}
                deltaLabel=""
                routineAmount={allTimeGroupTotal}
                setAsideAmount={allTimeSetAsideTotal}
                eventsAmount={allTimeTotal - allTimeGroupTotal - allTimeSetAsideTotal}
                hasRecap={allTimeRecap.txnCount > 0}
                net={allTimeNet}
                txnCount={allTimeRecap.txnCount}
                topCategory={allTimeRecap.topCategory}
                avgPerDay={allTimeAvgPerDay}
              />

              {/* 2026-08-18 reorder (real-device testing feedback): Daily Routine ahead of Set Aside,
                  Cash Flow moved to the very end — nothing else here moved. */}
              <EventsSection
                events={allTimeEvents}
                expandedEventId={expandedEventId}
                onChangeExpandedEventId={onChangeExpandedEventId}
                masked={masked}
              />
              <DailyRoutineSection
                data={allTimeGroupData}
                total={allTimeGroupTotal}
                prevGroupData={EMPTY_PREV_GROUP_DATA}
                expandedGroup={expandedGroup}
                onChangeExpandedGroup={onChangeExpandedGroup}
                masked={masked}
                onViewCategory={onViewCategory}
                onViewGroup={onViewGroup}
              />
              <SetAsideSection
                data={allTimeSetAsideData}
                total={allTimeSetAsideTotal}
                expandedGroup={expandedGroup}
                onChangeExpandedGroup={onChangeExpandedGroup}
                masked={masked}
                onViewCategory={onViewCategory}
                onViewGroup={onViewGroup}
              />
              <HashtagsSection
                data={allTimeHashtagSummary}
                masked={masked}
                onViewTag={onViewTag}
                promoteHashtagToEvent={promoteHashtagToEvent}
              />
              <CashFlowTile periodLabel="All time" summaries={allTimeCashFlowSummaries} masked={masked} />
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
          {/* Daily Living card — up top (2026-08-02, per user request), ahead of Total spent/Cash Flow. */}
          <DailyLivingCard segments={analyticsData} total={analyticsTotal} masked={masked} caption="this month" />

          {/* "Pulse card" + "Cash Flow" tile — see their own doc comments above for what each merges and
              why. Shared with the annual view above. */}
          <PulseCard
            periodLabel={monthLabel(selectedMonth)}
            total={monthTotal}
            masked={masked}
            deltaPct={recap.expense > 0 || recap.income > 0 ? recap.deltaPct : null}
            deltaLabel="vs last month"
            routineAmount={analyticsTotal}
            setAsideAmount={setAsideTotal}
            eventsAmount={monthTotal - analyticsTotal - setAsideTotal}
            hasRecap={recap.expense > 0 || recap.income > 0}
            net={recap.net}
            txnCount={recap.txnCount}
            topCategory={recap.topCategory}
            avgPerDay={monthlyAvgPerDay}
            anomalies={anomalies}
          />

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

          {/* 2026-08-18 reorder (real-device testing feedback): Daily Routine ahead of Set Aside, Cash
              Flow moved to the very end — nothing else here moved. */}
          <EventsSection
            events={eventsThisMonth}
            expandedEventId={expandedEventId}
            onChangeExpandedEventId={onChangeExpandedEventId}
            masked={masked}
          />
          <DailyRoutineSection
            data={analyticsData}
            total={analyticsTotal}
            prevGroupData={prevMonthData}
            expandedGroup={expandedGroup}
            onChangeExpandedGroup={onChangeExpandedGroup}
            masked={masked}
            onViewCategory={onViewCategory}
            onViewGroup={onViewGroup}
          />
          <SetAsideSection
            data={setAsideData}
            total={setAsideTotal}
            expandedGroup={expandedGroup}
            onChangeExpandedGroup={onChangeExpandedGroup}
            masked={masked}
            onViewCategory={onViewCategory}
            onViewGroup={onViewGroup}
          />
          <HashtagsSection
            data={hashtagSummary}
            masked={masked}
            onViewTag={onViewTag}
            promoteHashtagToEvent={promoteHashtagToEvent}
          />
          <CashFlowTile periodLabel={monthLabel(selectedMonth)} summaries={cashFlowSummaries} masked={masked} />
        </>
      ) : null}

      {/* Tier 2 "Did You Know" ambient card (2026-08-16) — always at the very bottom, regardless of which
          view is active. Prefers Analytics-tagged curated facts first (falls back to the general curated
          pool if that's ever exhausted — see DidYouKnowCard.tsx). */}
      <DidYouKnowCard module="analytics" onSeeAll={onSeeAllTips} />

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
