import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '@/context/PrivacyContext';
import { useForecast } from '@/hooks/useForecast';
import { formatCompact, formatCurrency } from '@/lib/formatters';
import { PATHS } from '@/router/paths';
import { IconBadge, Modal, ProgressBar } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
import type { AssetGroup, HomeSummary } from './useHome';

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

interface Props {
  summary: HomeSummary;
  assetGroups: AssetGroup[];
  totalAssets: number;
  totalLiabilities: number;
}

/** Light, minimal Home header: the two numbers that matter most (net worth + safe-to-spend),
 *  a slim asset bar, and a tap-through to the full breakdown. */
export function GlanceHeader({ summary, assetGroups, totalAssets, totalLiabilities }: Props) {
  const { shouldMask } = usePrivacy();
  const navigate = useNavigate();
  const { loading: forecastLoading, forecast } = useForecast();
  const [detailOpen, setDetailOpen] = useState(false);
  // Net worth is an aggregate, not a specific sensitive item — Safe Mode keeps it visible;
  // only Privacy Mode hides it (same as everywhere else "sensitive" defaults to false).
  const open = !shouldMask(false);

  const safe = Math.max(0, forecast.discretionary);
  const breached = forecast.bufferBreachMs !== null;
  const safeSub = forecastLoading
    ? ''
    : breached
      ? 'dips below your cushion soon'
      : forecast.daysToPayday !== null
        ? `${forecast.daysToPayday} day${forecast.daysToPayday === 1 ? '' : 's'} till payday`
        : `${forecast.daysLeft} days to month-end`;

  return (
    <>
      {/* Money hero — net worth + safe-to-spend, with the assets/liabilities bar inside the same card */}
      <div className="rounded-[18px] overflow-hidden surface mb-4">
        <div className="flex">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="flex-1 px-4 py-3.5 text-left active:bg-surface-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Net worth</p>
            <p className="text-[24px] font-bold tracking-tight text-primary leading-tight mt-0.5">
              {open ? formatCurrency(summary.netWorth) : '••••'}
            </p>
            <p className="text-[11px] text-tertiary mt-0.5 flex items-center gap-1">
              View breakdown <i className="ti ti-chevron-right" style={{ fontSize: 12 }} aria-hidden="true" />
            </p>
          </button>
          <button
            type="button"
            onClick={() => navigate(PATHS.app.cashflow)}
            className="flex-1 px-4 py-3.5 text-left border-l border-theme active:bg-surface-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Safe to spend</p>
            <p
              className="text-[24px] font-bold tracking-tight leading-tight mt-0.5"
              style={{ color: breached ? STATUS.danger : 'var(--color-primary)' }}
            >
              {open ? formatCurrency(safe) : '••••'}
            </p>
            <p className="text-[11px] text-tertiary mt-0.5 truncate">{safeSub}</p>
          </button>
        </div>

        {/* Slim asset bar + assets/liabilities line — inside the card */}
        {open && totalAssets > 0 && (
          <button type="button" onClick={() => setDetailOpen(true)} className="w-full px-4 pb-3.5 pt-0 text-left">
            <div className="flex rounded-full overflow-hidden mb-1.5" style={{ height: 6, gap: 2 }}>
              {assetGroups.map(({ ac, value, meta }) => (
                <div key={ac} style={{ flex: value / totalAssets, backgroundColor: meta.color }} />
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-tertiary">
              <span>
                Assets <span className="text-secondary font-medium">{formatCompact(totalAssets)}</span>
              </span>
              {totalLiabilities > 0 && (
                <span>
                  Liabilities{' '}
                  <span className="font-medium" style={{ color: STATUS.danger }}>
                    −{formatCompact(totalLiabilities)}
                  </span>
                </span>
              )}
            </div>
          </button>
        )}
      </div>

      {detailOpen && (
        <Modal onClose={() => setDetailOpen(false)} title="Net worth" scrollable>
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-secondary">Total</span>
              <span className="text-xl font-bold text-primary">{open ? formatCurrency(summary.netWorth) : '••••'}</span>
            </div>

            {/* Assets */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2">Assets</p>
              <div className="flex flex-col">
                {assetGroups.map(({ ac, value, meta }) => (
                  <button
                    key={ac}
                    onClick={() =>
                      ac === 'liquid'
                        ? navigate(PATHS.app.accounts)
                        : ac === 'iou'
                          ? navigate(PATHS.app.expenses, { state: { tab: 'iou' } })
                          : navigate(PATHS.app.portfolio, { state: { holdingsSubTab: assetSubTab(ac) } })
                    }
                    className="w-full flex items-center gap-3 py-2 text-left"
                  >
                    <IconBadge icon={meta.icon} color={meta.color} bg={`${meta.color}22`} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <p className="text-[13px] font-medium text-primary">{meta.label}</p>
                        {open && totalAssets > 0 && (
                          <p className="text-[10px] text-tertiary">{((value / totalAssets) * 100).toFixed(0)}%</p>
                        )}
                      </div>
                      <ProgressBar
                        value={open && totalAssets > 0 ? (value / totalAssets) * 100 : 0}
                        color={meta.color}
                        size="xs"
                      />
                    </div>
                    <p className="text-[13px] font-medium text-secondary flex-shrink-0">
                      {open ? formatCurrency(value) : '••••'}
                    </p>
                    <i
                      className="ti ti-chevron-right text-tertiary flex-shrink-0"
                      style={{ fontSize: 13 }}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Liabilities */}
            {(summary.liabilities.length > 0 ||
              summary.creditCardAccounts.some((c) => c.outstanding > 0) ||
              summary.netIou < 0) && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2">Liabilities</p>
                <div className="flex flex-col">
                  {summary.netIou < 0 && (
                    <button
                      onClick={() => navigate(PATHS.app.expenses, { state: { tab: 'iou' } })}
                      className="w-full flex items-center gap-3 py-2 text-left"
                    >
                      <IconBadge icon="ti-users" color={STATUS.danger} bg="var(--color-danger-subtle)" size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-primary truncate">Owed to others</p>
                        <p className="text-[10px] text-tertiary">IOU — you owe</p>
                      </div>
                      <p className="text-[13px] font-medium flex-shrink-0" style={{ color: STATUS.danger }}>
                        {open ? formatCurrency(-summary.netIou) : '••••'}
                      </p>
                    </button>
                  )}
                  {summary.creditCardAccounts
                    .filter((c) => c.outstanding > 0)
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => navigate(PATHS.app.accounts)}
                        className="w-full flex items-center gap-3 py-2 text-left"
                      >
                        <IconBadge icon={c.icon} color={STATUS.danger} bg="var(--color-danger-subtle)" size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-primary truncate">{c.name}</p>
                          <p className="text-[10px] text-tertiary">Credit card outstanding</p>
                        </div>
                        <p className="text-[13px] font-medium flex-shrink-0" style={{ color: STATUS.danger }}>
                          {open ? formatCurrency(c.outstanding) : '••••'}
                        </p>
                      </button>
                    ))}
                  {summary.liabilities.map((l) => {
                    const lMeta = LIABILITY_META[l.type] ?? { label: l.type, icon: 'ti-credit-card' };
                    return (
                      <button
                        key={l.id}
                        onClick={() => navigate(PATHS.app.loans)}
                        className="w-full flex items-center gap-3 py-2 text-left"
                      >
                        <IconBadge icon={lMeta.icon} color={STATUS.danger} bg="var(--color-danger-subtle)" size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-primary truncate">{l.name}</p>
                          {l.interestRate > 0 && <p className="text-[10px] text-tertiary">{l.interestRate}% p.a.</p>}
                        </div>
                        <p className="text-[13px] font-medium flex-shrink-0" style={{ color: STATUS.danger }}>
                          {open ? formatCurrency(l.outstandingAmount) : '••••'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
