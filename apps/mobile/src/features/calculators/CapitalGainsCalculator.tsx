import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { calcCapitalGains, type CapitalAsset } from '@/core/calculators/capitalGains';
import { formatPercent } from '@/lib/formatters';
import { Banner } from '~/components/ui';
import { usePrivacy } from '~/context/PrivacyContext';
import { LabeledInput, SegmentedToggle, ResultCard, ResultRow, AmountRow, HeroResult } from './CalcUI';

const ASSET_OPTIONS: { value: CapitalAsset; label: string }[] = [
  { value: 'equity', label: 'Equity' },
  { value: 'debt', label: 'Debt' },
  { value: 'gold', label: 'Gold' },
  { value: 'property', label: 'Property' }
];

/** RN port of apps/web-react/src/features/calculators/CapitalGainsCalculator.tsx. */
export function CapitalGainsCalculator() {
  // Calculator output (salary/income-derived figures) is always-sensitive in Safe mode, matching web's
  // MaskedValue (masks whenever mode is 'safe' or 'privacy', regardless of any per-field flag) — pass
  // `true`, not `false`; `shouldMask(false)` would leave Safe mode fully unmasked here.
  const masked = usePrivacy().shouldMask(true);
  const [asset, setAsset] = useState<CapitalAsset>('equity');
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [years, setYears] = useState('2');
  const [slab, setSlab] = useState('30');

  // Equity LTCG/STCG never uses the slab rate; the others may.
  const showSlab = asset !== 'equity';

  const result = useMemo(() => {
    const b = parseFloat(buy);
    const s = parseFloat(sell);
    const y = parseFloat(years);
    if (!(b > 0) || !(s >= 0) || !(y >= 0)) return null;
    return calcCapitalGains({
      asset,
      buyValue: b,
      sellValue: s,
      holdingMonths: Math.round(y * 12),
      slabRatePct: parseFloat(slab) || 0
    });
  }, [asset, buy, sell, years, slab]);

  const isLoss = result ? result.gain < 0 : false;

  return (
    <View className="gap-4">
      <View className="rounded-2xl p-4 gap-4 bg-surface border border-theme">
        <SegmentedToggle label="Asset type" value={asset} onChange={setAsset} options={ASSET_OPTIONS} />
        <LabeledInput label="Purchase value" value={buy} onChange={setBuy} prefix="₹" placeholder="e.g. 1,00,000" />
        <LabeledInput label="Sale value" value={sell} onChange={setSell} prefix="₹" placeholder="e.g. 1,80,000" />
        <LabeledInput
          label="Holding period"
          hint="years held"
          value={years}
          onChange={setYears}
          suffix="yrs"
          placeholder="2"
        />
        {showSlab && (
          <LabeledInput
            label="Your income tax slab"
            hint="used for short-term / debt"
            value={slab}
            onChange={setSlab}
            suffix="%"
            placeholder="30"
          />
        )}
      </View>

      {result && (
        <>
          <HeroResult
            label={isLoss ? 'Capital loss' : 'Tax payable'}
            amount={isLoss ? result.gain : result.tax}
            note={isLoss ? 'No tax on a loss' : `${result.isLongTerm ? 'Long-term' : 'Short-term'} capital gain`}
            masked={masked}
          />

          {/* Classification banner */}
          <Banner
            variant={result.isLongTerm ? 'success' : 'warning'}
            icon={result.isLongTerm ? 'ti-clock-check' : 'ti-clock-bolt'}
            title={result.isLongTerm ? 'Long-term capital gain (LTCG)' : 'Short-term capital gain (STCG)'}
          >
            {asset === 'debt'
              ? 'Debt gains are taxed at your slab rate regardless of holding period.'
              : `Long-term needs ${result.ltThresholdMonths} months held for this asset.`}
          </Banner>

          <ResultCard title="Computation">
            <AmountRow label="Total gain" amount={result.gain} accent masked={masked} />
            {result.exemptionApplied > 0 && (
              <AmountRow label="LTCG exemption (₹1.25L)" amount={result.exemptionApplied} saving masked={masked} />
            )}
            <AmountRow label="Taxable gain" amount={result.taxableGain} masked={masked} />
            <ResultRow
              label={result.isSlabRate ? 'Rate (your slab)' : 'Rate'}
              value={formatPercent(result.appliedRatePct)}
            />
            <AmountRow label="Tax (before cess)" amount={result.baseTax} masked={masked} />
            <AmountRow label="Health & education cess (4%)" amount={result.cess} masked={masked} />
            <AmountRow label="Total tax" amount={result.tax} accent masked={masked} />
            <AmountRow label="Net gain after tax" amount={result.netGain} saving masked={masked} />
          </ResultCard>
        </>
      )}
    </View>
  );
}
