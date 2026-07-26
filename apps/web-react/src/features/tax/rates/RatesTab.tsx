import { Card, Badge, SectionLabel, Banner } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
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

/** A slab/levy card: rate badge + the items it taxes, as chips (group → items, analytics-style). */
function RateCard({ band }: { band: TaxBand }) {
  const color = band.retiredOn ? STATUS.neutral : band.regime === 'gst' ? STATUS.info : STATUS.warning;
  return (
    <Card padding="sm" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-primary">{band.label}</span>
        <Badge label={rateLabel(band)} color={color} size="sm" />
      </div>
      <p className="text-[11px] leading-relaxed text-secondary">{band.blurb}</p>
      {band.examples && band.examples.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {band.examples.map((ex) => (
            <span
              key={ex}
              className="text-[10px] px-2 py-1 rounded-full bg-surface-2 border border-theme text-secondary"
            >
              {ex}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

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
      <SectionLabel className="">GST — what's taxed at what</SectionLabel>
      {GST_ORDER.map((id) => (
        <RateCard key={id} band={TAX_BANDS[id]} />
      ))}
      <RateCard band={TAX_BANDS.insurance} />

      {/* Applicability — distinct from the rates */}
      <Banner variant="info" icon="ti-building-store">
        <strong>When does GST actually apply?</strong> Only registered sellers charge it — those above ₹40L turnover
        (₹20L for services). Small/local shops below that, and composition dealers (≤₹1.5cr), usually don't add GST to
        the bill. Fresh produce and unbranded staples are exempt. So your real indirect tax can be lower than the
        estimate — which is why the Footprint shows a range.
      </Banner>

      {/* Beyond GST */}
      <div className="pt-1">
        <SectionLabel className="">Beyond GST — other taxes &amp; levies</SectionLabel>
      </div>
      {LEVY_ORDER.map((id) => (
        <RateCard key={id} band={TAX_BANDS[id]} />
      ))}

      {/* Capital gains & F&O */}
      <div className="pt-1">
        <SectionLabel className="">Investing — capital gains &amp; F&amp;O</SectionLabel>
      </div>
      <Card padding="sm" className="flex flex-col gap-2">
        <p className="text-[11px] leading-relaxed text-secondary">Since Budget 2024 (23 Jul 2024):</p>
        <div className="flex flex-col gap-1.5 text-[11px]">
          {[
            ['Equity LTCG', '12.5% above ₹1.25L/yr', 'Held > 12 months'],
            ['Equity STCG', '20%', 'Held ≤ 12 months'],
            ['Other assets LTCG', '12.5% (no indexation)', 'Property/gold/unlisted, held > 24 months'],
            ['Debt mutual funds', 'Your slab rate', 'Bought after Apr 2023 — always slab'],
            ['F&O (futures & options)', 'Your slab rate', 'Business income — file ITR-3; audit if turnover high']
          ].map(([what, rate, note]) => (
            <div key={what} className="flex items-start justify-between gap-3 py-1 border-b border-theme last:border-0">
              <div className="flex flex-col min-w-0">
                <span className="text-secondary">{what}</span>
                <span className="text-[10px] text-tertiary">{note}</span>
              </div>
              <span className="font-semibold text-primary whitespace-nowrap">{rate}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Retired slabs */}
      <div className="pt-1">
        <SectionLabel className="">Retired slabs (pre-GST 2.0)</SectionLabel>
      </div>
      {RETIRED_ORDER.map((id) => (
        <RateCard key={id} band={TAX_BANDS[id]} />
      ))}

      {/* History */}
      <div className="pt-1">
        <SectionLabel className="">Rate-change history</SectionLabel>
      </div>
      <Card padding="sm" className="flex flex-col gap-2">
        {history.map((h, i) => (
          <div key={`${h.band.id}-${i}`} className="flex items-start gap-2 text-[11px]">
            <span className="text-tertiary tabular-nums whitespace-nowrap">{formatDate(h.effectiveFrom)}</span>
            <span className="text-secondary">
              <strong className="text-primary">{h.band.label}</strong>
              {h.retired
                ? ' — slab retired (GST 2.0)'
                : h.note
                  ? ` — ${h.note}`
                  : ` set to ${h.band.basis === 'markup' ? `${h.ratePct}%` : `~${h.ratePct}%`}`}
            </span>
          </div>
        ))}
        <p className="text-[10px] text-tertiary mt-1">
          Estimates only — fuel, alcohol, tobacco and vehicle levies vary by state and product.
        </p>
      </Card>
    </>
  );
}
