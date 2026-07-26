import { Card, Button, Badge } from '@/components/ui';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';
import { displayName, intervalLabel } from '@/core/subscriptions/format';
import type { DetectedSubscription } from '@/core/subscriptions/detector';

interface DetectedSubCardProps {
  candidate: DetectedSubscription;
  masked: boolean;
  onConfirm: (c: DetectedSubscription) => void;
  onDismiss: (c: DetectedSubscription) => void;
}

export function DetectedSubCard({ candidate: c, masked, onConfirm, onDismiss }: DetectedSubCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary truncate">{displayName(c.merchantCategory)}</p>
          <p className="text-xs text-secondary mt-0.5">
            {!masked ? formatCurrency(c.detectedAmount) : '••••'} · {intervalLabel(c.intervalDays)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {c.status === 'trial' && <Badge label="Trial" color={STATUS.info} size="sm" />}
          {c.priceCreep && <Badge label="Price creep" color={STATUS.warning} size="sm" />}
          {c.dormant && <Badge label="Dormant" color={STATUS.neutral} size="sm" />}
        </div>
      </div>

      <p className="text-xs text-tertiary">
        Seen {c.occurrenceCount} time{c.occurrenceCount !== 1 ? 's' : ''}
        {c.lastChargedAt !== undefined && ` · last ${formatDateShort(c.lastChargedAt)}`}
        {c.status === 'trial' && c.trialEndsAt !== undefined && (
          <span className="ml-1 text-info">· trial may end {formatDateShort(c.trialEndsAt)}</span>
        )}
      </p>

      {c.priceCreep && c.latestAmount > c.firstAmount && !masked && (
        <p className="text-xs text-warning">
          <i className="ti ti-trending-up" style={{ fontSize: 12 }} aria-hidden="true" /> Price rose{' '}
          {formatCurrency(c.firstAmount)} → {formatCurrency(c.latestAmount)} (+
          {Math.round(((c.latestAmount - c.firstAmount) / c.firstAmount) * 100)}%)
        </p>
      )}

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
