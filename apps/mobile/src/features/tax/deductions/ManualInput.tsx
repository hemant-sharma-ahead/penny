import { View, Text } from 'react-native';
import { AmountInput } from '~/components/ui';

interface ManualInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

/** RN port of apps/web-legacy/src/features/tax/deductions/ManualInput.tsx — a labelled inline numeric
 *  input for entering a manual deduction amount. */
export function ManualInput({ label, value, onChange }: ManualInputProps) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-xs flex-1 text-secondary" numberOfLines={1}>
        {label}
      </Text>
      <View className="w-28">
        <AmountInput placeholder="0" value={value} onChange={onChange} showWords={false} />
      </View>
    </View>
  );
}
