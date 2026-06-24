import { formatCurrency } from '@/lib/formatters';
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
            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-3">
              <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Equity LTCG</p>
              <p className="text-lg font-bold text-primary mt-1">{formatCurrency(Math.round(totalEquityLtcg))}</p>
              <p className="text-[10px] text-secondary mt-0.5">
                {formatCurrency(EQUITY_LTCG_EXEMPTION)} exempt · tax on remainder
              </p>
              <p className="text-xs font-semibold text-emerald-600 mt-1">
                Est. tax: {formatCurrency(Math.round(tax.equityLtcgTax))}
              </p>
            </div>
          )}
          {totalEquityStcg > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-3">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Equity STCG</p>
              <p className="text-lg font-bold text-primary mt-1">{formatCurrency(Math.round(totalEquityStcg))}</p>
              <p className="text-[10px] text-secondary mt-0.5">Taxed @ 20%</p>
              <p className="text-xs font-semibold text-amber-600 mt-1">
                Est. tax: {formatCurrency(Math.round(tax.equityStcgTax))}
              </p>
            </div>
          )}
          {(totalOtherLtcg > 0 || totalOtherStcg > 0) && (
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-3">
              <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Other LTCG</p>
              <p className="text-lg font-bold text-primary mt-1">{formatCurrency(Math.round(totalOtherLtcg))}</p>
              <p className="text-[10px] text-secondary mt-0.5">Gold / debt · 12.5%</p>
              <p className="text-xs font-semibold text-blue-600 mt-1">
                Est. tax: {formatCurrency(Math.round(tax.otherLtcgTax))}
              </p>
            </div>
          )}
          {(totalEquityLtcg > 0 || totalEquityStcg > 0) && (
            <div className="rounded-2xl p-3 bg-surface-2 border border-theme">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Total est. tax</p>
              <p className="text-lg font-bold mt-1 text-primary">{formatCurrency(Math.round(tax.totalTax))}</p>
              <p className="text-[10px] mt-0.5 text-tertiary">Equity only (excl. slab-rate items)</p>
            </div>
          )}
        </div>
      )}

      {/* Harvesting tips */}
      {totalEquityStcg > 0 && totalEquityLtcg === 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 flex gap-2">
          <i className="ti ti-bulb text-amber-500 flex-shrink-0 mt-0.5" style={{ fontSize: 16 }} aria-hidden="true" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>Tax-loss harvesting:</strong> If you have unrealised losses, consider booking them before March 31
            to offset these STCG gains.
          </p>
        </div>
      )}
      {totalEquityLtcg > EQUITY_LTCG_EXEMPTION && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-3 flex gap-2">
          <i className="ti ti-bulb text-blue-500 flex-shrink-0 mt-0.5" style={{ fontSize: 16 }} aria-hidden="true" />
          <p className="text-xs text-blue-700 leading-relaxed">
            <strong>LTCG grandfathering:</strong> If gains accumulated before Jan 31 2018, those are exempt. Consult
            your CA for the exact grandfathered cost.
          </p>
        </div>
      )}

      {/* Holdings list */}
      {capGains.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Holdings with gains/losses</p>
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
