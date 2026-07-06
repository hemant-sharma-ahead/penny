import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '@/context/PrivacyContext';
import { useSettings } from '@/context/SettingsContext';
import { formatCurrency } from '@/lib/formatters';
import { formatDateShort } from '@/lib/date';
import { Card, EmptyState, SegmentedControl, Banner, Button, Modal, AmountInput } from '@/components/ui';
import { STATUS, ink } from '@/lib/statusColors';
import type { BalanceForecast } from '@/core/cashflow/forecaster';
import { useCashFlow } from './useCashFlow';
import { useIncomeSuggestions } from './useIncomeSuggestions';
import { CashFlowTimeline } from './CashFlowTimeline';

const HORIZON_LABEL: Record<string, string> = {
  month: 'this month',
  quarter: 'over 3 months',
  halfyear: 'over 6 months'
};

/** Human cadence for a detected interval in days. */
function intervalLabel(days: number): string {
  if (days <= 7) return 'week';
  if (days <= 14) return '2 weeks';
  if (days <= 31) return 'month';
  if (days <= 92) return 'quarter';
  return 'year';
}

/** Compact SVG sparkline of the projected daily balance, with the buffer floor marked. */
function BalanceSparkline({ forecast, buffer }: { forecast: BalanceForecast; buffer: number }) {
  const pts = forecast.daily;
  if (pts.length < 2) return null;
  const W = 320;
  const H = 64;
  const values = pts.map((p) => p.balance);
  const min = Math.min(...values, buffer);
  const max = Math.max(...values, buffer);
  const span = max - min || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * H;
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const lowIdx = pts.findIndex((p) => p.balance === forecast.lowest.balance);
  const breached = forecast.bufferBreachMs !== null;
  const stroke = breached ? STATUS.danger : 'var(--color-primary)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">
      {buffer > min && (
        <line
          x1={0}
          y1={y(buffer)}
          x2={W}
          y2={y(buffer)}
          stroke={STATUS.warning}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.7}
        />
      )}
      <path d={`${path} L${W},${H} L0,${H} Z`} fill={stroke} opacity={0.08} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {lowIdx >= 0 && <circle cx={x(lowIdx)} cy={y(forecast.lowest.balance)} r={3} fill={stroke} />}
    </svg>
  );
}

