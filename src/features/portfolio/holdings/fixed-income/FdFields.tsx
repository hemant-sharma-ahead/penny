import { TextInput, SelectInput, SegmentedControl } from '@/components/ui';
import type { CompoundingFreq, FdResult, RdResult } from '@/core/fd/fdCalculations';

interface FdFieldsProps {
  editing: boolean;
  fdSubType: 'fd' | 'rd';
  setFdSubType: (v: 'fd' | 'rd') => void;
  fdBank: string;
  setFdBank: (v: string) => void;
  fdStartDate: string;
  setFdStartDate: (v: string) => void;
  interestRate: string;
  setInterestRate: (v: string) => void;
  investedAmount: string;
  setInvestedAmount: (v: string) => void;
  fdCompoundingFreq: CompoundingFreq;
  setFdCompoundingFreq: (v: CompoundingFreq) => void;
  maturityDate: string;
  setMaturityDate: (v: string) => void;
  rdTenureMonths: string;
  setRdTenureMonths: (v: string) => void;
  fdPreview: FdResult | RdResult | null;
}

// Fixed Deposit / Recurring Deposit fields with a live maturity projection.
// The deposit sub-type is locked while editing an existing holding.
export function FdFields({
  editing,
  fdSubType,
  setFdSubType,
  fdBank,
  setFdBank,
  fdStartDate,
  setFdStartDate,
  interestRate,
  setInterestRate,
  investedAmount,
  setInvestedAmount,
  fdCompoundingFreq,
  setFdCompoundingFreq,
  maturityDate,
  setMaturityDate,
  rdTenureMonths,
  setRdTenureMonths,
  fdPreview
}: FdFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* FD / RD toggle */}
      <div>
        <label className="text-xs font-medium text-secondary">Type</label>
        <div className="mt-1">
          <SegmentedControl
            options={[
              { value: 'fd', label: 'Fixed Deposit' },
              { value: 'rd', label: 'Recurring Deposit' }
            ]}
            value={fdSubType}
            onChange={(v) => {
              if (!editing) setFdSubType(v as 'fd' | 'rd');
            }}
          />
        </div>
      </div>

      {/* Bank */}
      <TextInput
        label="Bank / Institution"
        hint="optional"
        placeholder="e.g. SBI, HDFC, Post Office"
        value={fdBank}
        onChange={setFdBank}
      />

      {/* Start date + interest rate */}
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label={fdSubType === 'rd' ? 'First installment date' : 'Deposit date'}
          type="date"
          value={fdStartDate}
          onChange={setFdStartDate}
        />
        <TextInput
          label="Interest rate (%)"
          type="number"
          inputMode="decimal"
          placeholder="7.1"
          value={interestRate}
          onChange={setInterestRate}
        />
      </div>

      {fdSubType === 'fd' ? (
        /* FD-specific */
        <>
          <TextInput
            label="Principal amount (₹)"
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={investedAmount}
            onChange={setInvestedAmount}
          />
          <div className="grid grid-cols-2 gap-3">
            <SelectInput
              label="Compounding"
              value={fdCompoundingFreq}
              onChange={(v) => setFdCompoundingFreq(v as CompoundingFreq)}
              options={[
                { value: 'quarterly', label: 'Quarterly (default)' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'half-yearly', label: 'Half-yearly' },
                { value: 'yearly', label: 'Yearly' },
                { value: 'at_maturity', label: 'At maturity' }
              ]}
            />
            <TextInput label="Maturity date" type="date" value={maturityDate} onChange={setMaturityDate} />
          </div>
        </>
      ) : (
        /* RD-specific */
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="Monthly installment (₹)"
            type="number"
            inputMode="decimal"
            placeholder="5000"
            value={investedAmount}
            onChange={setInvestedAmount}
          />
          <TextInput
            label="Tenure (months)"
            type="number"
            inputMode="numeric"
            placeholder="24"
            value={rdTenureMonths}
            onChange={setRdTenureMonths}
          />
        </div>
      )}

      {/* Live preview */}
      {fdPreview && (
        <div
          className="rounded-xl p-3 flex flex-col gap-1 border border-theme"
          style={{ backgroundColor: 'var(--color-surface-secondary)' }}
        >
          {fdSubType === 'fd' ? (
            <>
              <p className="text-[11px] text-tertiary">Projected maturity amount</p>
              <p className="text-base font-bold text-primary">₹{fdPreview.maturityAmount.toLocaleString('en-IN')}</p>
              <p className="text-[11px]" style={{ color: '#10b981' }}>
                +₹{fdPreview.totalInterest.toLocaleString('en-IN')} interest (
                {(
                  ((fdPreview.maturityAmount - (parseFloat(investedAmount) || 0)) / (parseFloat(investedAmount) || 1)) *
                  100
                ).toFixed(1)}
                %)
              </p>
              {'daysRemaining' in fdPreview && fdPreview.daysRemaining > 0 && (
                <p className="text-[10px] text-tertiary">{fdPreview.daysRemaining} days remaining</p>
              )}
            </>
          ) : (
            <>
              <p className="text-[11px] text-tertiary">Projected maturity amount</p>
              <p className="text-base font-bold text-primary">₹{fdPreview.maturityAmount.toLocaleString('en-IN')}</p>
              <p className="text-[11px]" style={{ color: '#10b981' }}>
                +₹{fdPreview.totalInterest.toLocaleString('en-IN')} interest over {rdTenureMonths} months
              </p>
              <p className="text-[10px] text-tertiary">
                Total committed: ₹
                {((parseFloat(investedAmount) || 0) * (parseInt(rdTenureMonths, 10) || 0)).toLocaleString('en-IN')}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
