import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabStrip, Badge, PageHeader, Banner } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { useProfile } from '@/hooks/useProfile';
import { deriveAge } from '@/lib/date';
import { useTaxData } from './useTaxData';
import { useTaxDeductions } from './deductions/useTaxDeductions';
import { useFootprint } from './footprint/useFootprint';
import { FootprintTab } from './footprint/FootprintTab';
import { ExploreTab } from './explore/ExploreTab';
import { OptimizePillar } from './optimize/OptimizePillar';
import { CalculatorsPillar } from './calculators/CalculatorsPillar';

type TaxTab = 'footprint' | 'explore' | 'optimize' | 'calculators';

/** RN port of apps/web-legacy/src/features/tax/TaxAwarenessPage.tsx. */
export function TaxAwarenessPage() {
  const theme = useThemeColors();
  const { summary } = useTaxData();
  const deductions = useTaxDeductions(summary);
  const { profile } = useProfile();
  const footprintData = useFootprint(summary, deductions, profile);
  const [activeTab, setActiveTab] = useState<TaxTab>('footprint');

  // Personalised, informational tax context from DOB + employment (no computation changes).
  const age = profile?.dob ? deriveAge(profile.dob) : null;
  const taxNotes: string[] = [];
  if (age !== null && age >= 80) {
    taxNotes.push('As a super-senior citizen (80+), your basic exemption is ₹5,00,000 under the old regime.');
  } else if (age !== null && age >= 60) {
    taxNotes.push('As a senior citizen (60+), your basic exemption is ₹3,00,000 under the old regime.');
  }
  if (profile?.employmentType === 'salaried') {
    taxNotes.push('As a salaried taxpayer, a ₹75,000 standard deduction applies under the new regime.');
  } else if (profile?.employmentType === 'self_employed') {
    taxNotes.push('Self-employed: the NPS 80CCD(1B) deduction (up to ₹50,000) is a useful extra tax saver.');
  }

  if (!summary) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-tertiary">
        <PageHeader title="Tax Awareness" leading={<BackButton />} />
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-tertiary">Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { fy } = summary;
  const showNotes = (activeTab === 'footprint' || activeTab === 'optimize') && taxNotes.length > 0;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-tertiary">
      <PageHeader title="Tax Awareness" leading={<BackButton />}>
        <View className="flex-row items-center gap-2 mt-0.5">
          <Text className="text-xs text-secondary">{fy.label}</Text>
          <Text style={{ color: theme.borderStrong }}>·</Text>
          <Text className="text-xs text-secondary">{fy.daysLeft} days left in FY</Text>
          {fy.isQ4 && <Badge label="Q4 — invest now" color={theme.warning} size="sm" />}
        </View>
      </PageHeader>

      {/* Tabs — four pillars */}
      <TabStrip
        options={[
          { value: 'footprint', label: 'Footprint', icon: 'ti-receipt-tax' },
          { value: 'explore', label: 'Explore', icon: 'ti-scan' },
          { value: 'optimize', label: 'Optimize', icon: 'ti-bulb' },
          { value: 'calculators', label: 'Calc', icon: 'ti-calculator' }
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      <ScrollView>
        <View className="px-4 py-4 gap-4">
          {showNotes && (
            <Banner variant="info">
              {taxNotes.map((note, i) => (
                <Text key={note}>
                  {i > 0 ? '\n' : ''}
                  {note}
                </Text>
              ))}
            </Banner>
          )}
          {activeTab === 'footprint' && <FootprintTab data={footprintData} />}
          {activeTab === 'explore' && <ExploreTab />}
          {activeTab === 'optimize' && (
            <OptimizePillar
              summary={summary}
              deductions={deductions}
              profile={profile}
              gross={footprintData.waterfall.gross}
            />
          )}
          {activeTab === 'calculators' && <CalculatorsPillar summary={summary} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
