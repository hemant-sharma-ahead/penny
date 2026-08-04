import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import type { PaymentMode } from '@/core/db/types';
import { expensesRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { usePaymentModes } from '~/hooks/usePaymentModes';
import { Icon } from '~/components/Icon';
import { Card, SectionLabel } from '~/components/ui';
import { PaymentModeFormModal } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';

/**
 * Manage payment modes from the Accounts page: view every mode (built-in + custom) as an icon
 * tile with a small pencil badge, tap to edit (icon/colour/label — defaults included, same as a
 * default expense category) or add a new one. Delete (custom, unused modes only) lives inside the
 * same edit popup — see `PaymentModeFormModal.tsx`.
 */
export function PaymentModesSection() {
  const theme = useThemeColors();
  const { modes, save, remove } = usePaymentModes();
  const { items: expenses } = useRepository(expensesRepo);
  const [editingMode, setEditingMode] = useState<PaymentMode | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const usageCountByMode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of expenses) {
      if (!e.paymentMode) continue;
      counts.set(e.paymentMode, (counts.get(e.paymentMode) ?? 0) + 1);
    }
    return counts;
  }, [expenses]);

  if (modes.length === 0) return null;

  return (
    <View className="px-4 pb-4">
      <SectionLabel>Payment modes</SectionLabel>
      <Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {modes.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setEditingMode(m)}
              className="items-center gap-1 w-[56px]"
              accessibilityLabel={`Edit ${m.label}`}
            >
              <View>
                <View
                  className="w-9 h-9 rounded-[10px] items-center justify-center"
                  style={{ backgroundColor: m.color }}
                >
                  <Icon name={m.icon} size={15} color="#fff" />
                </View>
                <View
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full items-center justify-center border"
                  style={{ backgroundColor: theme.surface, borderColor: theme.border }}
                >
                  <Icon name="ti-pencil" size={9} color={theme.textTertiary} />
                </View>
              </View>
              <Text className="text-[8px] font-medium leading-tight text-secondary text-center" numberOfLines={1}>
                {m.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setShowAddForm(true)}
            className="items-center gap-1 w-[56px]"
            accessibilityLabel="Add payment mode"
          >
            <View
              className="w-9 h-9 rounded-[10px] items-center justify-center border"
              style={{ borderColor: theme.border, borderStyle: 'dashed' }}
            >
              <Icon name="ti-plus" size={15} color={theme.textTertiary} />
            </View>
            <Text className="text-[8px] font-medium leading-tight text-tertiary text-center">Add</Text>
          </Pressable>
        </ScrollView>
      </Card>

      {editingMode && (
        <PaymentModeFormModal
          existing={modes}
          editing={editingMode}
          usageCount={usageCountByMode.get(editingMode.id) ?? 0}
          onSave={async (mode) => {
            await save(mode);
            setEditingMode(null);
          }}
          onDelete={async (id) => {
            await remove(id);
            setEditingMode(null);
          }}
          onClose={() => setEditingMode(null)}
        />
      )}

      {showAddForm && (
        <PaymentModeFormModal
          existing={modes}
          onSave={async (mode) => {
            await save(mode);
            setShowAddForm(false);
          }}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </View>
  );
}
