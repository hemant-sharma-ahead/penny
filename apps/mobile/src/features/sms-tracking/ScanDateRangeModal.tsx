import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal, Button, DateInput } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { epochToDateInput } from '@/lib/date';

const DAY_MS = 86_400_000;

type Chip = 'last_month' | 'last_3_months' | 'last_6_months' | 'all_time' | 'custom';

const CHIPS: { value: Chip; label: string }[] = [
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'all_time', label: 'All time' }
];

interface ScanDateRangeModalProps {
  onClose: () => void;
  onStart: (fromDate: number, toDate: number) => void;
}

/**
 * "Scan a date range" — the standing action (plan §7 requirement 2), independent of first-time setup,
 * always reachable from the steady-state screen. Centered modal (never a bottom sheet), matching the
 * mockup's chip row + custom-date fallback.
 */
export function ScanDateRangeModal({ onClose, onStart }: ScanDateRangeModalProps) {
  const theme = useThemeColors();
  const [chip, setChip] = useState<Chip>('last_3_months');
  // `Date.now()` read once via a lazy initializer (same pattern `ImportProgressStep.tsx`'s own
  // `tickNow` uses) — never called directly in the render body, which this repo's React-Compiler-era
  // `react-hooks/purity` lint rule forbids (a component's render output must be a pure function of its
  // props/state).
  const [customFrom, setCustomFrom] = useState(() => epochToDateInput(Date.now() - 90 * DAY_MS));
  const [customTo, setCustomTo] = useState(() => epochToDateInput(Date.now()));

  function resolveRange(): [number, number] {
    if (chip === 'custom') return [new Date(customFrom).getTime(), new Date(customTo + 'T23:59:59').getTime()];
    const now = Date.now(); // fine here — this runs inside an event handler, never during render
    const months = chip === 'last_month' ? 1 : chip === 'last_3_months' ? 3 : chip === 'last_6_months' ? 6 : null;
    const from = months === null ? 0 : new Date(new Date().getFullYear(), new Date().getMonth() - months, 1).getTime();
    return [from, now];
  }

  return (
    <Modal
      onClose={onClose}
      title="Scan a date range"
      footer={
        <Button
          variant="primary"
          fullWidth
          onPress={() => {
            const [fromDate, toDate] = resolveRange();
            onStart(fromDate, toDate);
          }}
        >
          Start scan
        </Button>
      }
    >
      <View className="flex-row flex-wrap gap-1.5">
        {CHIPS.map((c) => {
          const on = chip === c.value;
          return (
            <Pressable
              key={c.value}
              onPress={() => setChip(c.value)}
              className="px-2.5 py-1.5 rounded-full border"
              style={{
                borderColor: on ? theme.primary : theme.border,
                backgroundColor: on ? tint(theme.primary, 14) : 'transparent'
              }}
            >
              <Text className="text-[10px] font-bold" style={{ color: on ? theme.primary : theme.textSecondary }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-[9.5px] uppercase tracking-wide text-tertiary mt-3 mb-1.5">or choose custom dates</Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <DateInput
            label="From"
            value={customFrom}
            onChange={(v) => {
              setCustomFrom(v);
              setChip('custom');
            }}
          />
        </View>
        <View className="flex-1">
          <DateInput
            label="To"
            value={customTo}
            onChange={(v) => {
              setCustomTo(v);
              setChip('custom');
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
