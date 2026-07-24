import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { TextInput, SegmentedControl, OptionButton, AmountInput } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { NPS_FUND_MANAGERS, LIFECYCLE_FUNDS } from '@/core/nps';
import type { NpsChoiceType, NpsLifecycleFund, NpsPfmKey, NpsSchemeType } from '@/core/nps';
import { NpsLifecycleDetail } from './NpsLifecycleDetail';

interface NpsFieldsProps {
  npsChoiceType: NpsChoiceType;
  setNpsChoiceType: (v: NpsChoiceType) => void;
  npsLifecycleFund: NpsLifecycleFund;
  setNpsLifecycleFund: (v: NpsLifecycleFund) => void;
  npsPfm: NpsPfmKey | '';
  setNpsPfm: (v: NpsPfmKey | '') => void;
  npsSchemeType: NpsSchemeType | '';
  setNpsSchemeType: (v: NpsSchemeType | '') => void;
  npsTier: 'tier1' | 'tier2';
  setNpsTier: (v: 'tier1' | 'tier2') => void;
  npsBirthYear: string;
  setNpsBirthYear: (v: string) => void;
  npsPran: string;
  setNpsPran: (v: string) => void;
  npsMonthly: string;
  setNpsMonthly: (v: string) => void;
  units: string;
  setUnits: (v: string) => void;
}

// NPS fields: auto (lifecycle) vs active choice, fund manager / scheme type /
// tier, plus common birth-year, PRAN and monthly contribution. Owns the
// lifecycle-schedule modal.
export function NpsFields({
  npsChoiceType,
  setNpsChoiceType,
  npsLifecycleFund,
  setNpsLifecycleFund,
  npsPfm,
  setNpsPfm,
  npsSchemeType,
  setNpsSchemeType,
  npsTier,
  setNpsTier,
  npsBirthYear,
  setNpsBirthYear,
  npsPran,
  setNpsPran,
  npsMonthly,
  setNpsMonthly,
  units,
  setUnits
}: NpsFieldsProps) {
  const theme = useThemeColors();
  const [showNpsSchedule, setShowNpsSchedule] = useState(false);
  const selectedFund = LIFECYCLE_FUNDS[npsLifecycleFund];

  return (
    <>
      {/* Choice type toggle */}
      <View>
        <Text className="text-xs font-medium text-secondary mb-1">Investment choice</Text>
        <SegmentedControl
          options={[
            { value: 'auto' as const, label: 'Auto / Lifecycle' },
            { value: 'active' as const, label: 'Active Choice' }
          ]}
          value={npsChoiceType}
          onChange={setNpsChoiceType}
        />
      </View>

      {/* Auto Choice: lifecycle fund selector — pills + contextual description */}
      {npsChoiceType === 'auto' && (
        <View>
          <Text className="text-xs font-medium text-secondary mb-1">Lifecycle fund</Text>
          <SegmentedControl
            options={Object.values(LIFECYCLE_FUNDS).map((fund) => ({
              value: fund.key,
              label: fund.shortLabel,
              color: fund.color
            }))}
            value={npsLifecycleFund}
            onChange={setNpsLifecycleFund}
          />
          {/* Selected fund description + schedule link */}
          <View className="mt-2 px-1">
            <Text className="text-xs leading-snug" style={{ color: selectedFund.color }}>
              {selectedFund.description}
            </Text>
            <Pressable onPress={() => setShowNpsSchedule(true)} className="mt-1 self-start">
              <Text className="text-xs font-medium underline" style={{ color: theme.primary }}>
                See year-by-year allocation →
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Active Choice: fund manager + scheme type + tier + units */}
      {npsChoiceType === 'active' && (
        <>
          <View>
            <Text className="text-xs font-medium text-secondary mb-1">Fund manager</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {NPS_FUND_MANAGERS.map((m) => (
                <View key={m.key} className="w-[48%]">
                  <OptionButton
                    label={m.label}
                    selected={npsPfm === m.key}
                    onPress={() => setNpsPfm(npsPfm === m.key ? '' : (m.key as NpsPfmKey))}
                    compact
                  />
                </View>
              ))}
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-medium text-secondary mb-1">Scheme type</Text>
              <SegmentedControl
                options={(['E', 'C', 'G', 'A'] as const).map((t) => ({ value: t, label: t }))}
                value={npsSchemeType || 'E'}
                onChange={setNpsSchemeType}
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-medium text-secondary mb-1">Tier</Text>
              <SegmentedControl
                options={[
                  { value: 'tier1' as const, label: 'Tier I' },
                  { value: 'tier2' as const, label: 'Tier II' }
                ]}
                value={npsTier}
                onChange={setNpsTier}
              />
            </View>
          </View>
          <TextInput
            label="Units held"
            keyboardType="decimal-pad"
            placeholder="0.0000"
            value={units}
            onChange={setUnits}
            hint="NAV is auto-fetched from npsnav.in — live corpus shown on the card"
          />
        </>
      )}

      {/* Common NPS fields */}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextInput
            label="Birth year"
            keyboardType="numeric"
            placeholder="e.g. 1985"
            value={npsBirthYear}
            onChange={setNpsBirthYear}
          />
        </View>
        <View className="flex-1">
          <TextInput label="PRAN" hint="opt." placeholder="12-digit" value={npsPran} onChange={setNpsPran} />
        </View>
      </View>
      {npsChoiceType === 'auto' && (
        <>
          <View>
            <Text className="text-xs font-medium text-secondary mb-1">
              Fund manager <Text className="font-normal text-tertiary">(optional)</Text>
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {NPS_FUND_MANAGERS.map((m) => (
                <View key={m.key} className="w-[48%]">
                  <OptionButton
                    label={m.label}
                    selected={npsPfm === m.key}
                    onPress={() => setNpsPfm(npsPfm === m.key ? '' : (m.key as NpsPfmKey))}
                    compact
                  />
                </View>
              ))}
            </View>
          </View>
          <View>
            <Text className="text-xs font-medium text-secondary mb-1">Tier</Text>
            <SegmentedControl
              options={[
                { value: 'tier1' as const, label: 'Tier I' },
                { value: 'tier2' as const, label: 'Tier II' }
              ]}
              value={npsTier}
              onChange={setNpsTier}
            />
          </View>
        </>
      )}
      <AmountInput label="Monthly contribution" placeholder="0" value={npsMonthly} onChange={setNpsMonthly} />

      {showNpsSchedule && (
        <NpsLifecycleDetail
          fund={npsLifecycleFund}
          birthYearStr={npsBirthYear}
          onClose={() => setShowNpsSchedule(false)}
        />
      )}
    </>
  );
}
