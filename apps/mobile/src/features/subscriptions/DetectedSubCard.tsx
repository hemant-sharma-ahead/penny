import { View, Text } from 'react-native';
import { Card, Button, Badge } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { displayName, intervalLabel } from '@/core/subscriptions/format';
import type { DetectedSubscription } from '@/core/subscriptions/detector';
import { useThemeColors } from '~/theme/useThemeColors';

interface DetectedSubCardProps {
  candidate: DetectedSubscription;
  masked: boolean;
  onConfirm: (c: DetectedSubscription) => void;
  onDismiss: (c: DetectedSubscription) => void;
}

export function DetectedSubCard({ candidate: c, masked, onConfirm, onDismiss }: DetectedSubCardProps) {
  const theme = useThemeColors();

  return (
    <Card className="gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
            {displayName(c.merchantCategory)}
          </Text>
          <Text className="text-xs text-secondary mt-0.5">
            {!masked ? formatCurrency(c.detectedAmount) : '••••'} · {intervalLabel(c.intervalDays)}
          </Text>
        </View>
        <View className="items-end gap-1">
          {c.status === 'trial' && <Badge label="Trial" color={theme.info} size="sm" />}
          {c.priceCreep && <Badge label="Price creep" color={theme.warning} size="sm" />}
          {c.dormant && <Badge label="Dormant" color={theme.neutral} size="sm" />}
        </View>
      </View>

      <Text className="text-xs text-tertiary">
        Seen {c.occurrenceCount} time{c.occurrenceCount !== 1 ? 's' : ''}
        {c.lastChargedAt !== undefined && ` · last ${formatDateShort(c.lastChargedAt)}`}
        {c.status === 'trial' && c.trialEndsAt !== undefined && (
          <Text style={{ color: theme.info }}> · trial may end {formatDateShort(c.trialEndsAt)}</Text>
        )}
      </Text>

      {c.priceCreep && c.latestAmount > c.firstAmount && !masked && (
        <View className="flex-row items-center gap-1">
          <Icon name="ti-trending-up" size={12} color={theme.warning} />
          <Text className="text-xs" style={{ color: theme.warning }}>
            Price rose {formatCurrency(c.firstAmount)} → {formatCurrency(c.latestAmount)} (+
            {Math.round(((c.latestAmount - c.firstAmount) / c.firstAmount) * 100)}%)
          </Text>
        </View>
      )}

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button variant="primary" size="sm" fullWidth icon="ti-check" onPress={() => onConfirm(c)}>
            Confirm
          </Button>
        </View>
        <View className="flex-1">
          <Button variant="secondary" size="sm" fullWidth icon="ti-x" onPress={() => onDismiss(c)}>
            Dismiss
          </Button>
        </View>
      </View>
    </Card>
  );
}
