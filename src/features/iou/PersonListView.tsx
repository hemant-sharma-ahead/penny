import { formatCurrency } from '@/lib/formatters';
import { Card, EmptyState, Banner } from '@/components/ui';
import { ListRow } from '@/components/shared';
import { STATUS, tint } from '@/lib/statusColors';
import type { PersonWithBalance } from './useIou';

interface PersonListViewProps {
  persons: PersonWithBalance[];
  overdueCount: number;
  masked: boolean;
  onOpen: (personId: string) => void;
}

/** Person-centric IOU list: one row per person showing the derived net balance. */
export function PersonListView({ persons, overdueCount, masked, onOpen }: PersonListViewProps) {
  if (persons.length === 0) {
    return (
      <div className="px-4 py-4">
        <EmptyState
          icon="ti-users"
          title="No IOUs yet"
          description="Track money lent to or borrowed from friends and family. Tap + to add one."
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      {overdueCount > 0 && (
        <Banner variant="danger">
          {overdueCount} {overdueCount === 1 ? 'balance is' : 'balances are'} overdue.
        </Banner>
      )}

      {persons.map(({ person, net, settled, overdue }) => {
        const color = settled ? STATUS.neutral : net > 0 ? STATUS.success : STATUS.danger;
        const label = settled
          ? 'Settled up'
          : net > 0
            ? `owes you ${masked ? '••••' : formatCurrency(net)}`
            : `you owe ${masked ? '••••' : formatCurrency(-net)}`;
        return (
          <Card key={person.id} onClick={() => onOpen(person.id)}>
            <ListRow
              icon={settled ? 'ti-check' : net > 0 ? 'ti-arrow-down-left' : 'ti-arrow-up-right'}
              iconColor={color}
              iconBg={tint(color)}
              iconSize="sm"
              align="center"
              title={<p className="text-sm font-semibold truncate text-primary">{person.name}</p>}
              subtitle={
                <p className="text-xs" style={{ color: settled ? 'var(--color-text-tertiary)' : color }}>
                  {label}
                  {overdue && ' · overdue'}
                </p>
              }
              right={<i className="ti ti-chevron-right text-tertiary" aria-hidden="true" />}
            />
          </Card>
        );
      })}
    </div>
  );
}
