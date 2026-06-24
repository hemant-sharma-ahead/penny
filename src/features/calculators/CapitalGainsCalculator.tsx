import { useMemo, useState } from 'react';
import { calcCapitalGains, type CapitalAsset } from '@/core/calculators/capitalGains';
import { formatPercent } from '@/lib/formatters';
import { LabeledInput, SegmentedToggle, ResultCard, ResultRow, AmountRow, HeroResult } from './CalcUI';

const ASSET_OPTIONS: { value: CapitalAsset; label: string }[] = [
  { value: 'equity', label: 'Equity' },
  { value: 'debt', label: 'Debt' },
  { value: 'gold', label: 'Gold' },
  { value: 'property', label: 'Property' }
];

export function CapitalGainsCalculator() {
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
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
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
      </div>

      {result && (
        <>
          <HeroResult
            label={isLoss ? 'Capital loss' : 'Tax payable'}
            amount={isLoss ? result.gain : result.tax}
            note={isLoss ? 'No tax on a loss' : `${result.isLongTerm ? 'Long-term' : 'Short-term'} capital gain`}
          />

          {/* Classification banner */}
          <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{
              backgroundColor: result.isLongTerm ? '#10b9811a' : '#f59e0b1a',
              border: `1px solid ${result.isLongTerm ? '#10b981' : '#f59e0b'}`
            }}
          >
            <i
              className={`ti ${result.isLongTerm ? 'ti-clock-check' : 'ti-clock-bolt'}`}
              style={{ fontSize: 20, color: result.isLongTerm ? '#10b981' : '#f59e0b' }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: result.isLongTerm ? '#10b981' : '#f59e0b' }}>
                {result.isLongTerm ? 'Long-term capital gain (LTCG)' : 'Short-term capital gain (STCG)'}
              </p>
              <p className="text-xs text-secondary mt-0.5">
                {asset === 'debt'
                  ? 'Debt gains are taxed at your slab rate regardless of holding period.'
                  : `Long-term needs ${result.ltThresholdMonths} months held for this asset.`}
              </p>
            </div>
          </div>

          <ResultCard title="Computation">
            <AmountRow label="Total gain" amount={result.gain} accent />
            {result.exemptionApplied > 0 && (
              <AmountRow label="LTCG exemption (₹1.25L)" amount={result.exemptionApplied} saving />
            )}
            <AmountRow label="Taxable gain" amount={result.taxableGain} />
            <ResultRow
              label={result.isSlabRate ? 'Rate (your slab)' : 'Rate'}
              value={formatPercent(result.appliedRatePct)}
            />
            <AmountRow label="Tax (before cess)" amount={result.baseTax} />
            <AmountRow label="Health & education cess (4%)" amount={result.cess} />
            <AmountRow label="Total tax" amount={result.tax} accent />
            <AmountRow label="Net gain after tax" amount={result.netGain} saving />
          </ResultCard>
        </>
      )}
    </div>
  );
}
