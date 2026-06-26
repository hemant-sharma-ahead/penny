import { useState } from 'react';
import { SegmentedControl } from '@/components/ui';
import type { Profile } from '@/core/db/types';
import type { TaxSummary } from '@/core/tax/calculator';
import { OptimizeTab } from './OptimizeTab';
import { DeductionsTab } from '../deductions/DeductionsTab';
import type { useTaxDeductions } from '../deductions/useTaxDeductions';

interface Props {
  summary: TaxSummary;
  deductions: ReturnType<typeof useTaxDeductions>;
  profile: Profile | null;
  gross: number;
}

/** "Optimize" pillar — tax-saving suggestions + the detailed deductions tracker. */
export function OptimizePillar({ summary, deductions, profile, gross }: Props) {
  const [sub, setSub] = useState<'suggestions' | 'deductions'>('suggestions');
  return (
    <>
      <SegmentedControl
        options={[
          { value: 'suggestions', label: 'Suggestions' },
          { value: 'deductions', label: 'Deductions' }
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'suggestions' ? (
        <OptimizeTab summary={summary} deductions={deductions} profile={profile} gross={gross} />
      ) : (
        <DeductionsTab summary={summary} deductions={deductions} />
      )}
    </>
  );
}
