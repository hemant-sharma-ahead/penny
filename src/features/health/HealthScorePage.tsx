import { TextInput } from '@/components/ui';
import { useHealthScore } from './useHealthScore';
import { ScoreGauge } from './ScoreGauge';
import { ComponentCard } from './ComponentCard';
import { ScoringGuide } from './ScoringGuide';

export function HealthScorePage() {
  const { healthScore, monthlyIncome, setMonthlyIncome, incomeNeeded } = useHealthScore();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <h2 className="text-xl font-semibold text-primary">Financial Health</h2>
        <p className="text-xs mt-0.5 text-tertiary">On-device · updates as you add data</p>
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
            <TextInput
              label="Monthly take-home income (₹)"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 80,000"
              value={monthlyIncome}
              onChange={setMonthlyIncome}
            />
          </div>
        </div>

        {/* Score gauge */}
        {healthScore ? (
          <div className="rounded-2xl px-4 pt-4 pb-3 surface">
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
            <p className="text-xs text-center mt-2 text-tertiary">
              {incomeNeeded
                ? 'Enter income above to score Savings Rate and Debt-to-Income'
                : 'Based on your current data across 6 dimensions'}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl p-8 flex items-center justify-center surface">
            <div className="text-center">
              <i className="ti ti-loader-2 text-tertiary" style={{ fontSize: 32 }} aria-hidden="true" />
              <p className="text-sm mt-2 text-tertiary">Loading your data…</p>
            </div>
          </div>
        )}

        {/* Score breakdown */}
        {healthScore && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide -mb-2 text-tertiary">Score breakdown</p>
            <div className="grid grid-cols-2 gap-3">
              {healthScore.components.map((c) => (
                <ComponentCard key={c.key} c={c} />
              ))}
            </div>
            <ScoringGuide />
          </>
        )}
      </div>
    </div>
  );
}
