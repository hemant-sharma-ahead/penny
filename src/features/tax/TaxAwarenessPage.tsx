import { useState } from 'react';
import { TabStrip } from '@/components/ui';
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
        <div className="px-4 pt-4 pb-3 border-b border-theme">
          <h2 className="text-xl font-semibold text-primary">Tax Awareness</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-tertiary">Loading…</p>
        </div>
      </div>
    );
  }

  const { fy } = summary;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <h2 className="text-xl font-semibold text-primary">Tax Awareness</h2>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-secondary">{fy.label}</span>
          <span style={{ color: 'var(--color-border-strong)' }}>·</span>
          <span className="text-xs text-secondary">{fy.daysLeft} days left in FY</span>
          {fy.isQ4 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              Q4 — invest now
            </span>
          )}
        </div>
      </div>

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
