import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Button, ConfirmDialog, Modal, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import type { ExpenseCategory } from '@/core/db/types';
import { CAT_COLORS } from '@/core/expenses/categoryIcons';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';

interface Props {
  /** undefined ⇒ create mode */
  editing?: ExpenseCategory;
  /** number of child categories under the parent (edit mode — gates delete) */
  childCount?: number;
  type: 'expense' | 'income';
  onCreate: (parent: ExpenseCategory, children: ExpenseCategory[]) => Promise<void>;
  onSave: (parent: ExpenseCategory) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export function ParentEditorModal({ editing, childCount = 0, type, onCreate, onSave, onDelete, onClose }: Props) {
  const theme = useThemeColors();
  const [name, setName] = useState(editing?.name ?? '');
  const [color, setColor] = useState(editing?.color ?? CAT_COLORS[4] ?? '#8b5cf6');
  const [childInput, setChildInput] = useState('');
  const [children, setChildren] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCreate = !editing;

  function addChild() {
    const n = childInput.trim();
    if (!n || children.some((c) => c.toLowerCase() === n.toLowerCase())) return;
    setChildren((prev) => [...prev, n]);
    setChildInput('');
  }

  async function handleSubmit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (isCreate) {
        if (children.length === 0) return;
        const parent: ExpenseCategory = {
          id: `catgrp-${crypto.randomUUID().slice(0, 8)}`,
          name: name.trim(),
          icon: 'ti-folder',
          color,
          isDefault: false,
          isGroup: true,
          applicableTo: type,
          createdAt: Date.now()
        };
        const now = Date.now();
        const childCats: ExpenseCategory[] = children.map((cn) => ({
          id: `cat-custom-${crypto.randomUUID().slice(0, 8)}`,
          name: cn,
          icon: 'ti-dots',
          color,
          isDefault: false,
          applicableTo: type,
          createdAt: now
        }));
        await onCreate(parent, childCats);
      } else {
        await onSave({ ...editing, name: name.trim(), color });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setBusy(true);
    try {
      await onDelete(editing.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const saveDisabled = !name.trim() || (isCreate && children.length === 0);

  return (
    <>
      <Modal
        scrollable
        onClose={onClose}
        title={isCreate ? 'New group' : 'Edit group'}
        footer={
          <Button fullWidth color={color} loading={busy} disabled={saveDisabled} onPress={() => void handleSubmit()}>
            {isCreate ? 'Create group' : 'Save'}
          </Button>
        }
      >
        <TextInput label="Group name" placeholder="e.g. Side business" value={name} onChange={setName} autoFocus />

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

        {isCreate && (
          <View>
            <Text className="text-xs font-medium text-secondary mb-1.5">
              Categories in this group <Text className="text-tertiary">(at least one required)</Text>
            </Text>
            <View className="flex-row gap-2 items-end">
              <View className="flex-1">
                <TextInput placeholder="Category name" value={childInput} onChange={setChildInput} />
              </View>
              <Button variant="secondary" size="md" icon="ti-plus" disabled={!childInput.trim()} onPress={addChild}>
                Add
              </Button>
            </View>
            {children.length > 0 && (
              <View className="flex-row flex-wrap gap-1.5 mt-2">
                {children.map((c, i) => (
                  <View
                    key={c}
                    className="flex-row items-center gap-1 px-2 py-1 rounded-full"
                    style={{ backgroundColor: tint(color, 13) }}
                  >
                    <Text className="text-xs" style={{ color }}>
                      {c}
                    </Text>
                    <Pressable
                      onPress={() => setChildren((prev) => prev.filter((_, idx) => idx !== i))}
                      accessibilityLabel={`Remove ${c}`}
                    >
                      <Icon name="ti-x" size={11} color={color} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Text className="text-[11px] text-tertiary mt-2">
              You can change each category's icon and colour later from the picker.
            </Text>
          </View>
        )}

        {!isCreate && childCount === 0 && (
          <Button variant="danger" fullWidth icon="ti-trash" onPress={() => setConfirmDelete(true)}>
            Delete group
          </Button>
        )}
        {!isCreate && childCount > 0 && (
          <Text className="text-[11px] text-tertiary">
            Move or delete this group's {childCount} categor{childCount === 1 ? 'y' : 'ies'} before deleting it.
          </Text>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
        title="Delete group"
        message={`Delete the group "${editing?.name}"?`}
        confirmLabel="Delete"
        loading={busy}
      />
    </>
  );
}
