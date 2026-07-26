import { useMemo, useState } from 'react';
import { Card, AmountInput, SegmentedControl, Banner, SectionLabel } from '@/components/ui';
import { formatCurrency, formatPercent, parseNumber } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';
import { TAX_SCENARIOS, type TaxScenario } from '@/core/tax/taxScenarios';
import { RatesTab } from '../rates/RatesTab';
import { DidYouKnow } from '../DidYouKnow';

const FALLBACK_SCENARIO = TAX_SCENARIOS[0] as TaxScenario;

export function ExploreTab() {
  const [scenarioId, setScenarioId] = useState(FALLBACK_SCENARIO.id);
  const scenario = TAX_SCENARIOS.find((s) => s.id === scenarioId) ?? FALLBACK_SCENARIO;
  const [amount, setAmount] = useState(String(scenario.defaultAmount));
  const [variant, setVariant] = useState(scenario.defaultVariant ?? '');

  const selectScenario = (id: string) => {
    const next = TAX_SCENARIOS.find((s) => s.id === id);
    if (!next) return;
    setScenarioId(id);
    setAmount(String(next.defaultAmount));
    setVariant(next.defaultVariant ?? '');
  };

  const value = parseNumber(amount);
  const r = useMemo(() => scenario.compute(value, variant || undefined), [scenario, value, variant]);

  return (
    <>
      <Banner variant="info" icon="ti-scan">
        Tax X-ray — pick a money move and see every tax &amp; charge hidden inside it. Tweak the amount to match yours.
      </Banner>

      {/* Scenario chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {TAX_SCENARIOS.map((s) => {
          const active = s.id === scenarioId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => selectScenario(s.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                active ? 'text-white' : 'surface text-secondary'
              }`}
              style={
                active ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : undefined
              }
            >
              <i className={`ti ${s.icon}`} style={{ fontSize: 15 }} aria-hidden="true" />
              {s.title}
            </button>
          );
        })}
      </div>

      <Card className="flex flex-col gap-3">
        <p className="text-xs text-secondary">{scenario.blurb}</p>
        <AmountInput label={scenario.amountLabel} value={amount} onChange={setAmount} showWords={false} />
        {scenario.variants && (
          <SegmentedControl
            options={scenario.variants.map((v) => ({ value: v.key, label: v.label }))}
            value={variant}
            onChange={setVariant}
          />
        )}

        {value > 0 && (
          <>
            <div className="flex flex-col gap-1 pt-1">
              {r.lines.map((line) => (
                <div
                  key={line.label}
                  className="flex items-start justify-between gap-3 py-1 border-b border-theme last:border-0"
                >
                  <div className="flex flex-col min-w-0">
                    <span className={`text-xs ${line.isCharge ? 'text-tertiary' : 'text-secondary'}`}>
                      {line.label}
                      {line.isCharge && <span className="text-[10px]"> · charge, not tax</span>}
                    </span>
                    {line.note && <span className="text-[10px] text-tertiary">{line.note}</span>}
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-primary whitespace-nowrap">
                    {formatCurrency(Math.round(line.amount))}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-xl p-3 bg-surface-2 border border-theme">
              <div className="flex flex-col">
                <span className="text-[11px] text-secondary">Government tax / levy</span>
                <span className="text-[10px] text-tertiary">{formatPercent(r.effectivePct)} of the amount</span>
              </div>
              <span className="text-lg font-bold tabular-nums" style={{ color: STATUS.danger }}>
                {formatCurrency(Math.round(r.totalTax))}
              </span>
            </div>

            <Banner variant="warning" icon="ti-bulb">
              {r.takeaway}
            </Banner>
          </>
        )}
      </Card>

      <DidYouKnow />

      <div className="pt-2">
        <SectionLabel className="">Rate reference</SectionLabel>
      </div>
      <RatesTab />
    </>
  );
}
