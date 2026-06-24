import { Card, Button, TextInput, SelectInput, SegmentedControl, SectionLabel } from '@/components/ui';
import { PlannerResults } from './PlannerResults';
import type { usePlanner } from './usePlanner';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface PlannerTabProps {
  planner: ReturnType<typeof usePlanner>;
  mode: 'open' | 'safe' | 'privacy';
}

export function PlannerTab({ planner, mode }: PlannerTabProps) {
  const p = planner;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-4 flex flex-col gap-5">
        {/* Loan Basics */}
        <div>
          <SectionLabel>Loan Basics</SectionLabel>
          <Card className="flex flex-col gap-3">
            <TextInput
              label="Principal"
              prefix="₹"
              type="number"
              inputMode="decimal"
              value={p.principal}
              onChange={p.setPrincipal}
              placeholder="e.g. 5000000"
            />
            <div className="grid grid-cols-2 gap-3">
              <TextInput
                label="Interest rate"
                suffix="% p.a."
                type="number"
                inputMode="decimal"
                value={p.rate}
                onChange={p.setRate}
                placeholder="8.5"
              />
              <div>
                <p className="text-xs font-medium text-secondary mb-1">Start month</p>
                <div className="flex gap-1">
                  <SelectInput
                    value={String(p.startMonth)}
                    onChange={(v) => p.setStartMonth(Number(v))}
                    options={MONTHS.map((m, i) => ({ label: m, value: String(i) }))}
                  />
                  <SelectInput
                    value={String(p.startYear)}
                    onChange={(v) => p.setStartYear(Number(v))}
                    options={p.yearOptions.map((y) => ({ label: String(y), value: String(y) }))}
                  />
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-secondary mb-1">Tenure</p>
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  suffix="years"
                  type="number"
                  inputMode="numeric"
                  value={p.tenureYrs}
                  onChange={p.setTenureYrs}
                  placeholder="20"
                />
                <TextInput
                  suffix="months"
                  type="number"
                  inputMode="numeric"
                  value={p.tenureMos}
                  onChange={p.setTenureMos}
                  placeholder="0"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Accelerators */}
        <div>
          <SectionLabel>Accelerators</SectionLabel>
          <Card className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <TextInput
                label="EMI step-up"
                suffix="% / year"
                hint="0 = off"
                type="number"
                inputMode="decimal"
                value={p.stepUp}
                onChange={p.setStepUp}
                placeholder="0"
              />
              <TextInput
                label="Extra EMI"
                suffix="/ year"
                hint="0 = off"
                type="number"
                inputMode="decimal"
                value={p.extraEmi}
                onChange={p.setExtraEmi}
                placeholder="0"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-secondary mb-1.5">Prepayment strategy</p>
              <SegmentedControl
                options={[
                  { value: 'reduce_tenure' as const, label: 'Reduce tenure' },
                  { value: 'reduce_emi' as const, label: 'Reduce EMI' }
                ]}
                value={p.strategy}
                onChange={p.setStrategy}
              />
            </div>
          </Card>
        </div>

        {/* Lump Sum Prepayments */}
        <div>
          <SectionLabel>Lump Sum Prepayments</SectionLabel>
          <Card className="flex flex-col gap-3">
            {p.prepayRows.length === 0 && (
              <p className="text-xs text-tertiary text-center py-1">
                No prepayments added. Add one-time lump sum payments below.
              </p>
            )}
            {p.prepayRows.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <TextInput
                    value={r.month}
                    onChange={(v) => p.updatePrepayRow(r.id, 'month', v)}
                    type="number"
                    inputMode="numeric"
                    prefix="Mo."
                    placeholder="e.g. 12"
                  />
                </div>
                <div className="flex-1">
                  <TextInput
                    value={r.amount}
                    onChange={(v) => p.updatePrepayRow(r.id, 'amount', v)}
                    type="number"
                    inputMode="decimal"
                    prefix="₹"
                    placeholder="Amount"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="ti-x"
                  aria-label="Remove prepayment"
                  onClick={() => p.removePrepayRow(r.id)}
                  className="flex-shrink-0"
                />
              </div>
            ))}
            <Button variant="secondary" fullWidth icon="ti-plus" onClick={p.addPrepayRow}>
              Add prepayment
            </Button>
          </Card>
        </div>

        {/* Results */}
        {p.isValid && p.result.rows.length > 0 && <PlannerResults planner={planner} mode={mode} />}

        {!p.isValid && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <i className="ti ti-calculator text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
            <p className="text-sm text-secondary mt-3">Enter principal, rate, and tenure above to see the schedule.</p>
          </div>
        )}

        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
