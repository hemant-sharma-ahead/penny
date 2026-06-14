import { useEffect, useMemo, useState } from 'react';
import { holdingsRepo, insurancePoliciesRepo, liabilitiesRepo } from '@/core/db/repositories';
import type { Holding, InsurancePolicy, Liability } from '@/core/db/types';
import { computeTaxSummary, EQUITY_LTCG_EXEMPTION, LIMITS } from '@/core/tax/calculator';
import type { CapGainItem } from '@/core/tax/calculator';
import { formatCurrency } from '@/lib/formatters';

// ── Progress bar ──────────────────────────────────────────────────────────────

function DeductionBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = Math.min(100, (used / limit) * 100);
  const remaining = Math.max(0, limit - used);
  const color = pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : 'var(--color-primary)';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-semibold text-primary">{label}</span>
        <span className="text-[11px] text-secondary">
          {formatCurrency(used)} / {formatCurrency(limit)}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-surface-3">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {remaining > 0 ? (
        <p className="text-[10px] mt-1 text-tertiary">{formatCurrency(remaining)} remaining to invest this FY</p>
      ) : (
        <p className="text-[10px] text-emerald-600 mt-1 font-medium">Limit fully utilised</p>
      )}
    </div>
  );
}

// ── Manual input ──────────────────────────────────────────────────────────────

function ManualInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs flex-1 min-w-0 truncate text-secondary">{label}</span>
      <div className="relative flex-shrink-0 w-28">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none text-tertiary">₹</span>
        <input
          type="number"
          inputMode="decimal"
          className="w-full rounded-lg border pl-5 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#00a86b] input-surface"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

// ── Capital gain row ──────────────────────────────────────────────────────────

