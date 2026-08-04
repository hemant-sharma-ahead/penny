import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { formatCurrency } from '@/lib/formatters';
import { calcSipNeeded, monthsUntil } from '@/core/goals/sipCalculator';
import { getRiskColor, getRiskReturn, resolveGoalIcon } from '@/core/goals/meta';
import { useThemeColors } from '~/theme/useThemeColors';
import { ink } from '~/lib/color';
import type { Goal } from './useGoals';

interface GoalCardProps {
  goal: Goal;
  masked: boolean;
  /** Baseline + live sum of this goal's contributions — see `useGoals.ts`'s `effectiveSaved`. */
  effectiveSaved: number;
  /** Opens `GoalDetailView` — every linked transaction/contribution at once. */
  onOpenDetail: (goal: Goal) => void;
  /** Opens the real Expense form, goal-preset — the same action Goal Detail's own footer offers
   *  (2026-08-02: replaces the old inline "Quick add", which recorded no transaction at all). */
  onAddContribution: (goal: Goal) => void;
  /** Retroactively tags an already-recorded transaction as a contribution toward this goal. */
  onLinkExisting: (goal: Goal) => void;
}

const CARD_HEIGHT = 172;
const ICON_GAUGE_SIZE = 92;

/**
 * The goal's icon, doubling as its own progress vessel (2026-08-02 redesign, replacing the whole-card
 * liquid fill + corner watermark — `docs/mockups/proposals/goal-card-icon-fill-mask-v1.html`, Option A).
 * Two layers, same position/size: a dim outline icon underneath (always fully visible — reads as the
 * "empty" vessel), and Tabler's solid "Filled" variant of the same icon on top, wrapped in a box that
 * clips to the goal's percentage, bottom-up (identical technique to the old whole-card liquid fill, just
 * scoped to the icon's own bounding box instead of the whole card). Because the Filled variant is a real
 * solid silhouette with its actual cutouts intact (e.g. the home icon's door is a genuine hole in the
 * path, not decoration), clipping it bottom-up reveals exactly that much of the *real* shape — the door,
 * the shield's tapered base, etc. never degrade into a generic blob at any fill level.
 */
function IconFillGauge({
  icon,
  pct,
  color,
  outlineColor
}: {
  icon: string;
  pct: number;
  color: string;
  outlineColor: string;
}) {
  return (
    <View style={{ width: ICON_GAUGE_SIZE, height: ICON_GAUGE_SIZE }}>
      <View style={{ position: 'absolute', inset: 0 }}>
        <Icon name={icon} size={ICON_GAUGE_SIZE} color={outlineColor} />
      </View>
      <View className="absolute left-0 right-0 bottom-0 overflow-hidden" style={{ height: `${Math.max(pct, 0)}%` }}>
        <View style={{ position: 'absolute', bottom: 0, left: 0, width: ICON_GAUGE_SIZE, height: ICON_GAUGE_SIZE }}>
          <Icon name={icon} size={ICON_GAUGE_SIZE} color={color} filled />
        </View>
      </View>
    </View>
  );
}

/** Small circular icon action, overlaid top-right (2026-08-02 — replaces the old full-width button row
 *  that used to sit *below* the card, visually disconnected from it). `primary` gets a solid chip in the
 *  goal's own risk colour so "Add contribution" reads as the default action; `Link existing` stays a
 *  neutral secondary chip. Nested inside the card's own outer `Pressable` — same "inner Pressable claims
 *  the tap" pattern already relied on elsewhere (e.g. `AccountList.tsx`'s row actions), so tapping a chip
 *  never also opens Goal Detail — needs an explicit `zIndex` to win that touch over the card's own
 *  full-bleed content block; see its own comment below. */
function ActionChip({
  icon,
  primary,
  color,
  onPress,
  accessibilityLabel
}: {
  icon: string;
  primary?: boolean;
  color: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      className="w-8 h-8 rounded-full items-center justify-center border"
      style={{
        backgroundColor: primary ? color : theme.surfaceSecondary,
        borderColor: primary ? color : theme.border
      }}
    >
      <Icon name={icon} size={15} color={primary ? '#fff' : theme.textSecondary} />
    </Pressable>
  );
}

