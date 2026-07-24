import { View, Text, Pressable } from 'react-native';
import type { LedgerEntry, Person } from '@/core/db/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { Modal, Button, Badge } from '~/components/ui';
import { ListRow, DueDateBadge } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { ThemeTokens } from '@penny/core/theme/tokens';
import { isSettled } from '@/core/iou/ledger';

interface PersonLedgerViewProps {
  person: Person;
  /** Entries for this person, sorted newest-first. */
  entries: LedgerEntry[];
  net: number;
  masked: boolean;
  nowMs: number;
  onAddEntry: () => void;
  onSettle: () => void;
  onEditPerson: () => void;
  onEditEntry: (entry: LedgerEntry) => void;
  onDeleteEntry: (id: string) => void;
  onClose: () => void;
}

function entryLabel(e: LedgerEntry): string {
  if (e.kind === 'settlement') return e.settleDirection === 'you_paid_them' ? 'You paid' : 'They paid you';
  return e.kind === 'lent' ? 'You lent' : 'You borrowed';
}

function entryColor(e: LedgerEntry, theme: ThemeTokens): string {
  if (e.kind === 'settlement') return theme.neutral;
  return e.kind === 'lent' ? theme.success : theme.danger;
}

export function PersonLedgerView({
  person,
  entries,
  net,
  masked,
  nowMs,
  onAddEntry,
  onSettle,
  onEditPerson,
  onEditEntry,
  onDeleteEntry,
  onClose
}: PersonLedgerViewProps) {
  const theme = useThemeColors();
  const settled = isSettled(net);
  const headColor = settled ? theme.neutral : net > 0 ? theme.success : theme.danger;
  const headLabel = settled ? 'All settled up' : net > 0 ? `${person.name} owes you` : `You owe ${person.name}`;
  const headAmount = masked ? '••••' : formatCurrency(Math.abs(net));

  return (
    <Modal
      onClose={onClose}
      title={person.name}
      scrollable
      footer={
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button variant="secondary" icon="ti-plus" onPress={onAddEntry} fullWidth>
              Add entry
            </Button>
          </View>
          <View className="flex-1">
            <Button variant="primary" icon="ti-check" onPress={onSettle} fullWidth>
              Settle up
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs text-tertiary">{headLabel}</Text>
            {!settled && (
              <Text className="text-2xl font-bold" style={{ color: headColor }}>
                {headAmount}
              </Text>
            )}
          </View>
          <Pressable
            onPress={onEditPerson}
            className="w-9 h-9 items-center justify-center rounded-lg"
            accessibilityLabel="Edit person"
          >
            <Icon name="ti-pencil" size={16} color={theme.textTertiary} />
          </Pressable>
        </View>

        <View className="gap-2">
          {entries.map((e) => {
            const color = entryColor(e, theme);
            const linked = !!e.linkedTxnId;
            // Manual lent/borrowed entries are editable (editing re-syncs any linked transaction).
            // Expense-origin entries are owned by their expense — edit there; settlements aren't edited.
            const editable = e.kind !== 'settlement' && e.origin !== 'expense';
            const row = (
              <ListRow
                icon={
                  e.kind === 'settlement' ? 'ti-check' : e.kind === 'lent' ? 'ti-arrow-up-right' : 'ti-arrow-down-left'
                }
                iconColor={color}
                iconBg={tint(color)}
                iconSize="sm"
                align="center"
                title={
                  <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                    {e.description?.trim() || entryLabel(e)}
                  </Text>
                }
                subtitle={
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-xs text-tertiary">
                      {entryLabel(e)} · {formatDateShort(e.date)}
                    </Text>
                    {linked && <Badge label="in account" color={theme.info} size="sm" />}
                  </View>
                }
                right={
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold" style={{ color }}>
                      {masked ? '••••' : formatCurrency(e.amount)}
                    </Text>
                    {e.dueDate !== undefined && e.kind !== 'settlement' && (
                      <DueDateBadge dueDateMs={e.dueDate} nowMs={nowMs} />
                    )}
                    {!editable && (
                      <Pressable
                        onPress={() => onDeleteEntry(e.id)}
                        className="w-7 h-7 items-center justify-center rounded-lg"
                        accessibilityLabel="Delete entry"
                      >
                        <Icon name="ti-trash" size={13} color={theme.textTertiary} />
                      </Pressable>
                    )}
                  </View>
                }
              />
            );
            return (
              <View key={e.id} className="rounded-xl px-3 py-2 bg-surface-2">
                {editable ? <Pressable onPress={() => onEditEntry(e)}>{row}</Pressable> : row}
              </View>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
