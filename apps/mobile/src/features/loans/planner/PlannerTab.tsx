import { View, Text, ScrollView } from 'react-native';
import { Card, Button, TextInput, SelectInput, SegmentedControl, SectionLabel, AmountInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { PlannerResults } from './PlannerResults';
import type { usePlanner } from './usePlanner';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface PlannerTabProps {
  planner: ReturnType<typeof usePlanner>;
  masked: boolean;
}

export function PlannerTab({ planner, masked }: PlannerTabProps) {
  const p = planner;
  const theme = useThemeColors();

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-4 gap-5">
        {/* Loan Basics */}
        <View>
          <SectionLabel>Loan Basics</SectionLabel>
          <Card className="gap-3">
            <AmountInput label="Principal" value={p.principal} onChange={p.setPrincipal} placeholder="e.g. 5000000" />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextInput
                  label="Interest rate"
                  suffix="% p.a."
                  keyboardType="decimal-pad"
                  value={p.rate}
                  onChange={p.setRate}
                  placeholder="8.5"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium text-secondary mb-1">Start month</Text>
                <View className="flex-row gap-1">
                  <View className="flex-1">
                    <SelectInput
                      value={String(p.startMonth)}
                      onChange={(v) => p.setStartMonth(Number(v))}
                      options={MONTHS.map((m, i) => ({ label: m, value: String(i) }))}
                    />
                  </View>
                  <View className="flex-1">
                    <SelectInput
                      value={String(p.startYear)}
                      onChange={(v) => p.setStartYear(Number(v))}
                      options={p.yearOptions.map((y) => ({ label: String(y), value: String(y) }))}
                    />
                  </View>
                </View>
              </View>
            </View>
            <View>
              <Text className="text-xs font-medium text-secondary mb-1">Tenure</Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextInput
                    suffix="years"
                    keyboardType="number-pad"
                    value={p.tenureYrs}
                    onChange={p.setTenureYrs}
                    placeholder="20"
                  />
                </View>
                <View className="flex-1">
                  <TextInput
                    suffix="months"
                    keyboardType="number-pad"
                    value={p.tenureMos}
                    onChange={p.setTenureMos}
                    placeholder="0"
                  />
                </View>
              </View>
            </View>
          </Card>
        </View>

        {/* Accelerators */}
        <View>
          <SectionLabel>Accelerators</SectionLabel>
          <Card className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextInput
                  label="EMI step-up"
                  suffix="% / year"
                  hint="0 = off"
                  keyboardType="decimal-pad"
                  value={p.stepUp}
                  onChange={p.setStepUp}
                  placeholder="0"
                />
              </View>
              <View className="flex-1">
                <TextInput
                  label="Extra EMI"
                  suffix="/ year"
                  hint="0 = off"
                  keyboardType="decimal-pad"
                  value={p.extraEmi}
                  onChange={p.setExtraEmi}
                  placeholder="0"
                />
              </View>
            </View>
            <View>
              <Text className="text-xs font-medium text-secondary mb-1.5">Prepayment strategy</Text>
              <SegmentedControl
                options={[
                  { value: 'reduce_tenure' as const, label: 'Reduce tenure' },
                  { value: 'reduce_emi' as const, label: 'Reduce EMI' }
                ]}
                value={p.strategy}
                onChange={p.setStrategy}
              />
            </View>
          </Card>
        </View>

        {/* Lump Sum Prepayments */}
        <View>
          <SectionLabel>Lump Sum Prepayments</SectionLabel>
          <Card className="gap-3">
            {p.prepayRows.length === 0 && (
              <Text className="text-xs text-tertiary text-center py-1">
                No prepayments added. Add one-time lump sum payments below.
              </Text>
            )}
            {p.prepayRows.map((r) => (
              <View key={r.id} className="flex-row items-center gap-2">
                <View className="flex-1">
                  <TextInput
                    value={r.month}
                    onChange={(v) => p.updatePrepayRow(r.id, 'month', v)}
                    keyboardType="number-pad"
                    prefix="Mo."
                    placeholder="e.g. 12"
                  />
                </View>
                <View className="flex-1">
                  <AmountInput
                    value={r.amount}
                    onChange={(v) => p.updatePrepayRow(r.id, 'amount', v)}
                    placeholder="Amount"
                    showWords={false}
                  />
                </View>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="ti-x"
                  accessibilityLabel="Remove prepayment"
                  onPress={() => p.removePrepayRow(r.id)}
                />
              </View>
            ))}
            <Button variant="secondary" fullWidth icon="ti-plus" onPress={p.addPrepayRow}>
              Add prepayment
            </Button>
          </Card>
        </View>

        {/* Results */}
        {p.isValid && p.result.rows.length > 0 && <PlannerResults planner={planner} masked={masked} />}

        {!p.isValid && (
          <View className="items-center justify-center py-10">
            <Icon name="ti-calculator" size={44} color={theme.textTertiary} />
            <Text className="text-sm text-secondary mt-3 text-center">
              Enter principal, rate, and tenure above to see the schedule.
            </Text>
          </View>
        )}

        <View style={{ height: 16 }} />
      </View>
    </ScrollView>
  );
}
