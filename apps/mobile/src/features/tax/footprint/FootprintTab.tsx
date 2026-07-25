import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Card, StatBox, Banner, SectionLabel, AmountInput, Button, SelectInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { formatCurrency, formatPercent, parseNumber } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import { useSettings } from '~/context/SettingsContext';
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

/** RN port of apps/web-legacy/src/features/tax/footprint/FootprintTab.tsx. */
export function FootprintTab({ data }: { data: FootprintData }) {
  const theme = useThemeColors();
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
      <Card padding="lg" className="gap-3">
        <Text className="text-base font-semibold text-primary leading-relaxed">
          Of the {formatCurrency(Math.round(w.consumed))} you didn't save,{' '}
          <Text style={{ color: theme.danger }}>{formatCurrency(Math.round(w.directTax + w.indirectTax))}</Text> (
          {formatPercent(taxOfConsumed)}) went to tax.
        </Text>
        <MoneyFlow waterfall={w} />
        {w.overspent && (
          <Text className="text-[11px]" style={{ color: theme.warning }}>
            You spent more than your in-hand income this year — the difference came from savings or credit.
          </Text>
        )}
        {w.gross > 0 && (
          <Pressable onPress={() => setShowStory(true)} className="flex-row items-center gap-1 self-start">
            <Icon name="ti-share" size={14} color={theme.info} />
            <Text className="text-xs font-medium" style={{ color: theme.info }}>
              Share my tax story
            </Text>
          </Pressable>
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
      <Card className="gap-2">
        <View className="flex-row items-center justify-between">
          <SectionLabel className="">Income waterfall</SectionLabel>
          <Pressable onPress={() => setAdjusting((v) => !v)}>
            <Text className="text-xs font-medium" style={{ color: theme.info }}>
              {adjusting ? 'Cancel' : 'Adjust'}
            </Text>
          </Pressable>
        </View>

        {adjusting ? (
          <View className="gap-3 pt-1">
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
            <View className="flex-row gap-2">
              <Button onPress={applyAdjustments} className="flex-1">
                Apply
              </Button>
              <Button variant="ghost" onPress={resetAdjustments}>
                Reset
              </Button>
            </View>
          </View>
        ) : (
          <WaterfallSteps waterfall={w} />
        )}
      </Card>

      {/* Spend → indirect tax */}
      <Card className="gap-3">
        <SectionLabel className="">Spend → indirect tax</SectionLabel>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <StatBox size="sm" label="Total spend" value={formatCurrency(Math.round(indirect.totalSpend))} />
          </View>
          <View className="flex-1">
            <StatBox
              size="sm"
              tone="warning"
              label="Indirect tax (est.)"
              value={formatCurrency(Math.round(indirect.totalTax))}
              sub={`range ${formatCurrency(Math.round(indirect.totalTaxMin))}–${formatCurrency(Math.round(indirect.totalTaxMax))}`}
            />
          </View>
          <View className="flex-1">
            <StatBox size="sm" label="Effective rate" value={formatPercent(indirect.effectiveRatePct)} sub="of spend" />
          </View>
        </View>

        {indirect.byRegime.filter((r) => r.tax > 0).length > 0 && (
          <View className="gap-1.5">
            {indirect.byRegime
              .filter((r) => r.tax > 0)
              .map((r) => (
                <View key={r.regime} className="flex-row items-center justify-between">
                  <Text className="text-xs text-secondary">{r.label}</Text>
                  <Text className="text-xs font-medium text-primary">{formatCurrency(Math.round(r.tax))}</Text>
                </View>
              ))}
          </View>
        )}

        {indirect.byBand.some((b) => b.tax > 0) && (
          <>
            <Pressable onPress={() => setShowBands((v) => !v)} className="self-start">
              <Text className="text-xs font-medium" style={{ color: theme.info }}>
                {showBands ? 'Hide detail' : 'Show by rate band'}
              </Text>
            </Pressable>
            {showBands && (
              <View className="gap-1 rounded-xl bg-surface-2 border border-theme p-2.5">
                {indirect.byBand
                  .filter((b) => b.tax > 0)
                  .map((b) => (
                    <View key={b.bandId} className="flex-row items-center justify-between">
                      <Text className="text-[11px] text-secondary">
                        {b.label} · {b.count} txn{b.count === 1 ? '' : 's'}
                      </Text>
                      <Text className="text-[11px] text-primary">{formatCurrency(Math.round(b.tax))}</Text>
                    </View>
                  ))}
              </View>
            )}
          </>
        )}
      </Card>

      {/* Invest */}
      {gainsTax > 0 && (
        <Card className="gap-3">
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
      <View className="rounded-xl p-3 bg-surface-2 border border-theme">
        <Text className="text-[10px] leading-relaxed text-tertiary">
          Note: A planning estimate, not a tax filing. Gross is derived from logged income (editable); EPF defaults to
          12% of a 50%-basic; direct tax assumes the recommended regime and the deductions on the Deductions tab;
          indirect tax is inferred from spending; capital-gains tax is on unrealised gains.{' '}
          {directOverridden ? 'Income tax uses your manual correction. ' : ''}Consult a CA for precise figures.
        </Text>
      </View>
    </>
  );
}
