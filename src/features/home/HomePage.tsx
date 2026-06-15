import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '@/context/PrivacyContext';
import { useSettings, type ModuleVisibility } from '@/context/SettingsContext';
import {
  accountsRepo,
  assetsRepo,
  chipInsightsRepo,
  expensesRepo,
  holdingsRepo,
  liabilitiesRepo
} from '@/core/db/repositories';
import { DEFAULT_INSIGHTS } from '@/core/ai-safety/mockChip';
import type { ChipInsight } from '@/core/db/types';
import { formatCompact, formatCurrency, toMonthYearKey } from '@/lib/formatters';
import { PATHS } from '@/router/paths';

interface AccountBalance {
  id: string;
  name: string;
  balance: number;
  color: string;
  icon: string;
}

interface Summary {
  netWorth: number;
  monthlyExpenses: number;
  accountBalances: AccountBalance[];
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
  const [assets, liabilities, expenses, holdings, accs] = await Promise.all([
    assetsRepo.getAll(),
    liabilitiesRepo.getAll(),
    expensesRepo.getAll(),
    holdingsRepo.getAll(),
    accountsRepo.getAll()
  ]);

  const totalAssets =
    assets.reduce((s, a) => s + a.value, 0) + holdings.reduce((s, h) => s + (h.currentValue ?? h.investedAmount), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstandingAmount, 0);

  const thisMonth = toMonthYearKey();
  const monthlyExpenses = expenses
    .filter((e) => toMonthYearKey(new Date(e.date)) === thisMonth && (!e.type || e.type === 'expense'))
    .reduce((s, e) => s + e.amount, 0);

  const accountBalances: AccountBalance[] = accs
    .filter((a) => !a.isArchived)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((acc) => {
      const linked = expenses.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id);
      const balance = linked.reduce((bal, t) => {
        const type = t.type ?? 'expense';
        if (type === 'income' && t.accountId === acc.id) return bal + t.amount;
        if (type === 'expense' && t.accountId === acc.id) return bal - t.amount;
        if (type === 'transfer') {
          if (t.accountId === acc.id) return bal - t.amount;
          if (t.toAccountId === acc.id) return bal + t.amount;
        }
        return bal;
      }, acc.openingBalance);
      return { id: acc.id, name: acc.name, balance, color: acc.color, icon: acc.icon };
    });

  return { netWorth: totalAssets - totalLiabilities, monthlyExpenses, accountBalances };
}

const TOOL_TILES: { label: string; icon: string; path: string; color: string; moduleKey: keyof ModuleVisibility }[] = [
  { label: 'Insurance', icon: 'ti-shield', path: PATHS.app.insurance, color: '#3b82f6', moduleKey: 'insurance' },
  { label: 'Loans', icon: 'ti-calculator', path: PATHS.app.loans, color: '#06b6d4', moduleKey: 'loans' },
  {
    label: 'Health Score',
    icon: 'ti-heart-rate-monitor',
    path: PATHS.app.health,
    color: '#ec4899',
    moduleKey: 'health'
  },
  { label: 'Tax', icon: 'ti-receipt-tax', path: PATHS.app.tax, color: '#8b5cf6', moduleKey: 'tax' },
  { label: 'Cash Flow', icon: 'ti-trending-down', path: PATHS.app.cashflow, color: '#14b8a6', moduleKey: 'cashflow' }
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
      <h2 className="text-xl font-semibold text-primary">{greeting}</h2>

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

      {/* Accounts strip */}
      {summary && summary.accountBalances.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-tertiary">Accounts</p>
            <button
              onClick={() => navigate(PATHS.app.accounts)}
              className="text-xs font-medium"
              style={{ color: 'var(--color-primary)' }}
            >
              Manage →
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-0.5 -mx-4 px-4">
            {summary.accountBalances.map((acc) => (
              <button
                key={acc.id}
                onClick={() => navigate(PATHS.app.accounts)}
                className="flex-shrink-0 surface rounded-2xl px-3.5 py-3 flex flex-col gap-1 min-w-[120px] text-left active:opacity-70"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: acc.color + '22' }}
                >
                  <i className={`ti ${acc.icon}`} style={{ fontSize: 15, color: acc.color }} aria-hidden="true" />
                </div>
                <p className="text-[11px] font-medium text-secondary truncate mt-0.5">{acc.name}</p>
                <p className="text-sm font-bold text-primary">
                  {mode === 'open' ? formatCurrency(acc.balance) : '••••'}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tools grid */}
      <div>
        <p className="text-xs font-medium mb-2 text-tertiary">Tools</p>
        <div className="grid grid-cols-5 gap-1.5">
          {TOOL_TILES.filter((m) => modules[m.moduleKey]).map((m) => (
            <button
              key={m.label}
              onClick={() => navigate(m.path)}
              className="surface flex flex-col items-center gap-1 rounded-xl p-2 active:opacity-70 transition-colors"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${m.color}22` }}
              >
                <i className={`ti ${m.icon}`} style={{ fontSize: 17, color: m.color }} aria-hidden="true" />
              </div>
              <span className="text-[9px] font-medium text-secondary text-center leading-tight">{m.label}</span>
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
            <span className="text-sm font-medium text-primary">Chip insights</span>
          </div>
          <div className="flex flex-col gap-2">
            {insights.map((insight) => (
              <article key={insight.id} className="surface rounded-xl p-4">
                <span className="text-[10px] font-medium uppercase tracking-wide text-tertiary">
                  {insight.moduleTag}
                </span>
                <p className="text-sm font-medium mt-0.5 mb-1 text-primary">{insight.headline}</p>
                <p className="text-xs leading-relaxed text-secondary">{insight.reasoning}</p>
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
        <div className="rounded-xl p-6 text-center bg-surface-2 border border-theme">
          <i className="ti ti-sparkles text-tertiary" style={{ fontSize: 32 }} aria-hidden="true" />
          <p className="text-sm mt-2 text-tertiary">Add your financial data and Chip will surface insights here.</p>
        </div>
      )}
    </div>
  );
}
