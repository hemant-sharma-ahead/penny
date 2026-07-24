import { View, Text } from 'react-native';
import { TextInput, SelectInput, SegmentedControl, AmountInput } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import type { CompoundingFreq, FdResult, RdResult } from '@/core/fd/fdCalculations';

interface FdFieldsProps {
  editing: boolean;
  fdSubType: 'fd' | 'rd';
  setFdSubType: (v: 'fd' | 'rd') => void;
  fdBank: string;
  setFdBank: (v: string) => void;
  fdStartDate: string;
  setFdStartDate: (v: string) => void;
  interestRate: string;
  setInterestRate: (v: string) => void;
  investedAmount: string;
  setInvestedAmount: (v: string) => void;
  fdCompoundingFreq: CompoundingFreq;
  setFdCompoundingFreq: (v: CompoundingFreq) => void;
  maturityDate: string;
  setMaturityDate: (v: string) => void;
  rdTenureMonths: string;
  setRdTenureMonths: (v: string) => void;
  fdPreview: FdResult | RdResult | null;
}

// Fixed Deposit / Recurring Deposit fields with a live maturity projection.
// The deposit sub-type is locked while editing an existing holding.
//
// RN port note: web's `grid grid-cols-2` rows (start date + rate, compounding + maturity date,
// installment + tenure) have no Yoga equivalent — each becomes a `flex-row gap-3` with `flex-1`
// children, same pattern used across every other ported form (see PolicyForm).
export function FdFields({
  editing,
  fdSubType,
  setFdSubType,
  fdBank,
  setFdBank,
  fdStartDate,
  setFdStartDate,
  interestRate,
  setInterestRate,
  investedAmount,
  setInvestedAmount,
  fdCompoundingFreq,
  setFdCompoundingFreq,
  maturityDate,
  setMaturityDate,
  rdTenureMonths,
  setRdTenureMonths,
  fdPreview
}: FdFieldsProps) {
  const theme = useThemeColors();

  return (
    <View className="flex flex-col gap-3">
      {/* FD / RD toggle */}
      <View>
        <Text className="text-xs font-medium text-secondary">Type</Text>
        <View className="mt-1">
          <SegmentedControl
            options={[
              { value: 'fd', label: 'Fixed Deposit' },
              { value: 'rd', label: 'Recurring Deposit' }
            ]}
            value={fdSubType}
            onChange={(v) => {
              if (!editing) setFdSubType(v);
            }}
          />
        </View>
      </View>

      {/* Bank */}
      <TextInput
        label="Bank / Institution"
        hint="optional"
        placeholder="e.g. SBI, HDFC, Post Office"
        value={fdBank}
        onChange={setFdBank}
      />

      {/* Start date + interest rate */}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextInput
            label={fdSubType === 'rd' ? 'First installment date (YYYY-MM-DD)' : 'Deposit date (YYYY-MM-DD)'}
            value={fdStartDate}
            onChange={setFdStartDate}
          />
        </View>
        <View className="flex-1">
          <TextInput
            label="Interest rate (%)"
            keyboardType="decimal-pad"
            placeholder="7.1"
            value={interestRate}
            onChange={setInterestRate}
          />
        </View>
      </View>

      {fdSubType === 'fd' ? (
        <>
          <AmountInput label="Principal amount" placeholder="0" value={investedAmount} onChange={setInvestedAmount} />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <SelectInput
                label="Compounding"
                value={fdCompoundingFreq}
                onChange={(v) => setFdCompoundingFreq(v as CompoundingFreq)}
                options={[
                  { value: 'quarterly', label: 'Quarterly (default)' },
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'half-yearly', label: 'Half-yearly' },
                  { value: 'yearly', label: 'Yearly' },
                  { value: 'at_maturity', label: 'At maturity' }
                ]}
              />
            </View>
            <View className="flex-1">
              <TextInput label="Maturity date (YYYY-MM-DD)" value={maturityDate} onChange={setMaturityDate} />
            </View>
          </View>
        </>
      ) : (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <AmountInput
              label="Monthly installment"
              placeholder="5000"
              value={investedAmount}
              onChange={setInvestedAmount}
            />
          </View>
          <View className="flex-1">
            <TextInput
              label="Tenure (months)"
              keyboardType="number-pad"
              placeholder="24"
              value={rdTenureMonths}
              onChange={setRdTenureMonths}
            />
          </View>
        </View>
      )}

      {/* Live preview */}
      {fdPreview && (
        <View className="rounded-xl p-3 flex flex-col gap-1 border border-theme bg-surface-2">
          {fdSubType === 'fd' ? (
            <>
              <Text className="text-[11px] text-tertiary">Projected maturity amount</Text>
              <Text className="text-base font-bold text-primary">
                ₹{fdPreview.maturityAmount.toLocaleString('en-IN')}
              </Text>
              <Text className="text-[11px]" style={{ color: theme.success }}>
                +₹{fdPreview.totalInterest.toLocaleString('en-IN')} interest (
                {(
                  ((fdPreview.maturityAmount - (parseFloat(investedAmount) || 0)) / (parseFloat(investedAmount) || 1)) *
                  100
                ).toFixed(1)}
                %)
              </Text>
              {'daysRemaining' in fdPreview && fdPreview.daysRemaining > 0 && (
                <Text className="text-[10px] text-tertiary">{fdPreview.daysRemaining} days remaining</Text>
              )}
            </>
          ) : (
            <>
              <Text className="text-[11px] text-tertiary">Projected maturity amount</Text>
              <Text className="text-base font-bold text-primary">
                ₹{fdPreview.maturityAmount.toLocaleString('en-IN')}
              </Text>
              <Text className="text-[11px]" style={{ color: theme.success }}>
                +₹{fdPreview.totalInterest.toLocaleString('en-IN')} interest over {rdTenureMonths} months
              </Text>
              <Text className="text-[10px] text-tertiary">
                Total committed: ₹
                {((parseFloat(investedAmount) || 0) * (parseInt(rdTenureMonths, 10) || 0)).toLocaleString('en-IN')}
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}
