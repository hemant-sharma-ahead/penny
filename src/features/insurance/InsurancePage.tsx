import { useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import type { InsurancePolicy } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { Button, Banner, PageHeader } from '@/components/ui';
import { useInsurance } from './useInsurance';
import { PolicyCard } from './PolicyCard';
import { CoverageSummary } from './CoverageSummary';
import { PolicyForm } from './PolicyForm';

export function InsurancePage() {
  const { mode } = usePrivacy();
  const { policies, savePolicy, removePolicy, totalAnnualPremium, expiringCount, sorted } = useInsurance();

  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<InsurancePolicy | null>(null);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Insurance"
        subtitle={
          policies.length > 0
            ? `${policies.length} ${policies.length === 1 ? 'policy' : 'policies'} · ${mode === 'open' ? formatCurrency(totalAnnualPremium) : '••••'}/yr`
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto pb-24">
        {policies.length === 0 ? (
          <div className="p-10 text-center">
            <i className="ti ti-shield text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
            <p className="text-sm mt-3 text-tertiary">No policies yet. Tap + to add your first policy.</p>
          </div>
        ) : (
          <div className="px-4 py-4 flex flex-col gap-3">
            {expiringCount > 0 && (
              <Banner variant="warning">
                {expiringCount} {expiringCount === 1 ? 'policy renews' : 'policies renew'} within 30 days. Review and
                renew to avoid a coverage gap.
              </Banner>
            )}

            {sorted.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} mode={mode} onEdit={setEditingPolicy} />
            ))}

            <CoverageSummary policies={policies} totalAnnualPremium={totalAnnualPremium} mode={mode} />
          </div>
        )}
      </div>

      <Button
        variant="primary"
        icon="ti-plus"
        aria-label="Add policy"
        className="fixed w-14 h-14 rounded-full shadow-lg z-10"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', right: '1rem' }}
        onClick={() => {
          setEditingPolicy(null);
          setShowForm(true);
        }}
      />

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
    </div>
  );
}
