import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui';
import { usePrivacy } from '@/context/PrivacyContext';
import { useForecast } from '@/hooks/useForecast';
import { formatCurrency } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';
import { PATHS } from '@/router/paths';

/** Compact "safe to spend" entry point on Home — taps through to the Cash Flow forecast. */
export function SafeToSpendCard() {
  const navigate = useNavigate();
  const { mode } = usePrivacy();
  const { loading, forecast } = useForecast();

  if (loading) return null;
  const safe = Math.max(0, forecast.discretionary);
  const breached = forecast.bufferBreachMs !== null;
  const open = mode === 'open';

  const subline = breached
    ? 'Heads up — your balance dips below your cushion soon'
    : forecast.daysToPayday !== null
      ? `to last ${forecast.daysToPayday} day${forecast.daysToPayday === 1 ? '' : 's'} till payday`
      : `to last till month-end (${forecast.daysLeft} days)`;

  return (
    <Card radius="lg" onClick={() => navigate(PATHS.app.cashflow)} className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: breached ? 'var(--color-danger-subtle)' : 'var(--color-surface-2)' }}
      >
        <i
          className={`ti ${breached ? 'ti-alert-triangle' : 'ti-wallet'}`}
          style={{ fontSize: 20, color: breached ? STATUS.danger : 'var(--color-primary)' }}
          aria-hidden="true"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-secondary">Safe to spend</p>
        <p className="text-lg font-semibold text-primary leading-tight">{open ? formatCurrency(safe) : '••••'}</p>
        <p className="text-[11px] text-tertiary truncate">{subline}</p>
      </div>
      <i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 18 }} aria-hidden="true" />
    </Card>
  );
}
