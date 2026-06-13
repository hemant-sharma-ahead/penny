import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '@/context/PrivacyContext';
import { useSettings, type ModuleVisibility } from '@/context/SettingsContext';
import { assetsRepo, chipInsightsRepo, expensesRepo, holdingsRepo, liabilitiesRepo } from '@/core/db/repositories';
import { DEFAULT_INSIGHTS } from '@/core/ai-safety/mockChip';
import type { ChipInsight } from '@/core/db/types';
import { formatCompact, formatCurrency, toMonthYearKey } from '@/lib/formatters';
import { PATHS } from '@/router/paths';

interface Summary {
  netWorth: number;
  monthlyExpenses: number;
}

async function seedInsightsIfEmpty(): Promise<ChipInsight[]> {
  const existing = await chipInsightsRepo.getAll();
  if (existing.length > 0) return existing;
  const now = Date.now();
  const seeded: ChipInsight[] = DEFAULT_INSIGHTS.map((s) => ({
    ...s,
    isRead: false,
    isMock: true,
    generatedAt: now,
    createdAt: now
  }));
  await Promise.all(seeded.map((i) => chipInsightsRepo.put(i)));
  return seeded;
}

async function loadSummary(): Promise<Summary> {
  const [assets, liabilities, expenses, holdings] = await Promise.all([
    assetsRepo.getAll(),
    liabilitiesRepo.getAll(),
    expensesRepo.getAll(),
    holdingsRepo.getAll()
  ]);

  const totalAssets =
    assets.reduce((s, a) => s + a.value, 0) + holdings.reduce((s, h) => s + (h.currentValue ?? h.investedAmount), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstandingAmount, 0);

  const thisMonth = toMonthYearKey();
  const monthlyExpenses = expenses
    .filter((e) => toMonthYearKey(new Date(e.date)) === thisMonth)
    .reduce((s, e) => s + e.amount, 0);

  return { netWorth: totalAssets - totalLiabilities, monthlyExpenses };
}

const TOOL_TILES: { label: string; icon: string; path: string; color: string; moduleKey: keyof ModuleVisibility }[] = [
  { label: 'Insurance', icon: 'ti-shield', path: PATHS.app.insurance, color: '#3b82f6', moduleKey: 'insurance' },
  {
    label: 'Subscriptions',
    icon: 'ti-refresh',
    path: PATHS.app.subscriptions,
    color: '#8b5cf6',
    moduleKey: 'subscriptions'
  },
  { label: 'IOUs', icon: 'ti-arrows-exchange', path: PATHS.app.iou, color: '#f59e0b', moduleKey: 'iou' },
  { label: 'Loans', icon: 'ti-calculator', path: PATHS.app.loans, color: '#06b6d4', moduleKey: 'loans' },
  {
    label: 'Health Score',
    icon: 'ti-heart-rate-monitor',
    path: PATHS.app.health,
    color: '#ec4899',
    moduleKey: 'health'
  },
  { label: 'Tax', icon: 'ti-receipt-tax', path: PATHS.app.tax, color: '#8b5cf6', moduleKey: 'tax' },
  { label: 'Cash Flow', icon: 'ti-trending-down', path: PATHS.app.cashflow, color: '#14b8a6', moduleKey: 'cashflow' },
  { label: 'Backup', icon: 'ti-cloud-download', path: PATHS.app.backup, color: '#64748b', moduleKey: 'backup' }
];

export function HomePage() {
  const { mode } = usePrivacy();
  const { modules } = useSettings();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [insights, setInsights] = useState<ChipInsight[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadSummary(), seedInsightsIfEmpty()])
      .then(([s, all]) => {
        if (cancelled) return;
        setSummary(s);
        setInsights(all.filter((x) => !x.isRead).slice(0, 3));
      })
      .catch(() => {
        // session may not be unlocked yet — AuthGuard ensures this is transient
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const displayNetWorth = summary ? (mode === 'open' ? formatCurrency(summary.netWorth) : '••••') : '—';

  const displayExpenses =
    summary && summary.monthlyExpenses > 0
      ? mode === 'open'
        ? `${formatCompact(summary.monthlyExpenses)} spent this month`
        : '•••• spent this month'
      : null;

  function dismissInsight(insight: ChipInsight) {
    chipInsightsRepo
      .put({ ...insight, isRead: true })
      .then(() => setInsights((prev) => prev.filter((i) => i.id !== insight.id)))
      .catch(() => {});
  }

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {greeting}
      </h2>

      {/* Net worth card */}
      <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
        <p className="text-sm opacity-75 mb-1">Net worth</p>
        <p className="text-3xl font-semibold tracking-tight">{displayNetWorth}</p>
        {displayExpenses && <p className="text-sm opacity-70 mt-1">{displayExpenses}</p>}
        {summary && mode !== 'open' && (
          <p className="text-xs opacity-60 mt-2">
            <i className="ti ti-eye-off" aria-hidden="true" /> Privacy mode active — tap the badge to reveal
          </p>
        )}
      </div>

      {/* Tools grid */}
      <div>
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
          Tools
        </p>
        <div className="grid grid-cols-4 gap-2">
          {TOOL_TILES.filter((m) => modules[m.moduleKey]).map((m) => (
            <button
              key={m.label}
              onClick={() => navigate(m.path)}
              className="flex flex-col items-center gap-1.5 rounded-xl p-3 active:opacity-70 transition-colors"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)'
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${m.color}22` }}
              >
                <i className={`ti ${m.icon}`} style={{ fontSize: 20, color: m.color }} aria-hidden="true" />
              </div>
              <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {m.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Chip insights */}
      {insights.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <i className="ti ti-sparkles text-white" style={{ fontSize: 11 }} aria-hidden="true" />
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Chip insights
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {insights.map((insight) => (
              <article
                key={insight.id}
                className="rounded-xl p-4"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)'
                }}
              >
                <span
                  className="text-[10px] font-medium uppercase tracking-wide"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {insight.moduleTag}
                </span>
                <p className="text-sm font-medium mt-0.5 mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  {insight.headline}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {insight.reasoning}
                </p>
                {insight.consequence && (
                  <p className="text-xs text-amber-600 mt-1.5 leading-relaxed">⚠ {insight.consequence}</p>
                )}
                {insight.actionLabel && (
                  <button
                    className="mt-2 text-xs font-medium"
                    style={{ color: 'var(--color-primary)' }}
                    onClick={() => dismissInsight(insight)}
                  >
                    {insight.actionLabel} →
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {insights.length === 0 && summary !== null && (
        <div
          className="rounded-xl p-6 text-center"
          style={{
            backgroundColor: 'var(--color-surface-secondary)',
            border: '1px solid var(--color-border)'
          }}
        >
          <i
            className="ti ti-sparkles"
            style={{ fontSize: 32, color: 'var(--color-text-tertiary)' }}
            aria-hidden="true"
          />
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Add your financial data and Chip will surface insights here.
          </p>
        </div>
      )}
    </div>
  );
}
