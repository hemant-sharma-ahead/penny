import { View, ScrollView, Text } from 'react-native';
import { Card, TextInput, Button, SegmentedControl, AmountInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { formatCurrency, parseNumber } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import { useSipCalculator } from './useSipCalculator';

const SIP_RETURN_OPTIONS = [
  { value: '7', label: '7% Conservative' },
  { value: '11', label: '11% Moderate' },
  { value: '14', label: '14% Aggressive' }
];

export function SipCalculatorTab() {
  const theme = useThemeColors();
  const sip = useSipCalculator();

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
      <View className="px-4 py-4 gap-4">
        <View className="rounded-xl p-3 flex-row gap-2 bg-surface-2 border border-theme">
          <Icon name="ti-calculator" size={18} color={theme.primary} />
          <Text className="text-xs leading-relaxed text-secondary flex-1">
            Enter your goal details to find the monthly SIP amount needed to reach your target, accounting for any
            savings already set aside.
          </Text>
        </View>

        <Card className="gap-3">
          <AmountInput label="Goal amount" value={sip.target} onChange={sip.setTarget} placeholder="e.g. 1000000" />
          <AmountInput label="Already saved" value={sip.saved} onChange={sip.setSaved} placeholder="0" />
          <TextInput
            label="Time horizon (years)"
            value={sip.years}
            onChange={sip.setYears}
            keyboardType="decimal-pad"
            placeholder="e.g. 5"
          />
          <View>
            <Text className="text-xs font-medium text-secondary">Expected return (% per year)</Text>
            <View className="mt-1">
              <SegmentedControl options={SIP_RETURN_OPTIONS} value={sip.annualReturn} onChange={sip.setAnnualReturn} />
            </View>
          </View>
          <Button variant="primary" fullWidth onPress={sip.calculate}>
            Calculate
          </Button>
        </Card>

        {sip.result !== null && (
          <Card className="items-center">
            <Text className="text-xs mb-1 text-secondary">Required monthly SIP</Text>
            <Text className="text-3xl font-semibold text-primary">{formatCurrency(Math.ceil(sip.result))}</Text>
            <Text className="text-xs mt-1 text-tertiary">
              per month for {sip.years} year{sip.years === '1' ? '' : 's'} at {sip.annualReturn}% p.a.
            </Text>
            {parseNumber(sip.saved) > 0 && (
              <Text className="text-xs mt-2" style={{ color: theme.primary }}>
                Existing savings of {formatCurrency(parseNumber(sip.saved))} factored in.
              </Text>
            )}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
