import { useState } from 'react';
import { TabStrip, Badge, PageHeader } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
import { useTaxData } from './useTaxData';
import { useTaxDeductions } from './deductions/useTaxDeductions';
import { DeductionsTab } from './deductions/DeductionsTab';
import { CapitalGainsTab } from './gains/CapitalGainsTab';

export function TaxAwarenessPage() {
  const { summary } = useTaxData();
  const deductions = useTaxDeductions(summary);
  const [activeTab, setActiveTab] = useState<'deductions' | 'gains'>('deductions');

  if (!summary) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Tax Awareness" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-tertiary">Loading…</p>
        </div>
      </div>
    );
  }

  const { fy } = summary;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Tax Awareness">
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-secondary">{fy.label}</span>
          <span style={{ color: 'var(--color-border-strong)' }}>·</span>
          <span className="text-xs text-secondary">{fy.daysLeft} days left in FY</span>
          {fy.isQ4 && <Badge label="Q4 — invest now" color={STATUS.warning} size="sm" />}
        </div>
      </PageHeader>

      {/* Tabs */}
      <TabStrip
        options={[
          { value: 'deductions', label: 'Deductions' },
          { value: 'gains', label: 'Capital Gains' }
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 flex flex-col gap-4">
        {activeTab === 'deductions' && <DeductionsTab summary={summary} deductions={deductions} />}
        {activeTab === 'gains' && <CapitalGainsTab summary={summary} />}
      </div>
    </div>
  );
}
