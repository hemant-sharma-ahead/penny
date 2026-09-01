import { useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { formatCurrency } from '@/lib/formatters';
import { Button, Banner, PageHeader, EmptyState } from '~/components/ui';
import { useInsurance } from './useInsurance';
import { PolicyCard } from './PolicyCard';
import { CoverageSummary } from './CoverageSummary';
import { PolicyForm } from './PolicyForm';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useThemeColors } from '~/theme/useThemeColors';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';

export function InsurancePage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.insurance);
  const {
    policies,
    savePolicy,
    removePolicy,
    totalAnnualPremium,
    expiringCount,
    sorted,
    reload,
    insurerMemories,
    rememberInsurer,
    markAsPaid,
    unmarkPayment,
    candidateExpenses
  } = useInsurance();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  useDefaultHeaderBack('Insurance');

  const [showForm, setShowForm] = useState(false);
  // An id, never the policy object itself — re-resolved live from `policies` below on every render, so
  // a "Mark as paid"/un-mark applied while this form stays open (a stacked child action mutating the
  // very policy the form was opened with) is never displayed stale. Same "never snapshot" rule the EPF
  // employer-detail-modal incident established (docs/ARCHITECTURE.md's decision log).
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const editingPolicy = editingPolicyId ? (policies.find((p) => p.id === editingPolicyId) ?? null) : null;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        subtitle={
          policies.length > 0
            ? `${policies.length} ${policies.length === 1 ? 'policy' : 'policies'} · ${masked ? '••••' : formatCurrency(totalAnnualPremium)}/yr`
            : undefined
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
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
              <PolicyCard key={policy.id} policy={policy} masked={masked} onEdit={(p) => setEditingPolicyId(p.id)} />
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
            setEditingPolicyId(null);
            setShowForm(true);
          }}
        />
      </View>

      {(showForm || editingPolicyId) && (
        <PolicyForm
          editing={editingPolicy}
          insurerMemories={insurerMemories}
          rememberInsurer={rememberInsurer}
          markAsPaid={markAsPaid}
          unmarkPayment={unmarkPayment}
          candidateExpenses={candidateExpenses}
          onSave={async (policy) => {
            await savePolicy(policy);
            setShowForm(false);
            setEditingPolicyId(null);
          }}
          onDelete={async (id) => {
            await removePolicy(id);
            setShowForm(false);
            setEditingPolicyId(null);
          }}
          onClose={() => {
            setShowForm(false);
            setEditingPolicyId(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}
