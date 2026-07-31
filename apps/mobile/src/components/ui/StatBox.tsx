import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { tint, ink } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

type StatBoxTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
type StatBoxSize = 'sm' | 'md';

interface StatBoxProps {
  label: string;
  value: ReactNode;
  /** Status tone — tints the background/border and colors the label + footer. Omit for a neutral cell. */
  tone?: StatBoxTone;
  /** Compact ('sm') inline cell vs prominent ('md', default) summary tile. */
  size?: StatBoxSize;
  /** Overrides the value text color (e.g. theme.success for a positive amount). */
  valueColor?: string;
  /** Muted line under the value. */
  sub?: ReactNode;
  /** Emphasized line below (tone-colored), e.g. "Est. tax: ₹X". */
  footer?: ReactNode;
  className?: string;
}

const BOX = {
  sm: { pad: 'rounded-xl p-2.5', value: 'text-xs' },
  md: { pad: 'rounded-2xl p-3', value: 'text-lg' }
} as const;

/**
 * A label + value summary cell. Neutral by default (surface-2); pass a `tone` for a tinted,
 * status-colored variant (e.g. the capital-gains summary tiles).
 */
export function StatBox({ label, value, tone, size = 'md', valueColor, sub, footer, className = '' }: StatBoxProps) {
  const theme = useThemeColors();
  const color = tone && tone !== 'neutral' ? theme[tone] : null;
  const box = BOX[size];

  return (
    <View
      className={`border ${box.pad} ${color ? '' : 'bg-surface-2 border-theme'} ${className}`}
      style={color ? { backgroundColor: tint(color, 10), borderColor: tint(color, 25) } : undefined}
    >
      <Text
        className={`text-[10px] font-semibold uppercase tracking-wide ${color ? '' : 'text-tertiary'}`}
        style={color ? { color: ink(color, theme.textPrimary) } : undefined}
      >
        {label}
      </Text>
      <Text
        className={`${box.value} font-bold mt-1 tabular-nums ${valueColor ? '' : 'text-primary'}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </Text>
      {sub !== undefined && <Text className="text-[10px] text-secondary mt-0.5">{sub}</Text>}
      {footer !== undefined && (
        <Text className="text-xs font-semibold mt-1" style={color ? { color } : undefined}>
          {footer}
        </Text>
      )}
    </View>
  );
}
