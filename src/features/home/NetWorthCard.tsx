import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatCompact, formatCurrency } from '@/lib/formatters';
import { PATHS } from '@/router/paths';
import { Button, IconBadge, ProgressBar } from '@/components/ui';
import type { HomeSummary, AssetGroup } from './useHome';

/** Fixed palette for the always-dark net-worth hero card (intentionally not theme-tokened). */
const HERO = {
  cardBg: '#064e3b',
  panelBg: '#065f46',
  label: '#6ee7b7',
  valueDim: '#a7f3d0',
  assetLabel: '#e2f8f0',
  liabValue: '#fca5a5',
  liabName: '#fecaca',
  liabSub: '#f87171',
  liabIconBg: 'rgba(252,165,165,0.15)',
  chevBtnBg: '#065f46',
  chevBtnFg: '#34d399',
  divider: 'rgba(255,255,255,0.15)',
  dividerFaint: 'rgba(255,255,255,0.06)',
  dividerSoft: 'rgba(255,255,255,0.12)',
  dividerMed: 'rgba(255,255,255,0.1)',
  chevron: 'rgba(255,255,255,0.3)'
} as const;

const LIABILITY_META: Record<string, { label: string; icon: string }> = {
  home_loan: { label: 'Home Loan', icon: 'ti-home' },
  car_loan: { label: 'Car Loan', icon: 'ti-car' },
  personal_loan: { label: 'Personal Loan', icon: 'ti-user' },
  education_loan: { label: 'Education Loan', icon: 'ti-school' },
  credit_card: { label: 'Credit Card', icon: 'ti-credit-card' },
  bnpl: { label: 'BNPL', icon: 'ti-device-mobile' },
  gold_loan: { label: 'Gold Loan', icon: 'ti-coin' },
  lap: { label: 'Loan Against Property', icon: 'ti-building' },
  las: { label: 'Loan Against Securities', icon: 'ti-chart-bar' },
  overdraft: { label: 'Overdraft', icon: 'ti-credit-card' },
  informal: { label: 'Informal Loan', icon: 'ti-users' },
  rental_deposit: { label: 'Rental Deposit', icon: 'ti-building' }
};

function assetSubTab(ac: string): string {
  if (ac === 'nps' || ac === 'ppf' || ac === 'epf') return 'retirement';
  if (ac === 'gold') return 'precious_metals';
  if (ac === 'vehicle' || ac === 'property' || ac === 'other') return 'real_assets';
  if (ac === 'fd') return 'fixed_income';
  if (ac === 'stock') return 'stocks';
  return ac;
}

interface NetWorthCardProps {
  summary: HomeSummary;
  assetGroups: AssetGroup[];
  totalAssets: number;
  totalLiabilities: number;
}