/**
 * Goal card (2026-08-02 icon-fill redesign, replacing the whole-card liquid fill — researched against
 * Jar's literal jar-fill, Qapital's illustrated buckets, Monarch's trajectory framing, and CRED's NeoPOP
 * block language before the original liquid-fill direction was picked; see
 * `docs/mockups/proposals/goal-card-redesign-v1.html` for that earlier pass). The card itself is now a
 * plain neutral surface — the goal's own icon is the sole progress vessel (`IconFillGauge` above), fully
 * legible at every fill level instead of fading into a corner watermark. Action chips (top-right) and a
 * "Non-spendable"/"Spendable" tag under the goal name (reflecting `Goal.countsTowardSafeToSpend` — default
 * true → "Non-spendable", this goal's saved amount is excluded from Safe to spend; explicit false →
 * "Spendable") carry over from the liquid-fill version's second pass
 * (`docs/mockups/proposals/goal-card-footer-and-safe-to-spend-badge-v2.html`).
 */
export function GoalCard({
  goal,
  masked,
  effectiveSaved,
  onOpenDetail,
  onAddContribution,
  onLinkExisting
}: GoalCardProps) {
  const theme = useThemeColors();
  const pct = Math.min(goal.targetAmount > 0 ? (effectiveSaved / goal.targetAmount) * 100 : 0, 100);
  const color = getRiskColor(goal.risk);
  const icon = resolveGoalIcon(goal);
  const months = monthsUntil(goal.targetDate);
  const sipNeeded = calcSipNeeded(goal.targetAmount, effectiveSaved, months, getRiskReturn(goal.risk));
  const countsTowardSafeToSpend = goal.countsTowardSafeToSpend !== false;

  return (
    <Pressable onPress={() => onOpenDetail(goal)}>
      <View
        className="rounded-2xl border border-theme"
        style={{ height: CARD_HEIGHT, overflow: 'hidden', backgroundColor: theme.surface }}
      >
        {/* Action chips — needs an explicit `zIndex`: the flex-1 content column below is a plain,
            non-Pressable `View` spanning the whole card, so being the later sibling it would otherwise
            hit-test on top of these chips despite not being interactive itself, and the touch would fall
            through to the outer card `Pressable` and open Goal Detail instead. Found via on-device
            testing on the liquid-fill version of this card; carried forward defensively here too. */}
        <View className="absolute flex-row gap-1.5" style={{ top: 10, right: 10, zIndex: 2 }}>
          <ActionChip
            icon="ti-link"
            color={color}
            onPress={() => onLinkExisting(goal)}
            accessibilityLabel="Link existing transaction"
          />
          <ActionChip
            icon="ti-plus"
            primary
            color={color}
            onPress={() => onAddContribution(goal)}
            accessibilityLabel="Add contribution"
          />
        </View>

        {/* Content */}
        <View className="flex-1 p-3.5">
          <View style={{ maxWidth: '68%' }}>
            <Text className="text-2xl font-extrabold text-primary">{Math.round(pct)}%</Text>
            <Text className="text-[13px] font-bold text-primary mt-0.5" numberOfLines={1}>
              {goal.name}
            </Text>
            <View
              className="flex-row items-center gap-1 self-start rounded-full mt-1.5 px-2 py-0.5"
              style={{ backgroundColor: theme.surfaceSecondary }}
            >
              <Icon name={countsTowardSafeToSpend ? 'ti-lock' : 'ti-wallet'} size={10} color={theme.textTertiary} />
              <Text className="text-[9.5px] font-bold text-tertiary">
                {countsTowardSafeToSpend ? 'Non-spendable' : 'Spendable'}
              </Text>
            </View>
          </View>

          <View className="flex-1 items-center justify-center">
            <IconFillGauge icon={icon} pct={pct} color={color} outlineColor={ink(color, theme.textTertiary, 40)} />
          </View>

          <View>
            <View className="flex-row items-center justify-between">
              <Text className="text-[10.5px] text-secondary" numberOfLines={1}>
                {masked ? '••••' : formatCurrency(effectiveSaved)} of{' '}
                {masked ? '••••' : formatCurrency(goal.targetAmount)}
              </Text>
              <Text className="text-[10.5px] text-secondary">{months > 0 ? `${months}mo left` : 'Due'}</Text>
            </View>
            {sipNeeded > 0 && (
              <Text className="text-[9.5px] mt-0.5 text-tertiary">
                SIP needed: {masked ? '••••' : formatCurrency(Math.ceil(sipNeeded))}/mo
              </Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