export function CashFlowPage() {
  const navigate = useNavigate();
  const { shouldMask } = usePrivacy();
  const { cashflowBuffer, setCashflowBuffer } = useSettings();
  const {
    horizon,
    setHorizon,
    loading,
    grouped,
    total,
    summaryParts,
    todayStart,
    startBalance,
    forecast,
    nowMs,
    reload
  } = useCashFlow();
  const { suggestions, confirm, dismiss } = useIncomeSuggestions(nowMs, reload);
  const incomeSuggestion = suggestions[0];

  const [showBuffer, setShowBuffer] = useState(false);
  const [bufferDraft, setBufferDraft] = useState(String(cashflowBuffer));

  // Cash-flow forecast is an aggregate projection, not a specific sensitive item — visible in Safe Mode,
  // hidden only in Privacy Mode (same treatment as Home's net worth).
  const masked = shouldMask(false);
  const open = !masked;
  const money = (n: number) => (open ? formatCurrency(n) : '••••');
  const horizonLabel = HORIZON_LABEL[horizon] ?? 'this month';

  const safe = Math.max(0, forecast.discretionary);
  const overcommitted = forecast.discretionary < 0;
  const paydayLine =
    forecast.daysToPayday !== null
      ? `to last the next ${forecast.daysToPayday} day${forecast.daysToPayday === 1 ? '' : 's'} till payday`
      : `to last till month-end (${forecast.daysLeft} days)`;

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Back"
            className="w-8 h-8 rounded-lg hover:text-primary -ml-1"
            onClick={() => navigate(-1)}
          />
          <h2 className="text-xl font-semibold text-primary">Cash Flow</h2>
        </div>
        <div className="w-44">
          <SegmentedControl
            options={[
              { value: 'month', label: '1M' },
              { value: 'quarter', label: '3M' },
              { value: 'halfyear', label: '6M' }
            ]}
            value={horizon}
            onChange={setHorizon}
          />
        </div>
      </div>

      {/* Safe-to-spend hero */}
      <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
        <p className="text-sm opacity-75 mb-1">Safe to spend</p>
        <p className="text-3xl font-semibold tracking-tight">{money(safe)}</p>
        {!loading && (
          <p className="text-sm opacity-80 mt-1">
            {overcommitted ? 'Upcoming commitments exceed your balance' : paydayLine}
          </p>
        )}
        {!loading && !overcommitted && safe > 0 && (
          <p className="text-xs opacity-70 mt-2">≈ {money(Math.floor(forecast.perDay))}/day</p>
        )}
      </div>

      {/* Recurring-income suggestion */}
      {incomeSuggestion && (
        <Card radius="lg" className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--color-surface-2)' }}
            >
              <i className="ti ti-cash" style={{ fontSize: 18, color: STATUS.success }} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary">Recurring income detected</p>
              <p className="text-xs text-secondary mt-0.5">
                {money(incomeSuggestion.detectedAmount)} from “{incomeSuggestion.label}” every{' '}
                {intervalLabel(incomeSuggestion.intervalDays)}. Add it to sharpen your forecast and payday countdown.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" fullWidth onClick={() => dismiss(incomeSuggestion)}>
              Not recurring
            </Button>
            <Button size="sm" fullWidth onClick={() => void confirm(incomeSuggestion)}>
              Add to forecast
            </Button>
          </div>
        </Card>
      )}

      {/* Low-balance warning */}
      {!loading && forecast.bufferBreachMs !== null && (
        <Banner variant="danger">
          Your balance is projected to dip to <strong>{money(forecast.lowest.balance)}</strong> on{' '}
          {formatDateShort(forecast.lowest.dayMs)} — below your {money(cashflowBuffer)} safety cushion.
        </Banner>
      )}

      {/* Balance projection */}
      {!loading && (
        <Card radius="lg" className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-secondary">Balance now</span>
            <span className="font-semibold text-primary">{money(startBalance)}</span>
          </div>
          <BalanceSparkline forecast={forecast} buffer={cashflowBuffer} />
          <div className="flex items-center justify-between text-xs">
            <span className="text-tertiary">
              Lowest {money(forecast.lowest.balance)} · {formatDateShort(forecast.lowest.dayMs)}
            </span>
            <span style={{ color: forecast.netFlow >= 0 ? STATUS.success : STATUS.danger }}>
              Net {forecast.netFlow >= 0 ? '+' : '−'}
              {money(Math.abs(forecast.netFlow))} {horizonLabel}
            </span>
          </div>
        </Card>
      )}

      {/* Buffer editor */}
      <button
        onClick={() => {
          setBufferDraft(String(cashflowBuffer));
          setShowBuffer(true);
        }}
        className="flex items-center justify-between text-sm rounded-xl border border-theme bg-surface-2 px-3 py-2.5"
      >
        <span className="text-secondary">Safety cushion</span>
        <span className="flex items-center gap-1.5 font-medium text-primary">
          {money(cashflowBuffer)}
          <i
            className="ti ti-pencil"
            style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}
            aria-hidden="true"
          />
        </span>
      </button>

      {/* Upcoming payments */}
      {loading && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl h-16 animate-pulse bg-surface-2" />
          ))}
        </div>
      )}

      {!loading && grouped.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">Upcoming payments</h3>
            <span className="text-xs text-tertiary">
              {money(total)} · {summaryParts.join(' · ')}
            </span>
          </div>
          <CashFlowTimeline grouped={grouped} todayStart={todayStart} masked={masked} />
        </div>
      )}

      {!loading && grouped.length === 0 && (
        <Card radius="md" className="text-center">
          <EmptyState
            icon="ti-calendar-check"
            title="No upcoming payments"
            description="Add loans, subscriptions, or recurring expenses to see your cash flow forecast."
          />
        </Card>
      )}

      <p className="text-xs text-center leading-relaxed text-tertiary">
        Projected from your accounts, loans, subscriptions, renewals, and recurring income & expenses. Actual amounts
        may vary.
      </p>

      {showBuffer && (
        <Modal
          size="sm"
          title="Safety cushion"
          onClose={() => setShowBuffer(false)}
          footer={
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setShowBuffer(false)}>
                Cancel
              </Button>
              <Button
                fullWidth
                onClick={() => {
                  setCashflowBuffer(Number(bufferDraft) || 0);
                  setShowBuffer(false);
                }}
              >
                Save
              </Button>
            </div>
          }
        >
          <p className="text-sm text-secondary mb-3">
            The minimum balance Penny keeps in reserve. Safe-to-spend and the low-balance warning are measured against
            this cushion.
          </p>
          <AmountInput label="Cushion amount" value={bufferDraft} onChange={setBufferDraft} autoFocus />
          <p className="mt-3 text-xs" style={{ color: ink(STATUS.info) }}>
            Tip: one month of essential expenses makes a solid cushion.
          </p>
        </Modal>
      )}
    </div>
  );
}
