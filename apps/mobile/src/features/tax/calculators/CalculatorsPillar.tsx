import { useState } from 'react';
import { SegmentedControl } from '~/components/ui';
import type { TaxSummary } from '@/core/tax/calculator';
import { CapitalGainsTab } from '../gains/CapitalGainsTab';
import { TaxRegimeCalculator } from '~/features/calculators/TaxRegimeCalculator';
import { HraCalculator } from '~/features/calculators/HraCalculator';

/** RN port of apps/web-react/src/features/tax/calculators/CalculatorsPillar.tsx — "Calculators"
 *  pillar, the tax tools in one place. */
export function CalculatorsPillar({ summary }: { summary: TaxSummary }) {
  const [sub, setSub] = useState<'regime' | 'hra' | 'gains'>('regime');
  return (
    <>
      <SegmentedControl
        options={[
          { value: 'regime', label: 'Regime' },
          { value: 'hra', label: 'HRA' },
          { value: 'gains', label: 'Capital Gains' }
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'regime' && <TaxRegimeCalculator />}
      {sub === 'hra' && <HraCalculator />}
      {sub === 'gains' && <CapitalGainsTab summary={summary} />}
    </>
  );
}
