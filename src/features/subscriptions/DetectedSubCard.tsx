import { Card, Button } from '@/components/ui';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { displayName, intervalLabel } from '@/core/subscriptions/format';
import type { DetectedSubscription } from '@/core/subscriptions/detector';

interface DetectedSubCardProps {
  candidate: DetectedSubscription;
  mode: 'open' | 'safe' | 'privacy';
  onConfirm: (c: DetectedSubscription) => void;
  onDismiss: (c: DetectedSubscription) => void;
}

export function DetectedSubCard({ candidate: c, mode, onConfirm, onDismiss }: DetectedSubCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary truncate">{displayName(c.merchantCategory)}</p>
          <p className="text-xs text-secondary mt-0.5">
            {mode === 'open' ? formatCurrency(c.detectedAmount) : '••••'} · {intervalLabel(c.intervalDays)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {c.status === 'trial' && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Trial</span>
          )}
          {c.priceCreep && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
              Price creep
            </span>
          )}
          {c.dormant && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-secondary">
              Dormant
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-tertiary">
        Seen {c.occurrenceCount} time{c.occurrenceCount !== 1 ? 's' : ''}
        {c.lastChargedAt !== undefined && ` · last ${formatDateShort(c.lastChargedAt)}`}
        {c.status === 'trial' && c.trialEndsAt !== undefined && (
          <span className="ml-1 text-blue-500">· trial may end {formatDateShort(c.trialEndsAt)}</span>
        )}
      </p>

      <div className="flex gap-2">
        <Button variant="primary" size="sm" fullWidth icon="ti-check" onClick={() => onConfirm(c)}>
          Confirm
        </Button>
        <Button variant="secondary" size="sm" fullWidth icon="ti-x" onClick={() => onDismiss(c)}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
