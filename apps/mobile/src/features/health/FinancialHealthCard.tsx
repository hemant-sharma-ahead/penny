import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useToast } from '~/context/ToastContext';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { ThemeTokens } from '@penny/core/theme/tokens';
import type { ComponentStatus, ScoreComponent } from '@/core/health/scorer';
import { notifyGoalsChanged } from '@/hooks/useDataRefresh';
import {
  createGoalFromTemplate,
  guidanceForComponent,
  type AdvisorContext,
  type AppRouteKey,
  type GuidanceAction
} from '@/core/advisor/guidance';
import { useHealthScore } from './useHealthScore';
import { HealthDetailModal } from './HealthDetailModal';

function statusColor(status: ComponentStatus, theme: ThemeTokens): string {
  switch (status) {
    case 'excellent':
    case 'good':
      return theme.success;
    case 'fair':
      return theme.warning;
    case 'poor':
      return theme.danger;
    case 'no_data':
      return theme.border;
  }
}

const RING_R = 26;
const RING_CX = 34;
const RING_CY = 34;
const RING_C = 2 * Math.PI * RING_R;

interface SegmentArc {
  key: string;
  color: string;
  dasharray: string;
  rotation: number;
}

// Segmented ring: each component occupies an arc proportional to its `max` (weights sum to 100). RN has
// no `conic-gradient`, so this draws one full-circle <Circle> per component, each showing only its own
// arc via strokeDasharray, rotated into place — the same "one stroked circle per segment" technique
// `ProgressRing` already uses for a single-color ring, just repeated per segment. Kept as a plain
// module-level function (not inline in the component) so the running `cumulative` offset is a local to
// this call, not a render-scoped `let` the lint rule flags as unsafe to mutate.
function ringSegments(components: ScoreComponent[], theme: ThemeTokens): SegmentArc[] {
  const out: SegmentArc[] = [];
  let cumulative = 0;
  for (const c of components) {
    const startFraction = cumulative / 100;
    const segmentLength = RING_C * (c.max / 100);
    out.push({
      key: c.key,
      color: statusColor(c.status, theme),
      dasharray: `${segmentLength} ${RING_C - segmentLength}`,
      rotation: -90 + startFraction * 360
    });
    cumulative += c.max;
  }
  return out;
}

/**
 * The Home "Financial health" glance — a coloured segmented ring (each arc = a scoring pillar, sized by
 * weight, coloured by status) with the total in the centre, plus the top-3 weakest "quick wins" — each
 * with a concrete next step (Set as goal / navigate / add data). "See all" opens the full breakdown.
 */
