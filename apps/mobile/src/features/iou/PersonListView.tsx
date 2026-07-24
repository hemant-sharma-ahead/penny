import { View, Text } from 'react-native';
import { formatCurrency } from '@/lib/formatters';
import { Card, EmptyState, Banner } from '~/components/ui';
import { ListRow } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { PersonWithBalance } from './useIou';

interface PersonListViewProps {
  persons: PersonWithBalance[];
  overdueCount: number;
  masked: boolean;
  onOpen: (personId: string) => void;
}

/**
 * Person-centric IOU list: one row per person showing the derived net balance. RN port note: uses
 * `~/lib/color`'s `tint()` (real hex math), not `@/lib/statusColors`'s `tint()` (CSS `color-mix()` —
 * web-only, same distinction Track 3 already made for `Badge`/`Banner`).
 */
export function PersonListView({ persons, overdueCount, masked, onOpen }: PersonListViewProps) {
  const theme = useThemeColors();

  if (persons.length === 0) {
    return (
      <View className="px-4 py-4">
        <EmptyState
          icon="ti-users"
          title="No IOUs yet"
          description="Track money lent to or borrowed from friends and family. Tap + to add one."
        />
      </View>
    );
  }

  return (
    <View className="px-4 py-4 gap-3">
      {overdueCount > 0 && (
        <Banner variant="danger">
          {overdueCount} {overdueCount === 1 ? 'balance is' : 'balances are'} overdue.
        </Banner>
      )}

      {persons.map(({ person, net, settled, overdue }) => {
        const color = settled ? theme.neutral : net > 0 ? theme.success : theme.danger;
        const label = settled
          ? 'Settled up'
          : net > 0
            ? `owes you ${masked ? '••••' : formatCurrency(net)}`
            : `you owe ${masked ? '••••' : formatCurrency(-net)}`;
        return (
          <Card key={person.id} onPress={() => onOpen(person.id)}>
            <ListRow
              icon={settled ? 'ti-check' : net > 0 ? 'ti-arrow-down-left' : 'ti-arrow-up-right'}
              iconColor={color}
              iconBg={tint(color)}
              iconSize="sm"
              align="center"
              title={
                <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
                  {person.name}
                </Text>
              }
              subtitle={
                <Text className="text-xs" style={{ color: settled ? theme.textTertiary : color }}>
                  {label}
                  {overdue && ' · overdue'}
                </Text>
              }
              right={<Icon name="ti-chevron-right" size={16} color={theme.textTertiary} />}
            />
          </Card>
        );
      })}
    </View>
  );
}
