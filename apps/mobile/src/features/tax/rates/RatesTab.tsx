import { View, Text } from 'react-native';
import { Card, Badge, SectionLabel, Banner } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatDate } from '@/lib/date';
import { TAX_BANDS, type TaxBand, type TaxBandId } from '@/core/tax/indirectTaxRates';

// Current GST slabs, then the non-GST levies. 12% & 28% are retired (history only).
const GST_ORDER: TaxBandId[] = ['gst-0', 'gst-5', 'gst-18', 'gst-40'];
const LEVY_ORDER: TaxBandId[] = ['fuel', 'alcohol', 'tobacco', 'vehicle', 'toll'];
const RETIRED_ORDER: TaxBandId[] = ['gst-12', 'gst-28'];

function rateLabel(band: TaxBand): string {
  if (band.retiredOn) return 'Retired';
  const rate = band.rates[0]?.ratePct ?? 0;
  if (band.id === 'exempt' || rate === 0) return 'Nil';
  return band.basis === 'markup' ? `${rate}%` : `~${rate}%`;
}

/** A slab/levy card: rate badge + the items it taxes, as chips. */
function RateCard({ band }: { band: TaxBand }) {
  const theme = useThemeColors();
  const color = band.retiredOn ? theme.textTertiary : band.regime === 'gst' ? theme.info : theme.warning;
  return (
    <Card padding="sm" className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-semibold text-primary">{band.label}</Text>
        <Badge label={rateLabel(band)} color={color} size="sm" />
      </View>
      <Text className="text-[11px] leading-relaxed text-secondary">{band.blurb}</Text>
      {band.examples && band.examples.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {band.examples.map((ex) => (
            <Text
              key={ex}
              className="text-[10px] px-2 py-1 rounded-full bg-surface-2 border border-theme text-secondary"
            >
              {ex}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}

/** RN port of apps/web-legacy/src/features/tax/rates/RatesTab.tsx. */
export function RatesTab() {
  const history = [
    ...Object.values(TAX_BANDS).flatMap((band) =>
      band.rates.map((r) => ({
        band,
        effectiveFrom: r.effectiveFrom,
        note: r.note,
        ratePct: r.ratePct,
        retired: false
      }))
    ),
    ...Object.values(TAX_BANDS)
      .filter((b) => b.retiredOn)
      .map((band) => ({ band, effectiveFrom: band.retiredOn as number, note: undefined, ratePct: 0, retired: true }))
  ].sort((a, b) => b.effectiveFrom - a.effectiveFrom);

  return (
    <>
      {/* What's taxed at what */}
      <SectionLabel>GST — what's taxed at what</SectionLabel>
      {GST_ORDER.map((id) => (
        <RateCard key={id} band={TAX_BANDS[id]} />
      ))}
      <RateCard band={TAX_BANDS.insurance} />

      {/* Applicability — distinct from the rates */}
      <Banner variant="info" icon="ti-building-store">
        When does GST actually apply? Only registered sellers charge it — those above ₹40L turnover (₹20L for services).
        Small/local shops below that, and composition dealers (≤₹1.5cr), usually don't add GST to the bill. Fresh
        produce and unbranded staples are exempt. So your real indirect tax can be lower than the estimate — which is
        why the Footprint shows a range.
      </Banner>

      {/* Beyond GST */}
      <View className="pt-1">
        <SectionLabel>Beyond GST — other taxes & levies</SectionLabel>
      </View>
      {LEVY_ORDER.map((id) => (
        <RateCard key={id} band={TAX_BANDS[id]} />
      ))}

      {/* Capital gains & F&O */}
      <View className="pt-1">
        <SectionLabel>Investing — capital gains & F&O</SectionLabel>
      </View>
      <Card padding="sm" className="gap-2">
        <Text className="text-[11px] leading-relaxed text-secondary">Since Budget 2024 (23 Jul 2024):</Text>
        <View className="gap-1.5">
          {[
            ['Equity LTCG', '12.5% above ₹1.25L/yr', 'Held > 12 months'],
            ['Equity STCG', '20%', 'Held ≤ 12 months'],
            ['Other assets LTCG', '12.5% (no indexation)', 'Property/gold/unlisted, held > 24 months'],
            ['Debt mutual funds', 'Your slab rate', 'Bought after Apr 2023 — always slab'],
            ['F&O (futures & options)', 'Your slab rate', 'Business income — file ITR-3; audit if turnover high']
          ].map(([what, rate, note], i) => (
            <View
              key={what}
              className={`flex-row items-start justify-between gap-3 py-1 ${i > 0 ? 'border-t border-theme' : ''}`}
            >
              <View className="flex-1">
                <Text className="text-[11px] text-secondary">{what}</Text>
                <Text className="text-[10px] text-tertiary">{note}</Text>
              </View>
              <Text className="text-[11px] font-semibold text-primary">{rate}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Retired slabs */}
      <View className="pt-1">
        <SectionLabel>Retired slabs (pre-GST 2.0)</SectionLabel>
      </View>
      {RETIRED_ORDER.map((id) => (
        <RateCard key={id} band={TAX_BANDS[id]} />
      ))}

      {/* History */}
      <View className="pt-1">
        <SectionLabel>Rate-change history</SectionLabel>
      </View>
      <Card padding="sm" className="gap-2">
        {history.map((h, i) => (
          <View key={`${h.band.id}-${i}`} className="flex-row items-start gap-2">
            <Text className="text-[11px] text-tertiary">{formatDate(h.effectiveFrom)}</Text>
            <Text className="text-[11px] text-secondary flex-1">
              <Text className="text-primary font-bold">{h.band.label}</Text>
              {h.retired
                ? ' — slab retired (GST 2.0)'
                : h.note
                  ? ` — ${h.note}`
                  : ` set to ${h.band.basis === 'markup' ? `${h.ratePct}%` : `~${h.ratePct}%`}`}
            </Text>
          </View>
        ))}
        <Text className="text-[10px] text-tertiary mt-1">
          Estimates only — fuel, alcohol, tobacco and vehicle levies vary by state and product.
        </Text>
      </Card>
    </>
  );
}
