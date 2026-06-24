import { useState } from 'react';
import { formatCurrency, formatCompact, toMonthYearKey } from '@/lib/formatters';

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
  prevMonthData: Map<string, number>;
  spendVelocity: { daysElapsed: number; daysInMonth: number; projected: number } | null;
  annualData: Array<{ month: string; label: string; total: number }>;
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
  prevMonthData,
  spendVelocity,
  annualData,
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
          {annualTotal === 0 ? (
            <div className="p-10 text-center">
              <i className="ti ti-chart-bar text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
              <p className="text-sm mt-3 text-tertiary">No expenses in {analyticsYear}.</p>
            </div>
          ) : (
            <>
              <div className="surface rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-tertiary uppercase tracking-wide">Total {analyticsYear}</p>
                  <p className="text-base font-bold text-primary">
                    {mode === 'open' ? formatCurrency(annualTotal) : '••••'}
                  </p>
                </div>
                {/* Bar chart */}
                <div className="flex items-end gap-1 h-20">
                  {annualData.map((m) => {
                    const heightPct = annualMax > 0 ? Math.max((m.total / annualMax) * 100, m.total > 0 ? 5 : 0) : 0;
                    const isCurrentMonth = m.month === toMonthYearKey();
                    return (
                      <button
                        key={m.month}
                        onClick={() => {
                          onChangeSelectedMonth(m.month);
                          onChangeAnalyticsView('monthly');
                          onChangeExpandedGroup(null);
                        }}
                        disabled={m.total === 0}
                        className="flex-1 flex flex-col items-center gap-0.5 group disabled:cursor-default"
                        title={m.total > 0 ? `${m.label}: ${formatCurrency(m.total)}` : undefined}
                      >
                        <div className="w-full flex flex-col justify-end" style={{ height: '72px' }}>
                          <div
                            className="w-full rounded-t-sm transition-all group-hover:opacity-80"
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: isCurrentMonth ? 'var(--color-primary)' : 'var(--color-primary)',
                              opacity: isCurrentMonth ? 1 : 0.5
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-tertiary">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="surface rounded-xl divide-y divide-theme overflow-hidden">
                {annualData
                  .filter((m) => m.total > 0)
                  .sort((a, b) => b.total - a.total)
                  .map((m, i) => (
                    <button
                      key={m.month}
                      onClick={() => {
                        onChangeSelectedMonth(m.month);
                        onChangeAnalyticsView('monthly');
                        onChangeExpandedGroup(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                    >
                      <span className="text-xs text-tertiary w-4 flex-shrink-0">{i + 1}</span>
                      <span className="text-sm font-medium text-primary flex-1">{monthLabel(m.month)}</span>
                      <span className="text-sm font-semibold text-primary">
                        {mode === 'open' ? formatCurrency(m.total) : '••••'}
                      </span>
                      <i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 13 }} aria-hidden="true" />
                    </button>
                  ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Monthly view ── */}
      {analyticsView === 'monthly' && analyticsData.length === 0 ? (
        <div className="p-10 text-center">
          <i className="ti ti-chart-donut text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
          <p className="text-sm mt-3 text-tertiary">No expenses in {monthLabel(selectedMonth)}.</p>
        </div>
      ) : analyticsView === 'monthly' ? (
        <>
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

          {/* Donut */}
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

          {/* Events — above groups, only when present */}
          {eventsThisMonth.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide -mb-2 text-tertiary">Events</p>
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

          {/* Groups — compact rows, detail on expand */}
          <p className="text-xs font-semibold uppercase tracking-wide -mb-2 text-tertiary">Spending groups</p>
          <div className="surface rounded-xl overflow-hidden divide-y divide-theme">
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
                          color: delta > 0 ? '#ef4444' : '#10b981',
                          backgroundColor: delta > 0 ? '#ef444418' : '#10b98118'
                        }}
                      >
                        {delta > 0 ? '↑' : '↓'}
                        {Math.abs(delta)}%
                      </span>
                    )}
                    {overBudget && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ color: '#ef4444', backgroundColor: '#ef444418' }}
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
                                      backgroundColor: catOver ? '#ef4444' : '#22c55e'
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
          </div>

          {/* Non-event hashtag summary — with promote action */}
          {hashtagSummary.length > 0 && (
            <div className="surface rounded-xl p-3.5 flex flex-col gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Other hashtags</p>
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
