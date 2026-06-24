import { formatCurrency } from '@/lib/formatters';
import { Banner, StatBox, SectionLabel } from '@/components/ui';
import { EQUITY_LTCG_EXEMPTION, computeCapitalGainsTax } from '@/core/tax/calculator';
import type { TaxSummary } from '@/core/tax/calculator';
import { CapGainRow } from './CapGainRow';

export function CapitalGainsTab({ summary }: { summary: TaxSummary }) {
  const { capGains, totalEquityLtcg, totalEquityStcg, totalOtherLtcg, totalOtherStcg } = summary;
  const tax = computeCapitalGainsTax(summary);

  return (
    <>
      {/* Summary cards */}
      {(totalEquityLtcg > 0 || totalEquityStcg > 0 || totalOtherLtcg > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {totalEquityLtcg > 0 && (
            <StatBox
              tone="success"
              label="Equity LTCG"
              value={formatCurrency(Math.round(totalEquityLtcg))}
              sub={`${formatCurrency(EQUITY_LTCG_EXEMPTION)} exempt · tax on remainder`}
              footer={`Est. tax: ${formatCurrency(Math.round(tax.equityLtcgTax))}`}
            />
          )}
          {totalEquityStcg > 0 && (
            <StatBox
              tone="warning"
              label="Equity STCG"
              value={formatCurrency(Math.round(totalEquityStcg))}
              sub="Taxed @ 20%"
              footer={`Est. tax: ${formatCurrency(Math.round(tax.equityStcgTax))}`}
            />
          )}
          {(totalOtherLtcg > 0 || totalOtherStcg > 0) && (
            <StatBox
              tone="info"
              label="Other LTCG"
              value={formatCurrency(Math.round(totalOtherLtcg))}
              sub="Gold / debt · 12.5%"
              footer={`Est. tax: ${formatCurrency(Math.round(tax.otherLtcgTax))}`}
            />
          )}
          {(totalEquityLtcg > 0 || totalEquityStcg > 0) && (
            <StatBox
              label="Total est. tax"
              value={formatCurrency(Math.round(tax.totalTax))}
              sub="Equity only (excl. slab-rate items)"
            />
          )}
        </div>
      )}

      {/* Harvesting tips */}
      {totalEquityStcg > 0 && totalEquityLtcg === 0 && (
        <Banner variant="warning" icon="ti-bulb">
          <strong>Tax-loss harvesting:</strong> If you have unrealised losses, consider booking them before March 31 to
          offset these STCG gains.
        </Banner>
      )}
      {totalEquityLtcg > EQUITY_LTCG_EXEMPTION && (
        <Banner variant="info" icon="ti-bulb">
          <strong>LTCG grandfathering:</strong> If gains accumulated before Jan 31 2018, those are exempt. Consult your
          CA for the exact grandfathered cost.
        </Banner>
      )}

      {/* Holdings list */}
      {capGains.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SectionLabel className="">Holdings with gains/losses</SectionLabel>
          {capGains.map((item) => (
            <CapGainRow key={item.name + item.assetClass} item={item} />
          ))}
        </div>
      ) : (
        <div className="p-10 text-center">
          <i className="ti ti-chart-pie text-tertiary" style={{ fontSize: 40 }} aria-hidden="true" />
          <p className="text-sm mt-3 text-tertiary">
            No holdings found. Add investments in Portfolio to see capital gains.
          </p>
        </div>
      )}

      {/* Disclaimer */}
      {capGains.length > 0 && (
        <div className="rounded-xl p-3 bg-surface-2 border border-theme">
          <p className="text-[10px] leading-relaxed text-tertiary">
            <strong>Note:</strong> Holding period is calculated from when you added this holding to Penny, which may
            differ from the actual purchase date. Tax estimates are indicative — consult a CA for precise calculations.
            Equity LTCG exemption of ₹1.25L is shown per-holding here; it applies across all equity gains in a FY.
          </p>
        </div>
      )}
    </>
  );
}
