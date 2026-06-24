import { useMemo, useState } from 'react';
import { compareTaxRegimes, TAX_FY_LABEL, type RegimeBreakdown } from '@/core/calculators/taxRegime';
import { MaskedValue } from '@/components/privacy/MaskedValue';
import { formatCurrency } from '@/lib/formatters';
import { LabeledInput, SegmentedToggle, ResultCard, AmountRow } from './CalcUI';

function RegimeColumn({ name, data, winner }: { name: string; data: RegimeBreakdown; winner: boolean }) {
  return (
    <div
      className="rounded-2xl p-3 border"
      style={{
        borderColor: winner ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: winner ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent'
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-primary">{name}</p>
        {winner && (
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          >
            LOWER
          </span>
        )}
      </div>
      <MaskedValue value={formatCurrency(data.totalTax)} className="text-lg font-semibold text-primary" />
      <p className="text-[10px] text-tertiary mt-0.5">total tax</p>
    </div>
  );
}

export function TaxRegimeCalculator() {
  const [gross, setGross] = useState('');
  const [salaried, setSalaried] = useState<'yes' | 'no'>('yes');
  const [d80c, setD80c] = useState('');
  const [d80d, setD80d] = useState('');
  const [homeLoan, setHomeLoan] = useState('');
  const [nps, setNps] = useState('');
  const [hra, setHra] = useState('');
  const [other, setOther] = useState('');

  const result = useMemo(() => {
    const g = parseFloat(gross);
    if (!(g > 0)) return null;
    return compareTaxRegimes({
      grossIncome: g,
      isSalaried: salaried === 'yes',
      deduction80C: parseFloat(d80c) || 0,
      deduction80D: parseFloat(d80d) || 0,
      homeLoanInterest: parseFloat(homeLoan) || 0,
      nps80ccd1b: parseFloat(nps) || 0,
      hraExemption: parseFloat(hra) || 0,
      otherDeductions: parseFloat(other) || 0
    });
  }, [gross, salaried, d80c, d80d, homeLoan, nps, hra, other]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-tertiary -mb-1">{TAX_FY_LABEL} · individuals below 60</p>

      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <LabeledInput
          label="Gross annual income"
          value={gross}
          onChange={setGross}
          prefix="₹"
          placeholder="e.g. 15,00,000"
        />
        <SegmentedToggle
          label="Salaried?"
          value={salaried}
          onChange={setSalaried}
          options={[
            { value: 'yes', label: 'Yes (std. deduction)' },
            { value: 'no', label: 'No' }
          ]}
        />

        <div className="pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary mb-3">Old-regime deductions</p>
          <div className="flex flex-col gap-4">
            <LabeledInput label="80C (max ₹1.5L)" value={d80c} onChange={setD80c} prefix="₹" placeholder="0" />
            <LabeledInput label="80D — health insurance" value={d80d} onChange={setD80d} prefix="₹" placeholder="0" />
            <LabeledInput
              label="24B — home loan interest (max ₹2L)"
              value={homeLoan}
              onChange={setHomeLoan}
              prefix="₹"
              placeholder="0"
            />
            <LabeledInput label="80CCD(1B) — NPS (max ₹50K)" value={nps} onChange={setNps} prefix="₹" placeholder="0" />
            <LabeledInput label="HRA exemption" value={hra} onChange={setHra} prefix="₹" placeholder="0" />
            <LabeledInput label="Other deductions" value={other} onChange={setOther} prefix="₹" placeholder="0" />
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <RegimeColumn name="Old Regime" data={result.old} winner={result.recommended === 'old'} />
            <RegimeColumn name="New Regime" data={result.new} winner={result.recommended === 'new'} />
          </div>

          <div
            className="rounded-2xl p-4 text-center"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}
          >
            <p className="text-xs text-secondary mb-1">
              {result.recommended === 'new' ? 'New regime' : 'Old regime'} saves you
            </p>
            <MaskedValue value={formatCurrency(result.savings)} className="text-2xl font-semibold text-primary" />
            <p className="text-[11px] text-tertiary mt-1">per year</p>
          </div>

          <ResultCard title="Old regime breakdown">
            <AmountRow label="Standard deduction" amount={result.old.standardDeduction} />
            <AmountRow label="Other deductions" amount={result.old.otherDeductions} />
            <AmountRow label="Taxable income" amount={result.old.taxableIncome} />
            <AmountRow label="Tax before rebate" amount={result.old.taxBeforeRebate} />
            {result.old.rebate > 0 && <AmountRow label="§87A rebate" amount={result.old.rebate} saving />}
            {result.old.surcharge > 0 && <AmountRow label="Surcharge" amount={result.old.surcharge} />}
            <AmountRow label="Cess (4%)" amount={result.old.cess} />
            <AmountRow label="Total tax" amount={result.old.totalTax} accent />
          </ResultCard>

          <ResultCard title="New regime breakdown">
            <AmountRow label="Standard deduction" amount={result.new.standardDeduction} />
            <AmountRow label="Taxable income" amount={result.new.taxableIncome} />
            <AmountRow label="Tax before rebate" amount={result.new.taxBeforeRebate} />
            {result.new.rebate > 0 && <AmountRow label="§87A rebate" amount={result.new.rebate} saving />}
            {result.new.surcharge > 0 && <AmountRow label="Surcharge" amount={result.new.surcharge} />}
            <AmountRow label="Cess (4%)" amount={result.new.cess} />
            <AmountRow label="Total tax" amount={result.new.totalTax} accent />
          </ResultCard>

          <p className="text-[10px] text-tertiary leading-relaxed">
            Estimate for planning only. Excludes marginal relief on surcharge, special-rate incomes, and other edge
            cases. Verify with a tax professional before filing.
          </p>
        </>
      )}
    </div>
  );
}
