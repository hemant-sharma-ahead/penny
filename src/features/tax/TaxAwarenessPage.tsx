import { useState } from 'react';
import { TabStrip, Badge, PageHeader, Banner } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
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

export function TaxAwarenessPage() {
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
      <div className="flex flex-col h-full">
        <PageHeader title="Tax Awareness" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-tertiary">Loading…</p>
        </div>
      </div>
    );
  }

  const { fy } = summary;
  const showNotes = (activeTab === 'footprint' || activeTab === 'optimize') && taxNotes.length > 0;

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

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 flex flex-col gap-4">
        {showNotes && (
          <Banner variant="info">
            <ul className="flex flex-col gap-1">
              {taxNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
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
      </div>
    </div>
  );
}
