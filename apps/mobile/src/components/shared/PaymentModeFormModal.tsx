import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { PaymentMode } from '@/core/db/types';
import { CAT_COLORS } from '@/core/expenses/categoryIcons';
import { generatePaymentModeId } from '@/core/expenses/paymentModes';
import { Modal, Button, ConfirmDialog, TextInput } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { IconGridPicker } from './IconGridPicker';

interface PaymentModeFormModalProps {
  /** Every mode that already exists (defaults + custom) — only needed to keep a new id unique. */
  existing: PaymentMode[];
  /** undefined ⇒ create mode. Present ⇒ edit mode — a default mode's icon/colour/label can still be
   *  changed (same as a default `ExpenseCategory`), just never deleted. */
  editing?: PaymentMode;
  /** How many expenses currently use this mode — delete is blocked while > 0 (editing only). */
  usageCount?: number;
  onSave: (mode: PaymentMode) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}

/** Create OR edit a payment mode — reached from `PaymentModeChips`' "+ Add" tile (create only) and
 *  the Accounts page's payment-modes list (create + edit + delete, `features/accounts/PaymentModesSection.tsx`). */
export function PaymentModeFormModal({
  existing,
  editing,
  usageCount = 0,
  onSave,
  onDelete,
  onClose
}: PaymentModeFormModalProps) {
  const theme = useThemeColors();
  const [label, setLabel] = useState(editing?.label ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? 'ti-cash');
  const [color, setColor] = useState(editing?.color ?? CAT_COLORS[0] ?? '#ef4444');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canDelete = !!editing && !editing.isDefault && usageCount === 0;
  const blockedDelete = !!editing && !editing.isDefault && usageCount > 0;

  async function handleSave() {
    if (!label.trim()) return;
    setSaving(true);
    const now = Date.now();
    try {
      await onSave({
        id: editing?.id ?? generatePaymentModeId(label.trim(), existing),
        label: label.trim(),
        icon,
        color,
        isDefault: editing?.isDefault ?? false,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(editing.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        scrollable
        onClose={onClose}
        title={editing ? 'Edit payment mode' : 'New payment mode'}
        footer={
          <Button fullWidth color={color} loading={saving} disabled={!label.trim()} onPress={() => void handleSave()}>
            {editing ? 'Save changes' : 'Add payment mode'}
          </Button>
        }
      >
        <TextInput
          label="Name"
          placeholder="e.g. Postal Order, Crypto Wallet"
          value={label}
          onChange={setLabel}
          autoFocus
        />

        <View>
          <Text className="text-xs font-medium text-secondary mb-1.5">Icon</Text>
          <IconGridPicker value={icon} onChange={setIcon} color={color} />
        </View>

        <View>
          <Text className="text-xs font-medium text-secondary mb-1.5">Colour</Text>
          <View className="flex-row items-center flex-wrap gap-2">
            {CAT_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? theme.textPrimary : 'transparent',
                  transform: [{ scale: color === c ? 1.15 : 1 }]
                }}
                accessibilityLabel={`Colour ${c}`}
              />
            ))}
          </View>
        </View>

        {blockedDelete && (
          <Text className="text-xs text-tertiary">
            {usageCount} transaction{usageCount === 1 ? '' : 's'} use this payment mode — it can't be deleted while
            still in use.
          </Text>
        )}

        {canDelete && onDelete && (
          <Button variant="danger" fullWidth icon="ti-trash" onPress={() => setConfirmDelete(true)}>
            Delete payment mode
          </Button>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
        title="Delete payment mode"
        message={`Delete "${editing?.label}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={saving}
      />
    </>
  );
}
