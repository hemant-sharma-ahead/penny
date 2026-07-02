import { useState } from 'react';
import { formatCurrency, formatCompact, toMonthYearKey } from '@/lib/formatters';
import { STATUS, tint } from '@/lib/statusColors';
import { ListContainer, SectionLabel, Banner } from '@/components/ui';
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
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-tertiary uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold truncate" style={{ color: color ?? 'var(--color-text-primary)' }}>
        {value}
      </p>
    </div>
  );
}

// ── Month picker modal ────────────────────────────────────────────────────────

const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  const [year, setYear] = useState(() => parseInt(value.split('-')[0] ?? String(new Date().getFullYear()), 10));
  const maxYear = maxMonth
    ? parseInt(maxMonth.split('-')[0] ?? String(new Date().getFullYear()), 10)
    : new Date().getFullYear();

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center px-4"
      style={{ paddingTop: 56, paddingBottom: 72 }}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-surface rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2"
          >
            <i className="ti ti-chevron-left" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
          <span className="text-base font-semibold text-primary">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= maxYear}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2 disabled:opacity-30"
          >
            <i className="ti ti-chevron-right" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {MONTH_LABELS_SHORT.map((label, idx) => {
            const m = `${year}-${String(idx + 1).padStart(2, '0')}`;
            const isSelected = m === value;
            const isDisabled = maxMonth ? m > maxMonth : false;
            return (
              <button
                key={m}
                onClick={() => {
                  onSelect(m);
                  onClose();
                }}
                disabled={isDisabled}
                className="py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-30"
                style={
                  isSelected
                    ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                    : { backgroundColor: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)' }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────

interface DonutSegment {
  group: string;
  amount: number;
  color: string;
  label: string;
}

function buildDonutPlots(segments: DonutSegment[], total: number, C: number, GAP: number) {
  let cum = 0;
  return segments
    .filter((s) => s.amount > 0)
    .map((seg) => {
      const fraction = seg.amount / total;
      const dash = Math.max(fraction * C - GAP, 0);
      const offset = -cum;
      cum += fraction * C;
      return { ...seg, dash, offset };
    });
}

function IntentDonut({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const R = 58;
  const CX = 80;
  const CY = 80;
  const C = 2 * Math.PI * R;
  const plotted = buildDonutPlots(segments, total, C, 2);

  return (
    <svg viewBox="0 0 160 160" width="160" height="160" aria-label="Spending by category">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-border)" strokeWidth={20} />
      {plotted.map((seg, i) => (
        <circle
          key={i}
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={seg.color}
          strokeWidth={20}
          strokeDasharray={`${seg.dash} ${C}`}
          strokeDashoffset={seg.offset}
          transform={`rotate(-90, ${CX}, ${CY})`}
        />
      ))}
      <text x={CX} y={CY - 7} textAnchor="middle" fill="var(--color-text-primary)" fontSize="17" fontWeight="700">
        {formatCompact(total)}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="9">
        this month
      </text>
    </svg>
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
  mode: 'open' | 'safe' | 'privacy';
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
  mode,
  promoteHashtagToEvent
}: AnalyticsTabProps) {
  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      {/* View toggle + navigation */}
      <div className="flex items-center justify-between gap-3">
        {/* Monthly / Annual toggle */}
        <div className="flex gap-0.5 bg-surface-2 rounded-lg p-0.5 flex-shrink-0">
          {(['monthly', 'annual'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onChangeAnalyticsView(v)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={
                analyticsView === v
                  ? {
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }
                  : { color: 'var(--color-text-tertiary)' }
              }
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Monthly navigation */}
        {analyticsView === 'monthly' && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                onChangeSelectedMonth(offsetMonth(selectedMonth, -1));
                onChangeExpandedGroup(null);
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2"
              aria-label="Previous month"
            >
              <i className="ti ti-chevron-left" style={{ fontSize: 16 }} aria-hidden="true" />
            </button>
            <button
              onClick={() => onChangeShowAnalyticsMonthPicker(true)}
              className="px-2.5 py-1 rounded-lg text-sm font-semibold text-primary hover:bg-surface-2 transition-colors"
            >
              {monthLabel(selectedMonth)}
            </button>
            <button
              onClick={() => {
                onChangeSelectedMonth(offsetMonth(selectedMonth, 1));
                onChangeExpandedGroup(null);
              }}
              disabled={selectedMonth >= toMonthYearKey()}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2 disabled:opacity-30"
              aria-label="Next month"
            >
              <i className="ti ti-chevron-right" style={{ fontSize: 16 }} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Annual navigation */}
        {analyticsView === 'annual' && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChangeAnalyticsYear(analyticsYear - 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2"
              aria-label="Previous year"
            >
              <i className="ti ti-chevron-left" style={{ fontSize: 16 }} aria-hidden="true" />
            </button>
            <span className="px-2.5 py-1 text-sm font-semibold text-primary">{analyticsYear}</span>
            <button
              onClick={() => onChangeAnalyticsYear(analyticsYear + 1)}
              disabled={analyticsYear >= new Date().getFullYear()}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2 disabled:opacity-30"
              aria-label="Next year"
            >
              <i className="ti ti-chevron-right" style={{ fontSize: 16 }} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* ── Annual view ── */}
      {analyticsView === 'annual' && (
        <>
          {annualTotal === 0 && annualSavings.income === 0 ? (
            <div className="p-10 text-center">
              <i className="ti ti-chart-bar text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
              <p className="text-sm mt-3 text-tertiary">No activity in {analyticsYear}.</p>
            </div>
          ) : (
            <>
              {/* Savings-rate headline */}
              {annualSavings.income > 0 && (
                <div className="surface rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-tertiary uppercase tracking-wide">
                      Saved in {analyticsYear}
                    </p>
                    <p
                      className="text-lg font-bold"
                      style={{ color: annualSavings.saved >= 0 ? STATUS.success : STATUS.danger }}
                    >
                      {mode === 'open' ? formatCurrency(annualSavings.saved) : '••••'}
                    </p>
                  </div>
                  <div
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: annualSavings.saved >= 0 ? STATUS.success : STATUS.danger }}
                  >
                    {Math.round(annualSavings.rate * 100)}%
                  </div>
                </div>
              )}

              {/* Income vs expense chart */}
              <div className="surface rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-tertiary uppercase tracking-wide">Income vs spend</p>
                  <p className="text-sm font-semibold text-primary">
                    Spent {mode === 'open' ? formatCurrency(annualTotal) : '••••'}
                  </p>
                </div>
                <AnnualChart
                  series={annualData}
                  prevYear={prevYearData}
                  max={annualMax}
                  mode={mode}
                  onSelectMonth={(m) => {
                    onChangeSelectedMonth(m);
                    onChangeAnalyticsView('monthly');
                    onChangeExpandedGroup(null);
                  }}
                />
              </div>

              {/* Biggest movers */}
              {annualMovers.length > 0 && (
                <div>
                  <SectionLabel>Biggest movers · last month</SectionLabel>
                  <ListContainer>
                    {annualMovers.map((mv) => {
                      const up = mv.pct >= 0;
                      return (
                        <div key={mv.categoryId} className="flex items-center gap-3 px-4 py-3">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: mv.color }} />
                          <span className="text-sm font-medium text-primary flex-1">{mv.name}</span>
                          <span
                            className="text-sm font-semibold flex items-center gap-0.5"
                            style={{ color: up ? STATUS.danger : STATUS.success }}
                          >
                            <i
                              className={`ti ${up ? 'ti-arrow-up-right' : 'ti-arrow-down-right'}`}
                              style={{ fontSize: 14 }}
                              aria-hidden="true"
                            />
                            {Math.abs(Math.round(mv.pct * 100))}%
                          </span>
                        </div>
                      );
                    })}
                  </ListContainer>
                  <p className="text-[11px] text-tertiary mt-1.5 px-1">vs your prior 3-month average</p>
                </div>
              )}

              <p className="text-[11px] text-center text-tertiary">Tap any month in the chart to open its details.</p>
            </>
          )}
        </>
      )}

      {/* ── Monthly view ── */}
      {analyticsView === 'monthly' &&
      analyticsData.length === 0 &&
      setAsideData.length === 0 &&
      eventsThisMonth.length === 0 ? (
        <div className="p-10 text-center">
          <i className="ti ti-chart-donut text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
          <p className="text-sm mt-3 text-tertiary">No expenses in {monthLabel(selectedMonth)}.</p>
        </div>
      ) : analyticsView === 'monthly' ? (
        <>
          {/* All-inclusive month total — daily-routine + set aside + events */}
          <div className="surface rounded-xl p-4">
            <p className="text-xs text-secondary">Total spent · {monthLabel(selectedMonth)}</p>
            <p className="text-2xl font-bold text-primary mt-0.5">
              {mode === 'open' ? formatCurrency(monthTotal) : '••••'}
            </p>
            <p className="text-[11px] text-tertiary mt-1">
              Daily-routine {mode === 'open' ? formatCompact(analyticsTotal) : '••••'} · Set aside{' '}
              {mode === 'open' ? formatCompact(setAsideTotal) : '••••'}
              {monthTotal - analyticsTotal - setAsideTotal > 0 &&
                ` · Events ${mode === 'open' ? formatCompact(monthTotal - analyticsTotal - setAsideTotal) : '••••'}`}
            </p>
          </div>

          {/* Spend velocity — current month only */}
          {spendVelocity && (
            <div className="surface rounded-xl p-3.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-secondary">
                  {spendVelocity.daysElapsed} of {spendVelocity.daysInMonth} days elapsed
                </p>
                <p className="text-sm font-semibold text-primary mt-0.5">
                  On track for {mode === 'open' ? formatCurrency(spendVelocity.projected) : '••••'} this month
                </p>
                <p className="text-[10px] text-tertiary mt-0.5">
                  Projected at your current pace · excludes event spend
                </p>
              </div>
              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((spendVelocity.daysElapsed / spendVelocity.daysInMonth) * 100)}%`,
                      backgroundColor: 'var(--color-primary)'
                    }}
                  />
                </div>
                <p className="text-[10px] text-tertiary">
                  {Math.round((spendVelocity.daysElapsed / spendVelocity.daysInMonth) * 100)}% of month
                </p>
              </div>
            </div>
          )}

          {/* Anomaly nudges */}
          {anomalies.map((a) => (
            <Banner key={a.categoryId} variant="warning" icon="ti-flame">
              <strong>{a.name}</strong> is {Math.round(a.pct * 100)}% over your average
              {mode === 'open' && ` (${formatCurrency(a.amount)} vs ~${formatCurrency(a.average)})`}.
            </Banner>
          ))}

          {/* Monthly recap card */}
          {(recap.expense > 0 || recap.income > 0) && (
            <div className="surface rounded-2xl p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                  {monthLabel(recap.month)} recap
                </p>
                {recap.deltaPct !== null && (
                  <span
                    className="text-xs font-semibold flex items-center gap-0.5"
                    style={{ color: recap.deltaPct > 0 ? STATUS.danger : STATUS.success }}
                  >
                    <i
                      className={`ti ${recap.deltaPct > 0 ? 'ti-arrow-up-right' : 'ti-arrow-down-right'}`}
                      style={{ fontSize: 13 }}
                      aria-hidden="true"
                    />
                    {Math.abs(Math.round(recap.deltaPct * 100))}% vs last month
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-y-2">
                <RecapStat label="Spent" value={mode === 'open' ? formatCurrency(recap.expense) : '••••'} />
                <RecapStat
                  label="Net"
                  value={mode === 'open' ? formatCurrency(recap.net) : '••••'}
                  color={recap.net >= 0 ? STATUS.success : STATUS.danger}
                />
                <RecapStat label="Transactions" value={String(recap.txnCount)} />
                {recap.topCategory && (
                  <RecapStat
                    label="Top category"
                    value={
                      recap.topCategory.name + (mode === 'open' ? ` · ${formatCompact(recap.topCategory.amount)}` : '')
                    }
                  />
                )}
              </div>
            </div>
          )}

          {/* Donut — daily-routine groups only */}
          {analyticsData.length > 0 && (
            <div className="surface rounded-2xl p-4 flex items-center gap-4">
              <div className="flex-shrink-0">
                <IntentDonut segments={analyticsData} total={analyticsTotal} />
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {analyticsData.slice(0, 5).map((seg) => (
                  <div key={seg.group} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                    <span className="text-xs text-secondary truncate flex-1">{seg.label}</span>
                    <span className="text-xs font-medium text-primary flex-shrink-0">
                      {mode === 'open' ? formatCompact(seg.amount) : '••••'}
                    </span>
                  </div>
                ))}
                {analyticsData.length > 5 && (
                  <p className="text-[10px] text-tertiary mt-0.5">+{analyticsData.length - 5} more groups</p>
                )}
              </div>
            </div>
          )}

          {/* Events — above groups, only when present */}
          {eventsThisMonth.length > 0 && (
            <>
              <SectionLabel className="-mb-2">Events</SectionLabel>
              {eventsThisMonth.map((ev) => {
                const isExpanded = expandedEventId === ev.id;
                return (
                  <div key={ev.id} className="surface rounded-xl overflow-hidden">
                    <button
                      className="w-full px-4 py-3 flex items-center gap-3 text-left"
                      onClick={() => onChangeExpandedEventId(isExpanded ? null : ev.id)}
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                      <span className="text-sm font-medium text-primary flex-1 truncate">{ev.name}</span>
                      <span className="text-sm font-semibold text-primary flex-shrink-0">
                        {mode === 'open' ? formatCurrency(ev.amount) : '••••'}
                      </span>
                      <i
                        className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} flex-shrink-0`}
                        style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}
                        aria-hidden="true"
                      />
                    </button>
                    {isExpanded && (
                      <div className="border-t border-theme">
                        {ev.cats.map((cat) => (
                          <div
                            key={cat.catId}
                            className="px-4 py-2.5 flex items-center gap-2 bg-surface-2 border-b border-theme last:border-b-0"
                          >
                            <div
                              className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${cat.color}20` }}
                            >
                              <i
                                className={`ti ${cat.icon}`}
                                style={{ fontSize: 13, color: cat.color }}
                                aria-hidden="true"
                              />
                            </div>
                            <span className="text-xs text-secondary flex-1 truncate">{cat.name}</span>
                            <span className="text-xs font-semibold text-primary flex-shrink-0">
                              {mode === 'open' ? formatCurrency(cat.amount) : '••••'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
                  <div key={seg.group} className="px-4 py-3 flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${seg.color}20` }}
                    >
                      <i className={`ti ${seg.icon}`} style={{ fontSize: 14, color: seg.color }} aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium text-primary flex-1 truncate">{seg.label}</span>
                    <span className="text-sm font-semibold text-primary flex-shrink-0">
                      {mode === 'open' ? formatCurrency(seg.amount) : '••••'}
                    </span>
                  </div>
                ))}
                <div className="px-4 py-2.5 flex items-center gap-3 bg-surface-2 border-t border-theme">
                  <span className="text-xs text-secondary flex-1">Total set aside</span>
                  <span className="text-xs font-semibold text-secondary flex-shrink-0">
                    {mode === 'open' ? formatCurrency(setAsideTotal) : '••••'}
                  </span>
                </div>
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
                    <div key={seg.group}>
                      {/* Compact row */}
                      <button
                        className="w-full px-4 py-3 flex items-center gap-3 text-left"
                        onClick={() => onChangeExpandedGroup(isExpanded ? null : seg.group)}
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-sm font-medium text-primary flex-1 truncate">
                          {seg.label} <span className="font-normal text-tertiary text-xs">({Math.round(pct)}%)</span>
                        </span>
                        {delta !== null && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{
                              color: delta > 0 ? STATUS.danger : STATUS.success,
                              backgroundColor: delta > 0 ? tint(STATUS.danger) : tint(STATUS.success)
                            }}
                          >
                            {delta > 0 ? '↑' : '↓'}
                            {Math.abs(delta)}%
                          </span>
                        )}
                        {overBudget && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ color: STATUS.danger, backgroundColor: tint(STATUS.danger) }}
                          >
                            over
                          </span>
                        )}
                        <span className="text-sm font-semibold text-primary flex-shrink-0">
                          {mode === 'open' ? (
                            seg.budgetTotal > 0 ? (
                              <>
                                {formatCurrency(seg.amount)}{' '}
                                <span className="text-xs font-normal text-tertiary">
                                  of {formatCurrency(seg.budgetTotal)}
                                </span>
                              </>
                            ) : (
                              formatCurrency(seg.amount)
                            )
                          ) : (
                            '••••'
                          )}
                        </span>
                        <i
                          className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} flex-shrink-0`}
                          style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}
                          aria-hidden="true"
                        />
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-4 pb-3 bg-surface-2 border-t border-theme">
                          {/* Category drill-down */}
                          <div className="mt-1 flex flex-col gap-1">
                            {seg.cats.map((cat) => {
                              const catPct = seg.amount > 0 ? (cat.amount / seg.amount) * 100 : 0;
                              const catBudgetPct = cat.budgetLimit
                                ? Math.min((cat.amount / cat.budgetLimit) * 100, 100)
                                : 0;
                              const catOver = !!cat.budgetLimit && cat.amount > cat.budgetLimit;
                              return (
                                <div
                                  key={cat.catId}
                                  className="flex flex-col gap-1 py-2 border-t border-theme first:border-t-0"
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                                      style={{ backgroundColor: `${cat.color}20` }}
                                    >
                                      <i
                                        className={`ti ${cat.icon}`}
                                        style={{ fontSize: 11, color: cat.color }}
                                        aria-hidden="true"
                                      />
                                    </div>
                                    <span className="text-xs text-secondary flex-1 truncate">{cat.name}</span>
                                    <span className="text-xs font-semibold text-primary flex-shrink-0">
                                      {mode === 'open' ? (
                                        cat.budgetLimit !== undefined ? (
                                          <>
                                            {formatCurrency(cat.amount)}{' '}
                                            <span className="font-normal text-tertiary">
                                              of {formatCurrency(cat.budgetLimit)}
                                            </span>
                                          </>
                                        ) : (
                                          formatCurrency(cat.amount)
                                        )
                                      ) : (
                                        '••••'
                                      )}
                                    </span>
                                  </div>
                                  {/* One bar: budget if set, share-within-group if not */}
                                  {cat.budgetLimit !== undefined ? (
                                    <div className="h-1 rounded-full bg-surface-3">
                                      <div
                                        className="h-1 rounded-full"
                                        style={{
                                          width: `${catBudgetPct}%`,
                                          backgroundColor: catOver ? STATUS.danger : STATUS.success
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <div className="h-1 rounded-full bg-surface-3">
                                      <div
                                        className="h-1 rounded-full"
                                        style={{ width: `${catPct}%`, backgroundColor: cat.color }}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </ListContainer>
            </>
          )}

          {/* Non-event hashtag summary — with promote action */}
          {hashtagSummary.length > 0 && (
            <div className="surface rounded-xl p-3.5 flex flex-col gap-2.5">
              <SectionLabel className="">Other hashtags</SectionLabel>
              {hashtagSummary.map(({ tag, amount }) => (
                <div key={tag} className="flex items-center gap-2">
                  <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-primary)' }}>
                    #{tag}
                  </span>
                  <span className="text-sm font-semibold text-primary flex-shrink-0">
                    {mode === 'open' ? formatCurrency(amount) : '••••'}
                  </span>
                  <button
                    onClick={() => promoteHashtagToEvent(tag)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 text-tertiary hover:text-primary hover:bg-surface-2"
                    title={`Track #${tag} as an event`}
                    aria-label={`Mark #${tag} as event`}
                  >
                    <i className="ti ti-flag-plus" style={{ fontSize: 15 }} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
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
    </div>
  );
}
