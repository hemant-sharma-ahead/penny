import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

interface PillProps {
  children: ReactNode;
  /** Currently-selected action for this row/tile — filled primary treatment. */
  active?: boolean;
  /** Core-suggested action (e.g. "Mark as Transfer" for a likely-transfer category) not yet chosen —
   *  a distinct info-tinted treatment so the suggestion stands out from the other plain pills. */
  suggested?: boolean;
  icon?: string;
  /** Tighter padding/font for a dense row that must fit on one line. */
  compact?: boolean;
  onPress: () => void;
}

/**
 * RN port of apps/web-react/src/features/import/review/Pill.tsx. Small pill-shaped action button for
 * the import review screen's dense per-account/per-category action rows. Single-consumer (the import
 * review screen only) — per penny-standards.md's shared/ rule, lives in this feature's folder, not
 * components/ui/.
 */
export function Pill({ children, active, suggested, icon, compact, onPress }: PillProps) {
  const theme = useThemeColors();
  const backgroundColor = active ? theme.primary : suggested ? tint(theme.info, 12) : 'transparent';
  const borderColor = active ? theme.primary : suggested ? tint(theme.info, 45) : theme.border;
  const textColor = active ? '#fff' : suggested ? theme.info : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1 rounded-full border ${compact ? 'px-2 py-1' : 'px-2.5 py-1'}`}
      style={{ backgroundColor, borderColor }}
    >
      {icon && <Icon name={icon} size={11} color={textColor} />}
      <Text className={`font-bold ${compact ? 'text-[9.5px]' : 'text-[10.5px]'}`} style={{ color: textColor }}>
        {children}
      </Text>
    </Pressable>
  );
}