function CapGainRow({ item }: { item: CapGainItem }) {
  const isGain = item.gain > 0;
  const isLoss = item.gain < 0;
  const daysToLT = item.ltThresholdDays - item.holdingDays;
  const gainColor = isGain ? '#10b981' : isLoss ? '#ef4444' : '#64748b';

  return (
    <div className="rounded-xl p-3 surface">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate text-primary">{item.name}</p>
          <p className="text-[11px] mt-0.5 text-tertiary">
            {item.assetClass.toUpperCase()} · {item.holdingDays}d held ·{' '}
            {item.isLongTerm ? (
              <span className="text-emerald-600 font-medium">Long-term</span>
            ) : daysToLT > 0 ? (
              <span className="text-amber-600 font-medium">{daysToLT}d to long-term</span>
            ) : (
              <span className="text-secondary">Short-term</span>
            )}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold" style={{ color: gainColor }}>
            {isGain ? '+' : ''}
            {formatCurrency(Math.abs(item.gain))}
          </p>
          <p className="text-[10px] text-tertiary">
            {item.gainPct >= 0 ? '+' : ''}
            {item.gainPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {item.gain > 0 && item.taxRatePct !== null && (
        <div className="mt-2 pt-2 flex items-center justify-between border-t border-theme">
          <span className="text-[10px] text-tertiary">
            Est. tax @ {item.taxRatePct}%
            {!item.isLongTerm && item.assetClass === 'stock' ? ' (STCG)' : item.isLongTerm ? ' (LTCG)' : ''}
          </span>
          <span className="text-[11px] font-semibold text-secondary">
            {item.estimatedTax !== null ? formatCurrency(Math.round(item.estimatedTax)) : 'At slab rate'}
          </span>
        </div>
      )}
      {item.gain > 0 && item.taxRatePct === null && (
        <div className="mt-2 pt-2 border-t border-theme">
          <span className="text-[10px] text-tertiary">Taxed at your income slab rate</span>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface LoadedData {
  holdings: Holding[];
  policies: InsurancePolicy[];
  liabilities: Liability[];
}

export function TaxAwarenessPage() {
  const [nowMs] = useState(() => Date.now());
  const [data, setData] = useState<LoadedData | null>(null);
  const [activeTab, setActiveTab] = useState<'deductions' | 'gains'>('deductions');

  const [ppf, setPpf] = useState('');
  const [elss, setElss] = useState('');
  const [nps, setNps] = useState('');
  const [other80C, setOther80C] = useState('');
  const [parentsPremium, setParentsPremium] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([holdingsRepo.getAll(), insurancePoliciesRepo.getAll(), liabilitiesRepo.getAll()])
      .then(([holdings, policies, liabilities]) => {
        if (cancelled) return;
        setData({ holdings, policies, liabilities });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    if (!data) return null;
    return computeTaxSummary(data.policies, data.liabilities, data.holdings, nowMs);
  }, [data, nowMs]);

  const manual80CTotal = useMemo(() => {
    return [ppf, elss, nps, other80C].reduce((s, v) => {
      const n = parseFloat(v);
      return s + (n > 0 ? n : 0);
    }, 0);
  }, [ppf, elss, nps, other80C]);

  const inferred80CTotal = useMemo(() => (summary?.inferred80C ?? []).reduce((s, i) => s + i.amount, 0), [summary]);

  const total80C = inferred80CTotal + manual80CTotal;

  const npsAmount = useMemo(() => {
    const n = parseFloat(nps);
    return n > 0 ? n : 0;
  }, [nps]);

  const total80D = useMemo(() => {
    const parents = parseFloat(parentsPremium);
    return { self: summary?.inferred80DAmount ?? 0, parents: parents > 0 ? parents : 0 };
  }, [summary, parentsPremium]);

  if (!summary) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-4 pb-3 border-b border-theme">
          <h2 className="text-xl font-semibold text-primary">Tax Awareness</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-tertiary">Loading…</p>
        </div>
      </div>
    );
  }

  const { fy, sec24B, capGains, totalEquityLtcg, totalEquityStcg, totalOtherLtcg, totalOtherStcg } = summary;
  const totalLtcgTax = Math.max(0, totalEquityLtcg - EQUITY_LTCG_EXEMPTION) * 0.125 + totalOtherLtcg * 0.125;
  const totalStcgTax = totalEquityStcg * 0.2;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <h2 className="text-xl font-semibold text-primary">Tax Awareness</h2>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-secondary">{fy.label}</span>
          <span style={{ color: 'var(--color-border-strong)' }}>·</span>
          <span className="text-xs text-secondary">{fy.daysLeft} days left in FY</span>
          {fy.isQ4 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              Q4 — invest now
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 border-b border-theme">
        {(
          [
            ['deductions', 'Deductions'],
            ['gains', 'Capital Gains']
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="py-2.5 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={
              activeTab === tab
                ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                : { borderColor: 'transparent', color: 'var(--color-text-secondary)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 flex flex-col gap-4">
        {/* ── Deductions tab ── */}
        {activeTab === 'deductions' && (
          <>
            {/* 80C */}
            <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
              <div>
                <p className="text-sm font-semibold text-primary">Section 80C</p>
                <p className="text-xs text-tertiary">Tax-saving investments (max ₹1,50,000)</p>
              </div>

              <DeductionBar used={total80C} limit={LIMITS.SEC_80C} label="80C utilisation" />

              {/* Inferred items */}
              {summary.inferred80C.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">From your data</p>
                  {summary.inferred80C.map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1 text-secondary">
                        <i className="ti ti-check text-emerald-500" style={{ fontSize: 11 }} aria-hidden="true" />
                        {item.label}
                      </span>
                      <span className="text-xs font-medium text-primary">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual inputs */}
              <div className="flex flex-col gap-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Add your investments</p>
                <ManualInput label="PPF contribution" value={ppf} onChange={setPpf} />
                <ManualInput label="ELSS mutual funds" value={elss} onChange={setElss} />
                <ManualInput label="NPS (80C portion)" value={nps} onChange={setNps} />
                <ManualInput label="Other (ULIP, NSC, SSY, etc.)" value={other80C} onChange={setOther80C} />
              </div>
            </div>

            {/* NPS 80CCD(1B) additional */}
            {npsAmount > 0 && (
              <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4 flex flex-col gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">Section 80CCD(1B) — NPS bonus</p>
                  <p className="text-xs text-tertiary">Additional ₹50,000 over 80C limit</p>
                </div>
                <DeductionBar
                  used={Math.min(npsAmount, LIMITS.NPS_80CCD_1B)}
                  limit={LIMITS.NPS_80CCD_1B}
                  label="80CCD(1B)"
                />
              </div>
            )}

            {/* 80D */}
            <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
              <div>
                <p className="text-sm font-semibold text-primary">Section 80D</p>
                <p className="text-xs text-tertiary">Health insurance premiums (max ₹25,000 self + ₹25,000 parents)</p>
              </div>

              <DeductionBar used={total80D.self} limit={LIMITS.SEC_80D_SELF} label="Self & family" />

              {summary.inferred80DAmount > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-secondary">
                    <i className="ti ti-check text-emerald-500" style={{ fontSize: 11 }} aria-hidden="true" />
                    Health insurance premium
                  </span>
                  <span className="font-medium text-primary">{formatCurrency(summary.inferred80DAmount)}</span>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-2 text-tertiary">Parents</p>
                <DeductionBar
                  used={total80D.parents}
                  limit={LIMITS.SEC_80D_PARENTS}
                  label="Parents' health insurance"
                />
                <div className="mt-2">
                  <ManualInput label="Parents' health premium" value={parentsPremium} onChange={setParentsPremium} />
                </div>
              </div>
            </div>

            {/* 24B */}
            <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
              <div>
                <p className="text-sm font-semibold text-primary">Section 24B</p>
                <p className="text-xs text-tertiary">Home loan interest deduction (max ₹2,00,000)</p>
              </div>

              {sec24B.hasHomeLoan ? (
                <>
                  <DeductionBar
                    used={Math.min(sec24B.annualInterest, LIMITS.SEC_24B)}
                    limit={LIMITS.SEC_24B}
                    label="Home loan interest"
                  />
                  <p className="text-xs text-secondary">
                    Estimated annual interest: {formatCurrency(sec24B.annualInterest)}
                    {sec24B.annualInterest > LIMITS.SEC_24B && (
                      <span className="text-amber-600"> (capped at ₹2L for self-occupied property)</span>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-sm text-tertiary">
                  No home loan found. Add one under Liabilities to track this deduction.
                </p>
              )}
            </div>

            {/* Old vs New regime note */}
            <div className="rounded-2xl p-4 bg-surface-2 border border-theme">
              <p className="text-xs font-semibold mb-1 text-secondary">Old vs. New Regime</p>
              <p className="text-xs leading-relaxed text-secondary">
                Deductions (80C/80D/24B) apply under the <strong>old tax regime</strong>. Under the new regime these are
                unavailable but slab rates are lower. Compare both before filing — this tool covers old-regime
                deductions only.
              </p>
            </div>
          </>
        )}

        {/* ── Capital Gains tab ── */}
        {activeTab === 'gains' && (
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
                      Est. tax:{' '}
                      {formatCurrency(Math.round(Math.max(0, totalEquityLtcg - EQUITY_LTCG_EXEMPTION) * 0.125))}
                    </p>
                  </div>
                )}
                {totalEquityStcg > 0 && (
                  <div className="bg-amber-50 rounded-2xl border border-amber-100 p-3">
                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Equity STCG</p>
                    <p className="text-lg font-bold text-primary mt-1">{formatCurrency(Math.round(totalEquityStcg))}</p>
                    <p className="text-[10px] text-secondary mt-0.5">Taxed @ 20%</p>
                    <p className="text-xs font-semibold text-amber-600 mt-1">
                      Est. tax: {formatCurrency(Math.round(totalEquityStcg * 0.2))}
                    </p>
                  </div>
                )}
                {(totalOtherLtcg > 0 || totalOtherStcg > 0) && (
                  <div className="bg-blue-50 rounded-2xl border border-blue-100 p-3">
                    <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Other LTCG</p>
                    <p className="text-lg font-bold text-primary mt-1">{formatCurrency(Math.round(totalOtherLtcg))}</p>
                    <p className="text-[10px] text-secondary mt-0.5">Gold / debt · 12.5%</p>
                    <p className="text-xs font-semibold text-blue-600 mt-1">
                      Est. tax: {formatCurrency(Math.round(totalOtherLtcg * 0.125))}
                    </p>
                  </div>
                )}
                {(totalEquityLtcg > 0 || totalEquityStcg > 0) && (
                  <div className="rounded-2xl p-3 bg-surface-2 border border-theme">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Total est. tax</p>
                    <p className="text-lg font-bold mt-1 text-primary">
                      {formatCurrency(Math.round(totalLtcgTax + totalStcgTax))}
                    </p>
                    <p className="text-[10px] mt-0.5 text-tertiary">Equity only (excl. slab-rate items)</p>
                  </div>
                )}
              </div>
            )}

            {/* Harvesting tip */}
            {totalEquityStcg > 0 && totalEquityLtcg === 0 && (
              <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 flex gap-2">
                <i
                  className="ti ti-bulb text-amber-500 flex-shrink-0 mt-0.5"
                  style={{ fontSize: 16 }}
                  aria-hidden="true"
                />
                <p className="text-xs text-amber-700 leading-relaxed">
                  <strong>Tax-loss harvesting:</strong> If you have unrealised losses, consider booking them before
                  March 31 to offset these STCG gains.
                </p>
              </div>
            )}
            {totalEquityLtcg > EQUITY_LTCG_EXEMPTION && (
              <div className="bg-blue-50 rounded-xl border border-blue-100 p-3 flex gap-2">
                <i
                  className="ti ti-bulb text-blue-500 flex-shrink-0 mt-0.5"
                  style={{ fontSize: 16 }}
                  aria-hidden="true"
                />
                <p className="text-xs text-blue-700 leading-relaxed">
                  <strong>LTCG grandfathering:</strong> If gains accumulated before Jan 31 2018, those are exempt.
                  Consult your CA for the exact grandfathered cost.
                </p>
              </div>
            )}

            {/* Holdings list */}
            {capGains.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                  Holdings with gains/losses
                </p>
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
                  <strong>Note:</strong> Holding period is calculated from when you added this holding to Penny, which
                  may differ from the actual purchase date. Tax estimates are indicative — consult a CA for precise
                  calculations. Equity LTCG exemption of ₹1.25L is shown per-holding here; it applies across all equity
                  gains in a FY.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