export function FinancialHealthCard({ onNavigate }: { onNavigate?: (to: AppRouteKey) => void }) {
  const hs = useHealthScore();
  const theme = useThemeColors();
  const { showToast } = useToast();
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const score = hs.healthScore;
  const derived = hs.derived;
  if (!score || !derived) return null;

  // Empty state (2026-08-05, docs/mockups/proposals/home-empty-states-v2.html) — with literally
  // nothing entered, every component earns 0, which the grade formula maps straight to `grade: 'F'`,
  // `gradeLabel: 'Critical'`, a red ring — a false, alarming verdict for someone who just opened the
  // app, not an actual assessment.
  //
  // Checked against the raw derived inputs, not each component's own `status` — `insuranceComponent`
  // (`core/health/scorer.ts`) hardcodes `hasData: true` unconditionally (having *no* insurance is real,
  // meaningful information there, unlike the other components), so it can never report `'no_data'` and
  // an `every(c => c.status === 'no_data')` check across all 6 components never actually becomes true
  // (found 2026-08-05 — this silently broke the empty-state gate entirely). `score.total === 0` isn't a
  // safe substitute either: several components can legitimately earn exactly 0 from real, entered data
  // (a real savings rate of -5%, real goals with none on track, real holdings in only one asset class),
  // so a genuinely very poor but real financial picture could false-positive as "no data yet" too.
  const hasNoData =
    hs.incomeNeeded &&
    derived.avgMonthlyExpenses === 0 &&
    derived.liquidAssets === 0 &&
    derived.monthlyEmiObligations === 0 &&
    derived.totalActiveGoals === 0 &&
    derived.assetClassCount === 0 &&
    !derived.hasLifeInsurance &&
    !derived.hasHealthInsurance;

  const ctx: AdvisorContext = {
    derived: hs.derived,
    employmentType: hs.employmentType,
    incomeNeeded: hs.incomeNeeded,
    hasEmergencyGoal: hs.hasEmergencyGoal
  };

  const segments = ringSegments(score.components, theme);

  // Top-3 quick wins: the weakest components (lowest earned/max), most impactful first.
  const quickWins = [...score.components].sort((a, b) => a.earned / a.max - b.earned / b.max).slice(0, 3);

  async function runAction(action: GuidanceAction) {
    if (action.kind === 'navigate') {
      onNavigate?.(action.to);
    } else if (action.kind === 'add-data') {
      setDetailOpen(true);
    } else if (action.kind === 'goal' && !busy) {
      setBusy(true);
      try {
        await createGoalFromTemplate(action.template);
        notifyGoalsChanged();
        showToast({ message: `Added "${action.template.name}" to Goals` });
        onNavigate?.('goals');
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <View className="mb-4">
      {/* No "Financial health" heading / "See all" while there's nothing to see all of yet (2026-08-05
          follow-up) — the empty-state card below already has its own "Financial Health Score" title, so
          a second, redundant outer heading (plus a "See all" pointing at a detail view with nothing
          real in it) added nothing. Comes back once real data exists. */}
      {!hasNoData && (
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-semibold text-primary">Financial health</Text>
          <Pressable onPress={() => setDetailOpen(true)}>
            <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
              See all
            </Text>
          </Pressable>
        </View>
      )}

      {hasNoData ? (
        <View className="bg-surface border border-theme rounded-2xl p-4">
          <View className="flex-row items-center gap-4">
            <View className="w-[60px] h-[60px] items-center justify-center flex-shrink-0">
              <Svg
                viewBox={`0 0 ${RING_CX * 2} ${RING_CY * 2}`}
                width={60}
                height={60}
                style={{ position: 'absolute' }}
              >
                <Circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none" stroke={theme.border} strokeWidth={7} />
              </Svg>
              <View className="w-[46px] h-[46px] rounded-full bg-surface items-center justify-center">
                <Text className="text-[10px] font-bold text-tertiary text-center">0–100</Text>
              </View>
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-sm font-bold text-primary">Financial Health Score</Text>
              <Text className="text-xs text-secondary leading-relaxed mt-0.5">
                A 0–100 score across savings, debt, insurance, goals & more. Add some data to see where you stand.
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setDetailOpen(true)}
            className="rounded-full px-3.5 py-2 mt-3 self-start"
            style={{ backgroundColor: theme.primary }}
          >
            <Text className="text-[11.5px] font-bold" style={{ color: '#fff' }}>
              Get started
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="bg-surface border border-theme rounded-2xl p-4">
          <View className="flex-row items-center gap-4">
            <View className="w-[68px] h-[68px] items-center justify-center flex-shrink-0">
              <Svg
                viewBox={`0 0 ${RING_CX * 2} ${RING_CY * 2}`}
                width={68}
                height={68}
                style={{ position: 'absolute' }}
              >
                {segments.map((seg) => (
                  <Circle
                    key={seg.key}
                    cx={RING_CX}
                    cy={RING_CY}
                    r={RING_R}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={8}
                    strokeDasharray={seg.dasharray}
                    rotation={seg.rotation}
                    origin={`${RING_CX}, ${RING_CY}`}
                  />
                ))}
              </Svg>
              <View className="w-[52px] h-[52px] rounded-full bg-surface items-center justify-center">
                <Text className="text-[22px] font-extrabold leading-none text-primary">{score.total}</Text>
              </View>
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-sm font-bold" style={{ color: score.color }}>
                {score.gradeLabel}
              </Text>
              <Text className="text-xs text-secondary leading-relaxed mt-0.5">
                {score.total >= 90
                  ? "You're in great shape — keep it up."
                  : 'A few quick wins would lift your score toward excellent.'}
              </Text>
            </View>
          </View>

          <View className="mt-2">
            {quickWins.map((c, i) => (
              <QuickWin
                key={c.key}
                c={c}
                first={i === 0}
                action={guidanceForComponent(c, ctx)}
                busy={busy}
                onOpen={() => setDetailOpen(true)}
                onAction={runAction}
              />
            ))}
          </View>
        </View>
      )}

      {detailOpen && (
        <HealthDetailModal
          healthScore={hs.healthScore}
          monthlyIncome={hs.monthlyIncome}
          setMonthlyIncome={hs.setMonthlyIncome}
          incomeNeeded={hs.incomeNeeded}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </View>
  );
}

function QuickWin({
  c,
  first,
  action,
  busy,
  onOpen,
  onAction
}: {
  c: ScoreComponent;
  first: boolean;
  action: GuidanceAction | null;
  busy: boolean;
  onOpen: () => void;
  onAction: (a: GuidanceAction) => void;
}) {
  const theme = useThemeColors();
  const color = statusColor(c.status, theme);
  return (
    <View className={`flex-row items-center gap-3 py-2.5 ${first ? '' : 'border-t border-theme'}`}>
      <Pressable onPress={onOpen} className="flex-row items-center gap-3 flex-1 min-w-0">
        <View
          className="w-7 h-7 rounded-lg items-center justify-center flex-shrink-0"
          style={{ backgroundColor: tint(color, 14) }}
        >
          <Icon name={c.icon} size={15} color={color} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[13px] font-semibold text-primary" numberOfLines={1}>
            {c.label}
          </Text>
          <Text className="text-[11px] text-tertiary" numberOfLines={1}>
            {c.insight}
          </Text>
        </View>
      </Pressable>
      {action ? (
        <Pressable
          onPress={() => onAction(action)}
          disabled={busy}
          className="flex-shrink-0 rounded-full px-3 py-1.5"
          style={{ backgroundColor: tint(theme.primary, 12), opacity: busy ? 0.5 : 1 }}
        >
          <Text className="text-[11px] font-bold" style={{ color: theme.primary }}>
            {action.label}
          </Text>
        </Pressable>
      ) : (
        <Icon name="ti-info-circle" size={15} color={theme.textTertiary} />
      )}
    </View>
  );
}
