import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { PATHS } from '@/router/paths';
import type { ComponentStatus, ScoreComponent } from '@/core/health/scorer';
import {
  createGoalFromTemplate,
  guidanceForComponent,
  type AdvisorContext,
  type AppRouteKey,
  type GuidanceAction
} from '@/core/advisor/guidance';

/** Maps the advisor's platform-agnostic route keys to this app's actual web routes. */
const ROUTE_MAP: Record<AppRouteKey, string> = {
  goals: PATHS.app.goals,
  insurance: PATHS.app.insurance,
  expenses: PATHS.app.expenses,
  loans: PATHS.app.loans,
  portfolio: PATHS.app.portfolio
};
import { useHealthScore } from './useHealthScore';
import { HealthDetailModal } from './HealthDetailModal';

/** Arc colour per component status — powers the segmented ring + the quick-win icons. */
const STATUS_COLOR: Record<ComponentStatus, string> = {
  excellent: 'var(--color-success)',
  good: 'var(--color-success)',
  fair: 'var(--color-warning)',
  poor: 'var(--color-danger)',
  no_data: 'var(--color-border)'
};

/**
 * The Home "Financial health" glance (Home advisor) — replaces the standalone Health Score page.
 * A coloured segmented ring (each arc = a scoring pillar, sized by weight, coloured by status) with the
 * total in the centre, plus the top-3 weakest "quick wins" — each with a concrete next step (Set as goal
 * / navigate / add data). "See all" / ⓘ opens the full breakdown.
 */
export function FinancialHealthCard() {
  const hs = useHealthScore();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const score = hs.healthScore;
  if (!score) return null;

  const ctx: AdvisorContext = {
    derived: hs.derived,
    employmentType: hs.employmentType,
    incomeNeeded: hs.incomeNeeded,
    hasEmergencyGoal: hs.hasEmergencyGoal
  };

  // Segmented ring: each component occupies an arc proportional to its `max` (weights sum to 100).
  const stops = score.components
    .map((c, i) => {
      const start = score.components.slice(0, i).reduce((s, x) => s + x.max, 0);
      return `${STATUS_COLOR[c.status]} ${start}% ${start + c.max}%`;
    })
    .join(', ');
  const ring = `conic-gradient(${stops})`;

  // Top-3 quick wins: the weakest components (lowest earned/max), most impactful first.
  const quickWins = [...score.components].sort((a, b) => a.earned / a.max - b.earned / b.max).slice(0, 3);

  async function runAction(action: GuidanceAction) {
    if (action.kind === 'navigate') {
      navigate(ROUTE_MAP[action.to]);
    } else if (action.kind === 'add-data') {
      setDetailOpen(true);
    } else if (action.kind === 'goal' && !busy) {
      setBusy(true);
      try {
        await createGoalFromTemplate(action.template);
        showToast({ message: `Added "${action.template.name}" to Goals` });
        navigate(PATHS.app.goals);
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-primary">Financial health</h3>
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="text-xs font-semibold"
          style={{ color: 'var(--color-primary)' }}
        >
          See all
        </button>
      </div>

      <div className="surface rounded-2xl p-4">
        <div className="flex items-center gap-4">
          <div
            className="w-[68px] h-[68px] rounded-full grid place-items-center flex-shrink-0"
            style={{ background: ring }}
          >
            <div className="w-[52px] h-[52px] rounded-full bg-surface grid place-items-center">
              <span className="text-[22px] font-extrabold leading-none text-primary">{score.total}</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: score.color }}>
              {score.gradeLabel}
            </p>
            <p className="text-xs text-secondary leading-relaxed mt-0.5">
              {score.total >= 90
                ? "You're in great shape — keep it up."
                : 'A few quick wins would lift your score toward excellent.'}
            </p>
          </div>
        </div>

        <div className="mt-2">
          {quickWins.map((c) => (
            <QuickWin
              key={c.key}
              c={c}
              action={guidanceForComponent(c, ctx)}
              busy={busy}
              onOpen={() => setDetailOpen(true)}
              onAction={runAction}
            />
          ))}
        </div>
      </div>

      {detailOpen && (
        <HealthDetailModal
          healthScore={hs.healthScore}
          monthlyIncome={hs.monthlyIncome}
          setMonthlyIncome={hs.setMonthlyIncome}
          incomeNeeded={hs.incomeNeeded}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}

function QuickWin({
  c,
  action,
  busy,
  onOpen,
  onAction
}: {
  c: ScoreComponent;
  action: GuidanceAction | null;
  busy: boolean;
  onOpen: () => void;
  onAction: (a: GuidanceAction) => void;
}) {
  const color = STATUS_COLOR[c.status];
  return (
    <div className="flex items-center gap-3 py-2.5 border-t border-theme first:border-t-0">
      <button type="button" onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <span
          className="w-7 h-7 rounded-lg grid place-items-center flex-shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          <i className={`ti ${c.icon}`} style={{ fontSize: 15 }} aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold text-primary">{c.label}</span>
          <span className="block text-[11px] text-tertiary truncate">{c.insight}</span>
        </span>
      </button>
      {action ? (
        <button
          type="button"
          onClick={() => onAction(action)}
          disabled={busy}
          className="flex-shrink-0 text-[11px] font-bold rounded-full px-3 py-1.5 disabled:opacity-50"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
            color: 'var(--color-primary)'
          }}
        >
          {action.label}
        </button>
      ) : (
        <i className="ti ti-info-circle text-tertiary flex-shrink-0" style={{ fontSize: 15 }} aria-hidden="true" />
      )}
    </div>
  );
}
