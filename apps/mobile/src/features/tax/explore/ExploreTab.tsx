import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { Card, AmountInput, SegmentedControl, Banner, SectionLabel } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { formatCurrency, formatPercent, parseNumber } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import { TAX_SCENARIOS, type TaxScenario } from '@/core/tax/taxScenarios';
import { RatesTab } from '../rates/RatesTab';
import { DidYouKnow } from '../DidYouKnow';

const FALLBACK_SCENARIO = TAX_SCENARIOS[0] as TaxScenario;

/** RN port of apps/web-react/src/features/tax/explore/ExploreTab.tsx. */
export function ExploreTab() {
  const theme = useThemeColors();
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
        Tax X-ray — pick a money move and see every tax & charge hidden inside it. Tweak the amount to match yours.
      </Banner>

      {/* Scenario chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2 pb-1">
          {TAX_SCENARIOS.map((s) => {
            const active = s.id === scenarioId;
            return (
              <Pressable
                key={s.id}
                onPress={() => selectScenario(s.id)}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-full border"
                style={{
                  // Web's inactive chip is a filled `surface` pill, not transparent — match that here.
                  backgroundColor: active ? theme.primary : theme.surface,
                  borderColor: active ? theme.primary : theme.border
                }}
              >
                <Icon name={s.icon} size={15} color={active ? '#fff' : theme.textSecondary} />
                <Text className="text-xs font-medium" style={{ color: active ? '#fff' : theme.textSecondary }}>
                  {s.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Card className="gap-3">
        <Text className="text-xs text-secondary">{scenario.blurb}</Text>
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
            <View className="gap-1 pt-1">
              {r.lines.map((line, i) => (
                <View
                  key={line.label}
                  className={`flex-row items-start justify-between gap-3 py-1 ${i > 0 ? 'border-t border-theme' : ''}`}
                >
                  <View className="flex-1">
                    <Text
                      className="text-xs"
                      style={{ color: line.isCharge ? theme.textTertiary : theme.textSecondary }}
                    >
                      {line.label}
                      {line.isCharge && <Text className="text-[10px]"> · charge, not tax</Text>}
                    </Text>
                    {line.note && <Text className="text-[10px] text-tertiary">{line.note}</Text>}
                  </View>
                  <Text className="text-xs font-semibold text-primary tabular-nums">
                    {formatCurrency(Math.round(line.amount))}
                  </Text>
                </View>
              ))}
            </View>

            <View className="flex-row items-center justify-between rounded-xl p-3 bg-surface-2 border border-theme">
              <View>
                <Text className="text-[11px] text-secondary">Government tax / levy</Text>
                <Text className="text-[10px] text-tertiary">{formatPercent(r.effectivePct)} of the amount</Text>
              </View>
              <Text className="text-lg font-bold tabular-nums" style={{ color: theme.danger }}>
                {formatCurrency(Math.round(r.totalTax))}
              </Text>
            </View>

            <Banner variant="warning" icon="ti-bulb">
              {r.takeaway}
            </Banner>
          </>
        )}
      </Card>

      <DidYouKnow />

      <View className="pt-2">
        <SectionLabel>Rate reference</SectionLabel>
      </View>
      <RatesTab />
    </>
  );
}
