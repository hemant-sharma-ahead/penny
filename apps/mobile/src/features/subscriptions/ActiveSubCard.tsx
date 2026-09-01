import { View, Text } from 'react-native';
import { Card, Button, Badge, Banner } from '~/components/ui';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/formatters';
import { daysBetween } from '@/lib/date';
import { displayName, intervalLabel, toAnnual, nextRenewal, isDormant } from '@/core/subscriptions/format';
import type { Subscription } from '@/core/db/types';
import { useThemeColors } from '~/theme/useThemeColors';

interface ActiveSubCardProps {
  sub: Subscription;
  nowMs: number;
  masked: boolean;
  onCancel: (sub: Subscription) => void;
}

export function ActiveSubCard({ sub, nowMs, masked, onCancel }: ActiveSubCardProps) {
  const theme = useThemeColors();
  const annual = toAnnual(sub.detectedAmount, sub.intervalDays);
  const renewMs = nextRenewal(sub, nowMs);
  const dormant = isDormant(sub, nowMs);
  const money = (n: number) => (!masked ? formatCurrency(n) : '••••');

  const renewLabel = (() => {
    if (renewMs === null) return null;
    const d = daysBetween(nowMs, renewMs);
    if (d <= 0) return 'Renews today';
    if (d === 1) return 'Renews tomorrow';
    return `Renews in ${d} days · ${formatDateShort(renewMs)}`;
  })();

  return (
    <Card className="gap-2">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
              {displayName(sub.merchantCategory)}
            </Text>
            {sub.status === 'trial' && <Badge label="Trial" color={theme.info} size="sm" />}
          </View>
          <Text className="text-xs text-secondary mt-0.5">
            {money(sub.detectedAmount)} · {intervalLabel(sub.intervalDays)}
            {!masked && <Text className="text-tertiary"> · {formatCurrency(annual)}/yr</Text>}
          </Text>
          {renewLabel && <Text className="text-xs text-tertiary mt-0.5">{renewLabel}</Text>}
          {sub.status === 'trial' && sub.trialEndsAt !== undefined && (
            <Text className="text-xs mt-0.5" style={{ color: theme.info }}>
              Trial may end {formatDateShort(sub.trialEndsAt)}
            </Text>
          )}
        </View>
        <Button variant="secondary" size="sm" onPress={() => onCancel(sub)}>
          Cancel
        </Button>
      </View>

      {dormant && sub.lastChargedAt !== undefined && (
        <Banner variant="warning" icon="ti-zzz">
          Looks unused — last charged {formatDate(sub.lastChargedAt)}. Cancelling saves{' '}
          {!masked ? formatCurrency(annual) : '••••'}/yr.
        </Banner>
      )}
    </Card>
  );
}
