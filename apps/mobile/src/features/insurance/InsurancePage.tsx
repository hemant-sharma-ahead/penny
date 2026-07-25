import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import type { InsurancePolicy } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { Button, Banner, PageHeader, EmptyState } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { useInsurance } from './useInsurance';
import { PolicyCard } from './PolicyCard';
import { CoverageSummary } from './CoverageSummary';
import { PolicyForm } from './PolicyForm';

/**
 * RN port note: web's back button (`navigate(-1)`) is dropped for now — this screen is currently reached
 * as `AuthGuard`'s temporary stand-in (no `Stack.Navigator`, so no real "back" destination exists yet).
 * Every sub-page module ported before real navigation lands will make the same call; revisit once
 * onboarding + tab navigation are real. See docs/plans/mobile-migration.md's Track 4 progress log.
 */
export function InsurancePage() {
  const insets = useSafeAreaInsets();
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.insurance);
  const { policies, savePolicy, removePolicy, totalAnnualPremium, expiringCount, sorted } = useInsurance();

  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<InsurancePolicy | null>(null);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-tertiary">
      <PageHeader
        leading={<BackButton />}
        title="Insurance"
        subtitle={
          policies.length > 0
            ? `${policies.length} ${policies.length === 1 ? 'policy' : 'policies'} · ${masked ? '••••' : formatCurrency(totalAnnualPremium)}/yr`
            : undefined
        }
      />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        {policies.length === 0 ? (
          <EmptyState icon="ti-shield" title="No policies yet" description="Tap + to add your first policy." />
        ) : (
          <View className="px-4 py-4 gap-3">
            {expiringCount > 0 && (
              <Banner variant="warning">
                {expiringCount} {expiringCount === 1 ? 'policy renews' : 'policies renew'} within 30 days. Review and
                renew to avoid a coverage gap.
              </Banner>
            )}

            {sorted.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} masked={masked} onEdit={setEditingPolicy} />
            ))}

            <CoverageSummary policies={policies} totalAnnualPremium={totalAnnualPremium} masked={masked} />
          </View>
        )}
      </ScrollView>

      <View className="absolute right-4" style={{ bottom: insets.bottom + 16 }}>
        <Button
          variant="primary"
          icon="ti-plus"
          accessibilityLabel="Add policy"
          className="w-14 h-14 rounded-full shadow-lg"
          onPress={() => {
            setEditingPolicy(null);
            setShowForm(true);
          }}
        />
      </View>

      {(showForm || editingPolicy) && (
        <PolicyForm
          editing={editingPolicy}
          onSave={async (policy) => {
            await savePolicy(policy);
            setShowForm(false);
            setEditingPolicy(null);
          }}
          onDelete={async (id) => {
            await removePolicy(id);
            setShowForm(false);
            setEditingPolicy(null);
          }}
          onClose={() => {
            setShowForm(false);
            setEditingPolicy(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}
