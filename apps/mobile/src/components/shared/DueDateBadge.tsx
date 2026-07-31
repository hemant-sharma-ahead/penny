import { Text } from 'react-native';
import { dueDateInfo } from '@/lib/date';
import { useThemeColors } from '~/theme/useThemeColors';

interface DueDateBadgeProps {
  dueDateMs: number;
  nowMs: number;
  /** Days threshold for "urgent" red state. Default 7. */
  warningDays?: number;
  /** Label to show when past due. Default "Xd overdue". Pass "Expired" for insurance. */
  expiredLabel?: string;
}

/**
 * RN port note: `dueDateInfo`'s far-future case returns the literal CSS var string
 * `'var(--color-surface-secondary)'` (a web-only construct — core has no theme context to resolve a real
 * color from). Substituted here with the active theme's real `surfaceSecondary` hex, same "flagged
 * platform difference" pattern Track 3 used for `tint()`/`ink()`.
 */
export function DueDateBadge({ dueDateMs, nowMs, warningDays, expiredLabel }: DueDateBadgeProps) {
  const theme = useThemeColors();
  const { text, color, bg } = dueDateInfo(dueDateMs, nowMs, warningDays, expiredLabel);
  const resolvedBg = bg === 'var(--color-surface-secondary)' ? theme.surfaceSecondary : bg;

  return (
    <Text className="text-[10px] font-semibold px-2 py-0.5 rounded-lg" style={{ color, backgroundColor: resolvedBg }}>
      {text}
    </Text>
  );
}
