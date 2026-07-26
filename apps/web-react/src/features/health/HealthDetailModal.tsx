import { Modal, AmountInput, SectionLabel } from '@/components/ui';
import { tint } from '@/lib/statusColors';
import type { HealthScore } from '@/core/health/scorer';
import { ScoreGauge } from './ScoreGauge';
import { ComponentCard } from './ComponentCard';
import { ScoringGuide } from './ScoringGuide';

/**
 * The full Financial-Health breakdown — the "See all" / ⓘ detail behind the Home health card.
 * Replaces the old standalone Health Score page. State (score + income) is owned by the Home card
 * (via `useHealthScore`) and passed in, so entering income here updates the Home ring live.
 */
export function HealthDetailModal({
  healthScore,
  monthlyIncome,
  setMonthlyIncome,
  incomeNeeded,
  onClose
}: {
  healthScore: HealthScore | null;
  monthlyIncome: string;
  setMonthlyIncome: (v: string) => void;
  incomeNeeded: boolean;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} title="Financial Health" scrollable>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-tertiary -mt-1">On-device · updates as you add data · nothing leaves your device.</p>

        {/* Monthly income — needed to score Savings Rate & Debt-to-Income */}
        <div
          className="rounded-2xl border p-4"
          style={
            incomeNeeded
              ? {
                  backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)'
                }
              : {
                  backgroundColor: 'color-mix(in srgb, var(--color-success) 8%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--color-success) 30%, transparent)'
                }
          }
        >
          <AmountInput
            label="Monthly take-home income"
            placeholder="e.g. 80,000"
            value={monthlyIncome}
            onChange={setMonthlyIncome}
          />
        </div>

        {healthScore && (
          <>
            <div className="rounded-2xl px-4 pt-4 pb-3 surface">
              <div className="w-48 mx-auto">
                <ScoreGauge score={healthScore.total} color={healthScore.color} />
              </div>
              <div className="text-center -mt-2">
                <span
                  className="inline-flex items-center gap-1.5 text-base font-semibold px-3 py-1 rounded-full"
                  style={{ backgroundColor: tint(healthScore.color), color: healthScore.color }}
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

            <SectionLabel className="-mb-2">Score breakdown</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {healthScore.components.map((c) => (
                <ComponentCard key={c.key} c={c} />
              ))}
            </div>
            <ScoringGuide />
          </>
        )}
      </div>
    </Modal>
  );
}
