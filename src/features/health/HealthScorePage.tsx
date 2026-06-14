import { useEffect, useMemo, useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import {
  assetsRepo,
  expensesRepo,
  goalsRepo,
  holdingsRepo,
  insurancePoliciesRepo,
  liabilitiesRepo
} from '@/core/db/repositories';
import type { Asset, Expense, Goal, Holding, InsurancePolicy, Liability } from '@/core/db/types';
import { computeHealthScore, deriveInputs } from '@/core/health/scorer';
import type { ComponentStatus, ScoreComponent } from '@/core/health/scorer';

// ── SVG Gauge ────────────────────────────────────────────────────────────────

function ScoreGauge({ score, color }: { score: number; color: string }) {
  const R = 68;
  const cx = 90;
  const cy = 90;
  const C = 2 * Math.PI * R;
  const arcLength = C * 0.75;
  const filled = (arcLength * Math.min(100, Math.max(0, score))) / 100;

  return (
    <svg viewBox="0 0 180 155" aria-label={`Health score: ${score} out of 100`}>
      {/* Background track */}
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={14}
        strokeDasharray={`${C * 0.75} ${C * 0.25}`}
        strokeLinecap="round"
        transform={`rotate(135, ${cx}, ${cy})`}
      />
      {/* Score fill */}
      {filled > 2 && (
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeDasharray={`${filled} ${C - filled}`}
          strokeLinecap="round"
          transform={`rotate(135, ${cx}, ${cy})`}
        />
      )}
      {/* Score text */}
      <text x={cx} y={82} textAnchor="middle" fill="var(--color-text-primary)" fontSize="42" fontWeight="700">
        {score}
      </text>
      <text x={cx} y={104} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="13">
        out of 100
      </text>
    </svg>
  );
}

// ── Component card ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<ComponentStatus, { bg: string; border: string; text: string; bar: string }> = {
  excellent: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', bar: '#10b981' },
  good: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', bar: '#22c55e' },
  fair: { bg: '#fffbeb', border: '#fde68a', text: '#b45309', bar: '#f59e0b' },
  poor: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', bar: '#ef4444' },
  no_data: { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b', bar: '#cbd5e1' }
};

function ComponentCard({ c }: { c: ScoreComponent }) {
  const s = STATUS_STYLE[c.status];
  const pct = c.max > 0 ? (c.earned / c.max) * 100 : 0;
  const statusLabel = c.status === 'no_data' ? 'No data' : c.status.charAt(0).toUpperCase() + c.status.slice(1);

  return (
    <div
      className="rounded-2xl border p-3 flex flex-col gap-2"
      style={{ backgroundColor: s.bg, borderColor: s.border }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <i className={`ti ${c.icon} flex-shrink-0`} style={{ fontSize: 15, color: s.text }} aria-hidden="true" />
          <span className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {c.label}
          </span>
        </div>
        <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: s.text }}>
          {c.earned}/{c.max}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-white/60">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: s.bar }}
        />
      </div>

      {/* Status badge + insight */}
      <div>
        <span
          className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ color: s.text, backgroundColor: `${s.bar}20` }}
        >
          {statusLabel}
        </span>
        <p className="text-[10px] mt-1 leading-relaxed line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
          {c.insight}
        </p>
      </div>
    </div>
  );
}

// ── Loaded data bag ───────────────────────────────────────────────────────────

interface LoadedData {
  assets: Asset[];
  holdings: Holding[];
  expenses: Expense[];
  liabilities: Liability[];
  policies: InsurancePolicy[];
  goals: Goal[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function HealthScorePage() {
  usePrivacy();
  const [nowMs] = useState(() => Date.now());
  const [data, setData] = useState<LoadedData | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      assetsRepo.getAll(),
      holdingsRepo.getAll(),
      expensesRepo.getAll(),
      liabilitiesRepo.getAll(),
      insurancePoliciesRepo.getAll(),
      goalsRepo.getAll()
    ])
      .then(([assets, holdings, expenses, liabilities, policies, goals]) => {
        if (cancelled) return;
        setData({ assets, holdings, expenses, liabilities, policies, goals });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const derived = useMemo(() => {
    if (!data) return null;
    return deriveInputs(data.assets, data.holdings, data.expenses, data.liabilities, data.policies, data.goals, nowMs);
  }, [data, nowMs]);

  const healthScore = useMemo(() => {
    if (!derived) return null;
    const income = parseFloat(monthlyIncome);
    return computeHealthScore(derived, income > 0 ? income : 0);
  }, [derived, monthlyIncome]);

  const incomeNeeded = !monthlyIncome || !(parseFloat(monthlyIncome) > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Financial Health
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          On-device · updates as you add data
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 flex flex-col gap-4">
        {/* Monthly income input */}
        <div
          className="rounded-2xl border p-4 flex items-center gap-3"
          style={
            incomeNeeded
              ? { backgroundColor: '#fffbeb', borderColor: '#fde68a' }
              : { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }
          }
        >
          <i
            className="ti ti-currency-rupee flex-shrink-0"
            style={{ fontSize: 18, color: incomeNeeded ? '#b45309' : '#15803d' }}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <label
              htmlFor="income-input"
              className="text-xs font-medium block mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Monthly take-home income (₹)
            </label>
            <input
              id="income-input"
              type="number"
              inputMode="decimal"
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border)'
              }}
              placeholder="e.g. 80,000"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(e.target.value)}
            />
          </div>
        </div>

        {/* Score gauge */}
        {healthScore ? (
          <div
            className="rounded-2xl px-4 pt-4 pb-3"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="w-48 mx-auto">
              <ScoreGauge score={healthScore.total} color={healthScore.color} />
            </div>
            <div className="text-center -mt-2">
              <span
                className="inline-flex items-center gap-1.5 text-base font-semibold px-3 py-1 rounded-full"
                style={{ backgroundColor: `${healthScore.color}18`, color: healthScore.color }}
              >
                {healthScore.grade} · {healthScore.gradeLabel}
              </span>
            </div>
            <p className="text-xs text-center mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              {incomeNeeded
                ? 'Enter income above to score Savings Rate and Debt-to-Income'
                : 'Based on your current data across 6 dimensions'}
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl p-8 flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-center">
              <i
                className="ti ti-loader-2"
                style={{ fontSize: 32, color: 'var(--color-text-tertiary)' }}
                aria-hidden="true"
              />
              <p className="text-sm mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                Loading your data…
              </p>
            </div>
          </div>
        )}

        {/* Score breakdown */}
        {healthScore && (
          <>
            <p
              className="text-xs font-semibold uppercase tracking-wide -mb-2"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Score breakdown
            </p>
            <div className="grid grid-cols-2 gap-3">
              {healthScore.components.map((c) => (
                <ComponentCard key={c.key} c={c} />
              ))}
            </div>
          </>
        )}

        {/* How scores are calculated */}
        {healthScore && (
          <div
            className="rounded-2xl p-4"
            style={{ backgroundColor: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              How it's scored
            </p>
            <div className="flex flex-col gap-1">
              {[
                ['Emergency Fund', '20 pts', '6+ months of expenses'],
                ['Savings Rate', '20 pts', '30%+ of income saved'],
                ['Debt-to-Income', '20 pts', '≤20% of income on EMIs'],
                ['Insurance', '15 pts', 'Life + health coverage'],
                ['Goals on Track', '15 pts', 'All active goals progressing'],
                ['Diversification', '10 pts', '4+ asset classes']
              ].map(([label, pts, target]) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {label}
                  </span>
                  <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                    {pts} · {target}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
