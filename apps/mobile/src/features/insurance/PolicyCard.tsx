import { View, Text } from 'react-native';
import type { InsurancePolicy } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { startOfToday } from '@/lib/date';
import { getPolicyMeta } from '@/core/insurance/meta';
import { Card, Badge } from '~/components/ui';
import { ListRow, DueDateBadge } from '~/components/shared';

interface PolicyCardProps {
  policy: InsurancePolicy;
  masked: boolean;
  onEdit: (p: InsurancePolicy) => void;
}

export function PolicyCard({ policy, masked, onEdit }: PolicyCardProps) {
  const meta = getPolicyMeta(policy.type);

  return (
    <Card onPress={() => onEdit(policy)}>
      <ListRow
        icon={meta.icon}
        iconColor={meta.color}
        title={
          <>
            <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
              {policy.insurer}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge label={meta.label} color={meta.color} variant="solid" size="sm" />
              {policy.policyNumber && <Text className="text-[10px] text-tertiary">{policy.policyNumber}</Text>}
            </View>
          </>
        }
        subtitle={
          <View className="flex-row items-center gap-3 mt-1.5">
            <View>
              <Text className="text-[10px] text-tertiary">Coverage</Text>
              <Text className="text-xs font-semibold text-primary">
                {!masked ? formatCurrency(policy.coverageAmount) : '••••'}
              </Text>
            </View>
            <View className="w-px h-6 border-r border-theme" />
            <View>
              <Text className="text-[10px] text-tertiary">Premium / yr</Text>
              <Text className="text-xs font-semibold text-primary">
                {!masked ? formatCurrency(policy.annualPremium) : '••••'}
              </Text>
            </View>
            {policy.nominees && (
              <>
                <View className="w-px h-6 border-r border-theme" />
                <View className="flex-1">
                  <Text className="text-[10px] text-tertiary">Nominee</Text>
                  <Text className="text-xs text-secondary" numberOfLines={1}>
                    {policy.nominees}
                  </Text>
                </View>
              </>
            )}
          </View>
        }
        right={
          <DueDateBadge dueDateMs={policy.renewalDate} nowMs={startOfToday()} warningDays={7} expiredLabel="Expired" />
        }
      />
    </Card>
  );
}
