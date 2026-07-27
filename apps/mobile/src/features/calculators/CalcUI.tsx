// Shared building blocks for the financial calculator screens. RN port of
// apps/web-react/src/features/calculators/CalcUI.tsx.
import { Children, Fragment, useState, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { TextInput, SegmentedControl } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';

/** RN port of web's `MaskedValue`'s tap-to-peek: tapping a masked amount reveals it for 5 seconds. */
function usePeek(): [boolean, () => void] {
  const [isPeeking, setIsPeeking] = useState(false);
  return [
    isPeeking,
    () => {
      setIsPeeking(true);
      setTimeout(() => setIsPeeking(false), 5000);
    }
  ];
}

interface LabeledInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}

export function LabeledInput({ label, value, onChange, hint, placeholder, prefix, suffix }: LabeledInputProps) {
  return (
    <TextInput
      label={label}
      value={value}
      onChange={onChange}
      hint={hint}
      placeholder={placeholder ?? '0'}
      prefix={prefix}
      suffix={suffix}
      keyboardType="decimal-pad"
    />
  );
}

interface SegmentedToggleProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function SegmentedToggle<T extends string>({ label, value, options, onChange }: SegmentedToggleProps<T>) {
  return (
    <View>
      <Text className="text-xs font-medium text-secondary mb-1">{label}</Text>
      <SegmentedControl options={options} value={value} onChange={onChange} />
    </View>
  );
}

interface ResultRowProps {
  label: string;
  value: string;
  accent?: boolean;
  saving?: boolean;
}

export function ResultRow({ label, value, accent, saving }: ResultRowProps) {
  const theme = useThemeColors();
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-sm text-secondary">{label}</Text>
      <Text
        className="text-sm font-semibold"
        style={{ color: saving ? theme.success : accent ? theme.primary : theme.textPrimary }}
      >
        {value}
      </Text>
    </View>
  );
}

/** Result row whose value is a rupee amount — masked outside Open mode (caller passes `masked`). */
interface AmountRowProps {
  label: string;
  amount: number;
  accent?: boolean;
  saving?: boolean;
  masked?: boolean;
}

export function AmountRow({ label, amount, accent, saving, masked }: AmountRowProps) {
  const theme = useThemeColors();
  const [isPeeking, peek] = usePeek();
  const hidden = masked && !isPeeking;
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-sm text-secondary">{label}</Text>
      <Pressable onPress={hidden ? peek : undefined} disabled={!masked}>
        <Text
          className="text-sm font-semibold"
          style={{ color: saving ? theme.success : accent ? theme.primary : theme.textPrimary }}
        >
          {hidden ? '••••' : formatCurrency(amount)}
        </Text>
      </Pressable>
    </View>
  );
}

// RN has no CSS `divide-y` equivalent — same border-top-on-non-first-child technique as
// `~/components/ui/ListContainer.tsx`.
export function ResultCard({ title, children }: { title: string; children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <View className="rounded-2xl p-4 bg-surface border border-theme">
      <Text className="text-xs font-semibold uppercase tracking-wide text-tertiary mb-2">{title}</Text>
      {items.map((child, i) => (
        <Fragment key={i}>{i > 0 ? <View className="border-t border-theme">{child}</View> : child}</Fragment>
      ))}
    </View>
  );
}

export function HeroResult({
  label,
  amount,
  note,
  masked
}: {
  label: string;
  amount: number;
  note?: string;
  masked?: boolean;
}) {
  const [isPeeking, peek] = usePeek();
  const hidden = masked && !isPeeking;
  return (
    <View className="bg-surface border border-theme rounded-2xl p-5 items-center">
      <Text className="text-xs text-secondary mb-1">{label}</Text>
      <Pressable onPress={hidden ? peek : undefined} disabled={!masked}>
        <Text className="text-3xl font-semibold text-primary">{hidden ? '••••' : formatCurrency(amount)}</Text>
      </Pressable>
      {note && <Text className="text-xs text-tertiary mt-1">{note}</Text>}
    </View>
  );
}
