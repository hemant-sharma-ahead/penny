import { useState } from 'react';
import { Card, StatBox, Banner, SectionLabel, AmountInput, Button, SelectInput } from '@/components/ui';
import { formatCurrency, formatPercent, parseNumber } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';
import { useSettings } from '@/context/SettingsContext';
import { MoneyFlow, WaterfallSteps } from './MoneyFlow';
import { DidYouKnow } from '../DidYouKnow';
import { TaxStoryModal } from '../share/TaxStoryModal';
import { shortFYLabel } from '@/core/tax/fy';
import type { FootprintData } from './useFootprint';

const GROSS_SOURCE_LABEL: Record<FootprintData['grossSource'], string> = {
  override: 'Manual entry',
  transactions: 'Income logged this FY',
  recurring: 'Annualised from recurring income',
  none: 'No income data yet'
};

export function FootprintTab({ data }: { data: FootprintData }) {
  const {
    waterfall: w,
    indirect,
    gainsTax,
    grossSource,
    computedDirectTax,
    directOverridden,
    recommendedRegime
  } = data;
  const {
    taxGrossIncomeOverride,
    taxDirectOverride,
    taxEpfOverride,
    taxStatutoryOverride,
    setTaxGrossIncomeOverride,
    setTaxDirectOverride,
    setTaxEpfOverride,
    setTaxStatutoryOverride
  } = useSettings();

  const [adjusting, setAdjusting] = useState(false);
  const [showBands, setShowBands] = useState(false);
  const [showStory, setShowStory] = useState(false);
  const [grossDraft, setGrossDraft] = useState(taxGrossIncomeOverride !== null ? String(taxGrossIncomeOverride) : '');
  const [directDraft, setDirectDraft] = useState(taxDirectOverride !== null ? String(taxDirectOverride) : '');
  const [epfDraft, setEpfDraft] = useState(taxEpfOverride !== null ? String(taxEpfOverride) : '');
  const [statDraft, setStatDraft] = useState(taxStatutoryOverride !== null ? String(taxStatutoryOverride) : '');

  const draftToValue = (s: string) => (s.trim() === '' ? null : parseNumber(s));
  const applyAdjustments = () => {
    setTaxGrossIncomeOverride(draftToValue(grossDraft));
    setTaxDirectOverride(draftToValue(directDraft));
    setTaxEpfOverride(draftToValue(epfDraft));
    setTaxStatutoryOverride(draftToValue(statDraft));
    setAdjusting(false);
  };
  const resetAdjustments = () => {
    setGrossDraft('');
    setDirectDraft('');
    setEpfDraft('');
    setStatDraft('');
    setTaxGrossIncomeOverride(null);
    setTaxDirectOverride(null);
    setTaxEpfOverride(null);
    setTaxStatutoryOverride(null);
    setAdjusting(false);
  };

  const fySelector = (
    <SelectInput
      value={String(data.fyStartYear)}
      onChange={(v) => data.setFYStartYear(Number(v))}
      options={data.fyOptions.map((o) => ({ value: String(o.startYear), label: o.label }))}
    />
  );

  if (grossSource === 'none' && w.trackedSpend === 0) {
    return (
      <>
        {fySelector}
        <Banner variant="info" icon="ti-receipt-tax">
          Log some income and expenses to see your full tax footprint — how your gross splits into savings, tax, and
          real spending.
        </Banner>
      </>
    );
  }

  const taxOfConsumed = w.directPct + w.indirectPct;

  return (
    <>
      {fySelector}

      {/* Headline */}
      <Card padding="lg" className="flex flex-col gap-3">
        <p className="text-base font-semibold text-primary leading-relaxed">
          Of the <span className="tabular-nums">{formatCurrency(Math.round(w.consumed))}</span> you didn't save,{' '}
          <span className="tabular-nums" style={{ color: STATUS.danger }}>
            {formatCurrency(Math.round(w.directTax + w.indirectTax))}
          </span>{' '}
          ({formatPercent(taxOfConsumed)}) went to tax.
        </p>
        <MoneyFlow waterfall={w} />
        {w.overspent && (
          <p className="text-[11px]" style={{ color: STATUS.warning }}>
            You spent more than your in-hand income this year — the difference came from savings or credit.
          </p>
        )}
        {w.gross > 0 && (
          <button
            type="button"
            onClick={() => setShowStory(true)}
            className="self-start text-xs font-medium flex items-center gap-1"
            style={{ color: STATUS.info }}
          >
            <i className="ti ti-share" style={{ fontSize: 14 }} aria-hidden="true" /> Share my tax story
          </button>
        )}
      </Card>

      <DidYouKnow />

      {showStory && (
        <TaxStoryModal
          onClose={() => setShowStory(false)}
          data={{
            fyLabel: shortFYLabel(data.fyStartYear),
            gross: w.gross,
            consumed: w.consumed,
            totalTax: w.directTax + w.indirectTax,
            directTax: w.directTax,
            indirectTax: w.indirectTax,
            taxPctOfConsumed: w.directPct + w.indirectPct,
            savingsRate: w.savingsRate
          }}
        />
      )}

      {/* Income waterfall */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel className="">Income waterfall</SectionLabel>
          <button
            type="button"
            className="text-xs font-medium"
            style={{ color: STATUS.info }}
            onClick={() => setAdjusting((v) => !v)}
          >
            {adjusting ? 'Cancel' : 'Adjust'}
          </button>
        </div>

        {adjusting ? (
          <div className="flex flex-col gap-3 pt-1">
            <AmountInput
              label="Annual gross income"
              value={grossDraft}
              onChange={setGrossDraft}
              placeholder="Leave blank to use logged income"
              hint={`Auto: ${formatCurrency(Math.round(w.gross))} (${GROSS_SOURCE_LABEL[grossSource]})`}
            />
            <AmountInput
              label="EPF / PF contribution (annual)"
              value={epfDraft}
              onChange={setEpfDraft}
              placeholder="Leave blank for 12% of basic"
              hint={`Auto: ${formatCurrency(Math.round(w.epf))}`}
            />
            <AmountInput
              label="Professional tax + LWF (annual)"
              value={statDraft}
              onChange={setStatDraft}
              placeholder="Leave blank for ₹2,400"
              hint={`Auto: ${formatCurrency(Math.round(w.statutoryLevies))}`}
            />
            <AmountInput
              label="Income tax (correction)"
              value={directDraft}
              onChange={setDirectDraft}
              placeholder="Leave blank to use the estimate"
              hint={`Estimated: ${formatCurrency(Math.round(computedDirectTax))} · ${recommendedRegime === 'new' ? 'New' : 'Old'} regime`}
            />
            <div className="flex gap-2">
              <Button onClick={applyAdjustments} className="flex-1">
                Apply
              </Button>
              <Button variant="ghost" onClick={resetAdjustments}>
                Reset
              </Button>
            </div>
          </div>
        ) : (
          <WaterfallSteps waterfall={w} />
        )}
      </Card>

      {/* Spend → indirect tax */}
      <Card className="flex flex-col gap-3">
        <SectionLabel className="">Spend → indirect tax</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <StatBox size="sm" label="Total spend" value={formatCurrency(Math.round(indirect.totalSpend))} />
          <StatBox
            size="sm"
            tone="warning"
            label="Indirect tax (est.)"
            value={formatCurrency(Math.round(indirect.totalTax))}
            sub={`range ${formatCurrency(Math.round(indirect.totalTaxMin))}–${formatCurrency(Math.round(indirect.totalTaxMax))}`}
          />
          <StatBox size="sm" label="Effective rate" value={formatPercent(indirect.effectiveRatePct)} sub="of spend" />
        </div>

        {indirect.byRegime.filter((r) => r.tax > 0).length > 0 && (
          <div className="flex flex-col gap-1.5">
            {indirect.byRegime
              .filter((r) => r.tax > 0)
              .map((r) => (
                <div key={r.regime} className="flex items-center justify-between text-xs">
                  <span className="text-secondary">{r.label}</span>
                  <span className="tabular-nums font-medium text-primary">{formatCurrency(Math.round(r.tax))}</span>
                </div>
              ))}
          </div>
        )}

        {indirect.byBand.some((b) => b.tax > 0) && (
          <>
            <button
              type="button"
              className="text-xs font-medium self-start"
              style={{ color: STATUS.info }}
              onClick={() => setShowBands((v) => !v)}
            >
              {showBands ? 'Hide detail' : 'Show by rate band'}
            </button>
            {showBands && (
              <div className="flex flex-col gap-1 rounded-xl bg-surface-2 border border-theme p-2.5">
                {indirect.byBand
                  .filter((b) => b.tax > 0)
                  .map((b) => (
                    <div key={b.bandId} className="flex items-center justify-between text-[11px]">
                      <span className="text-secondary">
                        {b.label} · {b.count} txn{b.count === 1 ? '' : 's'}
                      </span>
                      <span className="tabular-nums text-primary">{formatCurrency(Math.round(b.tax))}</span>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Invest */}
      {gainsTax > 0 && (
        <Card className="flex flex-col gap-3">
          <SectionLabel className="">Invest</SectionLabel>
          <StatBox
            size="sm"
            tone="success"
            label="Est. capital-gains tax"
            value={formatCurrency(Math.round(gainsTax))}
            sub="On unrealised gains — if sold today"
          />
        </Card>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl p-3 bg-surface-2 border border-theme">
        <p className="text-[10px] leading-relaxed text-tertiary">
          <strong>Note:</strong> A planning estimate, not a tax filing. Gross is derived from logged income (editable);
          EPF defaults to 12% of a 50%-basic; direct tax assumes the recommended regime and the deductions on the
          Deductions tab; indirect tax is inferred from spending; capital-gains tax is on unrealised gains.{' '}
          {directOverridden ? 'Income tax uses your manual correction. ' : ''}Consult a CA for precise figures.
        </p>
      </div>
    </>
  );
}
