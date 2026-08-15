import { View, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface WizardProgressProps {
  /** 0-based index of the CURRENT step within the visible sequence (mockup's "Step N of M"). */
  stepIndex: number;
  totalSteps: number;
  stepLabel: string;
  countLabel?: string;
  /** "Draft — nothing saved yet" badge (2026-08-14, redesign §3.1, resolved via user review) — a small,
   *  persistent chip, visible on every mid-flow stage (Accounts through Transactions), never a sentence
   *  repeated per screen. Disappears on Upload/Done (nothing to caveat there).
   *
   *  Judgment call, flagged explicitly: the mockup places this in the shared NATIVE header's right slot
   *  (`MainTabs.tsx`'s `HeaderRight`) — that slot is a fixed global component with no per-screen content
   *  mechanism today (`HeaderBackContext.tsx` only threads a back-handler, not an arbitrary right-side
   *  element), and building that out is a materially bigger nav-chrome change than this badge itself
   *  warrants. Rendered instead inside this same progress bar (still a small, persistent, non-repeated
   *  chip, just anchored to the wizard's own chrome rather than the app-wide header) — same visual
   *  weight/intent, different mount point. */
  showDraftBadge?: boolean;
}

/**
 * Cross-stage wizard chrome (2026-08-14, CSV-import redesign Chunk B — mockup's "Wizard stage progress"
 * section, §3.1). A slim segmented bar (reusing `ReviewStep.tsx`'s former `ProgressBar` visual weight,
 * now generalized across all 6 steps instead of just Preview's own 2 internal sections) + a plain-
 * language "Step N of M · Stage" line. Lives in `ImportPage.tsx` itself (cross-stage chrome, not
 * stage-specific content) — rendered above whichever step component is currently showing, for every
 * mid-flow stage (mapColumns through transactions; never upload/done, which have nothing to caveat).
 */
export function WizardProgress({ stepIndex, totalSteps, stepLabel, countLabel, showDraftBadge }: WizardProgressProps) {
  const theme = useThemeColors();
  return (
    <View className="px-4 pt-2 pb-1.5 border-b border-theme bg-surface gap-1.5">
      <View className="flex-row items-center gap-1">
        {Array.from({ length: totalSteps }, (_, i) => (
          <View
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: 4,
              backgroundColor: i < stepIndex ? theme.success : i === stepIndex ? theme.primary : theme.surfaceTertiary
            }}
          />
        ))}
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-[10.5px] font-bold text-primary">
          Step {stepIndex + 1} of {totalSteps} · {stepLabel}
        </Text>
        <View className="flex-row items-center gap-2">
          {countLabel && <Text className="text-[9.5px] text-tertiary">{countLabel}</Text>}
          {showDraftBadge && (
            <View
              className="flex-row items-center gap-1 rounded-full border px-1.5 py-0.5"
              style={{ borderColor: theme.border, backgroundColor: theme.surfaceSecondary }}
            >
              <Icon name="ti-device-floppy" size={9} color={theme.textTertiary} />
              <Text className="text-[7.5px] font-extrabold uppercase tracking-wide text-tertiary">Draft</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