export function NetWorthCard({ summary, assetGroups, totalAssets, totalLiabilities }: NetWorthCardProps) {
  const { mode } = usePrivacy();
  const navigate = useNavigate();
  const [assetsExpanded, setAssetsExpanded] = useState(false);

  const displayNetWorth = mode === 'open' ? formatCurrency(summary.netWorth) : '••••';
  const displayExpenses =
    summary.monthlyExpenses > 0
      ? mode === 'open'
        ? `${formatCompact(summary.monthlyExpenses)} spent this month`
        : '•••• spent this month'
      : null;

  return (
    <div className="rounded-[20px] overflow-hidden" style={{ backgroundColor: HERO.cardBg }}>
      {/* Top row: net worth left, assets/liabilities right */}
      <div style={{ padding: '16px 18px 0' }}>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="mb-0.5 text-[12px]" style={{ color: HERO.label }}>
              Net worth
            </p>
            <p className="text-[28px] font-medium tracking-tight text-white">{displayNetWorth}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 pt-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: HERO.label }}>
                Assets
              </span>
              <span className="text-[13px] font-medium" style={{ color: HERO.valueDim }}>
                {mode === 'open' ? formatCurrency(totalAssets) : '••••'}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: HERO.label }}>
                Liabilities
              </span>
              <span
                className="text-[13px] font-medium"
                style={{ color: totalLiabilities > 0 ? HERO.liabValue : HERO.valueDim }}
              >
                {mode === 'open' ? formatCurrency(totalLiabilities) : '••••'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mt-3" style={{ height: '0.5px', backgroundColor: HERO.divider }} />

      {/* Footer: spent this month + expand chevron */}
      <div className="flex items-center justify-between px-[18px] pt-[10px] pb-3">
        {displayExpenses ? (
          <p className="text-xs" style={{ color: HERO.label }}>
            {displayExpenses}
          </p>
        ) : (
          <span />
        )}
        {assetGroups.length > 0 && (
          <Button
            variant="ghost"
            icon={assetsExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}
            aria-label="Toggle asset breakdown"
            className="w-8 h-7 rounded-xl"
            style={{ backgroundColor: HERO.chevBtnBg, color: HERO.chevBtnFg }}
            onClick={() => setAssetsExpanded((v) => !v)}
          />
        )}
      </div>

      {/* Collapsed: summary bar + legend + liabilities total */}
      {!assetsExpanded && assetGroups.length > 0 && (
        <div style={{ padding: '14px 18px 16px', backgroundColor: HERO.panelBg }}>
          {mode === 'open' && totalAssets > 0 && (
            <>
              <div
                className="flex rounded-full overflow-hidden"
                style={{ height: '5px', gap: '2px', marginBottom: '10px' }}
              >
                {assetGroups.map(({ ac, value, meta }) => (
                  <div key={ac} style={{ flex: value / totalAssets, backgroundColor: meta.color }} />
                ))}
              </div>
              <div className="flex flex-wrap" style={{ gap: '8px 14px' }}>
                {assetGroups.map(({ ac, meta, value }) => (
                  <div key={ac} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                    <span className="text-[11px]" style={{ color: HERO.label }}>
                      {meta.short}
                    </span>
                    <span className="text-[11px] font-medium" style={{ color: HERO.valueDim }}>
                      {formatCompact(value)}
                    </span>
                  </div>
                ))}
              </div>
              {totalLiabilities > 0 && (
                <div
                  className="flex items-center justify-between"
                  style={{ marginTop: '10px', paddingTop: '10px', borderTop: `0.5px solid ${HERO.dividerSoft}` }}
                >
                  <span className="text-[12px]" style={{ color: HERO.label }}>
                    Liabilities
                  </span>
                  <span className="text-[13px] font-medium" style={{ color: HERO.liabValue }}>
                    − {formatCurrency(totalLiabilities)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Expanded: full asset rows + liabilities list */}
      {assetsExpanded && (
        <div style={{ backgroundColor: HERO.panelBg }} className="pb-2">
          <div style={{ padding: '12px 18px 4px' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: HERO.label }}>
              Assets
            </p>
          </div>
          {assetGroups.map(({ ac, value, meta }) => (
            <button
              key={ac}
              onClick={() =>
                ac === 'liquid'
                  ? navigate(PATHS.app.accounts)
                  : navigate('/app/portfolio', { state: { holdingsSubTab: assetSubTab(ac) } })
              }
              className="w-full flex items-center gap-3 text-left"
              style={{ padding: '10px 18px', borderBottom: `0.5px solid ${HERO.dividerFaint}` }}
            >
              <IconBadge icon={meta.icon} color={meta.color} bg={`${meta.color}25`} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 mb-1">
                  <p className="text-[13px] font-medium" style={{ color: HERO.assetLabel }}>
                    {meta.label}
                  </p>
                  {mode === 'open' && totalAssets > 0 && (
                    <p className="text-[10px]" style={{ color: HERO.label }}>
                      {((value / totalAssets) * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
                <ProgressBar
                  value={mode === 'open' && totalAssets > 0 ? (value / totalAssets) * 100 : 0}
                  color={meta.color}
                  size="xs"
                />
              </div>
              <p className="text-[13px] font-medium flex-shrink-0" style={{ color: HERO.valueDim }}>
                {mode === 'open' ? formatCurrency(value) : '••••'}
              </p>
              <i
                className="ti ti-chevron-right flex-shrink-0"
                style={{ fontSize: 13, color: HERO.chevron }}
                aria-hidden="true"
              />
            </button>
          ))}

          {(summary.liabilities.length > 0 || summary.creditCardAccounts.some((c) => c.outstanding > 0)) && (
            <>
              <div style={{ padding: '12px 18px 4px', marginTop: '4px', borderTop: `0.5px solid ${HERO.dividerMed}` }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: HERO.label }}>
                  Liabilities
                </p>
              </div>
              {summary.creditCardAccounts
                .filter((c) => c.outstanding > 0)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(PATHS.app.accounts)}
                    className="w-full flex items-center gap-3 text-left"
                    style={{ padding: '10px 18px' }}
                  >
                    <IconBadge icon={c.icon} color={HERO.liabValue} bg={HERO.liabIconBg} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: HERO.liabName }}>
                        {c.name}
                      </p>
                      <p className="text-[10px]" style={{ color: HERO.liabSub }}>
                        Credit card outstanding
                      </p>
                    </div>
                    <p className="text-[13px] font-medium flex-shrink-0" style={{ color: HERO.liabValue }}>
                      {mode === 'open' ? formatCurrency(c.outstanding) : '••••'}
                    </p>
                  </button>
                ))}
              {summary.liabilities.map((l) => {
                const lMeta = LIABILITY_META[l.type] ?? { label: l.type, icon: 'ti-credit-card' };
                return (
                  <div key={l.id} className="flex items-center gap-3" style={{ padding: '10px 18px' }}>
                    <IconBadge icon={lMeta.icon} color={HERO.liabValue} bg={HERO.liabIconBg} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: HERO.liabName }}>
                        {l.name}
                      </p>
                      {l.interestRate > 0 && (
                        <p className="text-[10px]" style={{ color: HERO.liabSub }}>
                          {l.interestRate}% p.a.
                        </p>
                      )}
                    </div>
                    <p className="text-[13px] font-medium flex-shrink-0" style={{ color: HERO.liabValue }}>
                      {mode === 'open' ? formatCurrency(l.outstandingAmount) : '••••'}
                    </p>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
