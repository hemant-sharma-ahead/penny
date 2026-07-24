import { View, Text } from 'react-native';
import { LIFECYCLE_FUNDS } from '@/core/nps';
import type { NpsLifecycleFund } from '@/core/nps';
import { Modal } from '~/components/ui';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

// Web builds this as a hand-rolled `fixed inset-0` overlay (no Modal import at all) — raw CSS
// positioning has no RN equivalent, so this is rebuilt on the shared centered `Modal` component instead.
export function NpsLifecycleDetail({
  fund,
  birthYearStr,
  onClose
}: {
  fund: NpsLifecycleFund;
  birthYearStr: string;
  onClose: () => void;
}) {
  const theme = useThemeColors();
  const config = LIFECYCLE_FUNDS[fund];
  const birthYear = parseInt(birthYearStr, 10);
  const currentAge = !isNaN(birthYear) ? new Date().getFullYear() - birthYear : null;
  const currentAgeRow = currentAge != null ? Math.max(35, Math.min(55, currentAge)) : null;

  return (
    <Modal onClose={onClose} title={config.label} scrollable>
      <View className="flex-row items-center gap-2 -mt-2">
        <Text
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: tint(config.color, 10), color: config.color }}
        >
          {config.shortLabel}
        </Text>
        <Text className="text-xs text-secondary leading-snug flex-1">{config.description}</Text>
      </View>

      {currentAge != null && (
        <Text className="text-xs text-secondary">
          Your age: <Text className="text-primary font-bold">{currentAge}</Text>
          {currentAge < 35 && ' — PFRDA schedule starts at 35'}
          {currentAge > 55 && ' — PFRDA schedule ends at 55'}
        </Text>
      )}

      <View className="rounded-xl overflow-hidden border border-theme">
        <View className="flex-row px-3 py-2 bg-surface-2">
          <Text className="flex-1 text-xs font-semibold text-tertiary">Age</Text>
          <Text className="flex-1 text-right text-xs font-semibold" style={{ color: '#0ea5e9' }}>
            Equity
          </Text>
          <Text className="flex-1 text-right text-xs font-semibold" style={{ color: '#d97706' }}>
            Corp.
          </Text>
          <Text className="flex-1 text-right text-xs font-semibold" style={{ color: '#10b981' }}>
            Govt.
          </Text>
        </View>
        {config.table.map((row) => {
          const isCurrent = row.age === currentAgeRow;
          return (
            <View
              key={row.age}
              className="flex-row px-3 py-1.5 border-t border-theme"
              style={isCurrent ? { backgroundColor: tint(theme.primary, 8) } : undefined}
            >
              <Text
                className="flex-1 text-xs tabular-nums"
                style={{
                  color: isCurrent ? theme.textPrimary : theme.textSecondary,
                  fontWeight: isCurrent ? '700' : '400'
                }}
              >
                {row.age}
                {isCurrent && ' ← you'}
              </Text>
              <Text className="flex-1 text-right text-xs font-medium tabular-nums" style={{ color: '#0ea5e9' }}>
                {row.equity}%
              </Text>
              <Text className="flex-1 text-right text-xs font-medium tabular-nums" style={{ color: '#d97706' }}>
                {row.corporate}%
              </Text>
              <Text className="flex-1 text-right text-xs font-medium tabular-nums" style={{ color: '#10b981' }}>
                {row.govt}%
              </Text>
            </View>
          );
        })}
      </View>

      <Text className="text-[10px] text-tertiary leading-relaxed">
        Source: PFRDA lifecycle fund circular. Ages below 35 use the 35-year allocation; ages above 55 use the 55-year
        allocation.
      </Text>
    </Modal>
  );
}
