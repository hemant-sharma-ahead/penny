import { View, Text } from 'react-native';
import type { InsurancePolicy, InsuranceType } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { getPolicyMeta } from '@/core/insurance/meta';
import { Card, DetailRow } from '~/components/ui';
import { Icon } from '~/components/Icon';

const COVER_TYPES: InsuranceType[] = ['term', 'life', 'health'];

interface CoverageSummaryProps {
  policies: InsurancePolicy[];
  totalAnnualPremium: number;
  masked: boolean;
}

export function CoverageSummary({ policies, totalAnnualPremium, masked }: CoverageSummaryProps) {
  return (
    <Card padding="sm" radius="md" className="mt-1">
      <Text className="text-xs font-medium mb-2 text-secondary">Coverage summary</Text>
      <View className="gap-1.5">
        {COVER_TYPES.map((t) => {
          const total = policies.filter((p) => p.type === t).reduce((s, p) => s + p.coverageAmount, 0);
          if (total === 0) return null;
          const m = getPolicyMeta(t);
          return (
            <DetailRow
              key={t}
              label={
                <View className="flex-row items-center gap-1.5">
                  <Icon name={m.icon} size={12} color={m.color} />
                  <Text className="text-xs text-secondary">{m.label} cover</Text>
                </View>
              }
              value={!masked ? formatCurrency(total) : '••••'}
            />
          );
        })}
        <DetailRow
          className="pt-1.5 mt-0.5 border-t border-theme"
          label="Total annual premium"
          value={!masked ? formatCurrency(totalAnnualPremium) : '••••'}
        />
      </View>
    </Card>
  );
}
