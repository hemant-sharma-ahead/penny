import { Card, TextInput, Button, SegmentedControl, AmountInput } from '@/components/ui';
import { formatCurrency, parseNumber } from '@/lib/formatters';
import { useSipCalculator } from './useSipCalculator';

const SIP_RETURN_OPTIONS = [
  { value: '7', label: '7% Conservative' },
  { value: '11', label: '11% Moderate' },
  { value: '14', label: '14% Aggressive' }
];

export function SipCalculatorTab() {
  const sip = useSipCalculator();

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Info box */}
        <div className="rounded-xl p-3 flex gap-2 bg-surface-2 border border-theme">
          <i
            className="ti ti-calculator flex-shrink-0 mt-0.5"
            style={{ fontSize: 18, color: 'var(--color-primary)' }}
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-secondary">
            Enter your goal details to find the monthly SIP amount needed to reach your target, accounting for any
            savings already set aside.
          </p>
        </div>

        <Card className="flex flex-col gap-3">
          <AmountInput label="Goal amount" value={sip.target} onChange={sip.setTarget} placeholder="e.g. 1000000" />
          <AmountInput label="Already saved" value={sip.saved} onChange={sip.setSaved} placeholder="0" />
          <TextInput
            label="Time horizon (years)"
            value={sip.years}
            onChange={sip.setYears}
            type="number"
            inputMode="decimal"
            placeholder="e.g. 5"
          />
          <div>
            <label className="text-xs font-medium text-secondary">Expected return (% per year)</label>
            <div className="mt-1">
              <SegmentedControl options={SIP_RETURN_OPTIONS} value={sip.annualReturn} onChange={sip.setAnnualReturn} />
            </div>
          </div>
          <Button variant="primary" fullWidth onClick={sip.calculate}>
            Calculate
          </Button>
        </Card>

        {sip.result !== null && (
          <Card className="text-center">
            <p className="text-xs mb-1 text-secondary">Required monthly SIP</p>
            <p className="text-3xl font-semibold text-primary">{formatCurrency(Math.ceil(sip.result))}</p>
            <p className="text-xs mt-1 text-tertiary">
              per month for {sip.years} year{sip.years === '1' ? '' : 's'} at {sip.annualReturn}% p.a.
            </p>
            {parseNumber(sip.saved) > 0 && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-primary)' }}>
                Existing savings of {formatCurrency(parseNumber(sip.saved))} factored in.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
