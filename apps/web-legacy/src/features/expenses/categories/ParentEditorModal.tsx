import { useState } from 'react';
import { Button, ConfirmDialog, Modal, TextInput } from '@/components/ui';
import type { ExpenseCategory } from '@/core/db/types';
import { CAT_COLORS } from '@/core/expenses/categoryIcons';

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
        level={3}
        scrollable
        onClose={onClose}
        title={isCreate ? 'New group' : 'Edit group'}
        footer={
          <Button fullWidth color={color} loading={busy} disabled={saveDisabled} onClick={() => void handleSubmit()}>
            {isCreate ? 'Create group' : 'Save'}
          </Button>
        }
      >
        <TextInput label="Group name" placeholder="e.g. Side business" value={name} onChange={setName} autoFocus />

        <div>
          <p className="text-xs font-medium text-secondary mb-1.5">Colour</p>
          <div className="flex items-center gap-2 flex-wrap">
            {CAT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 flex-shrink-0 transition-transform"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? 'var(--color-text-primary)' : 'transparent',
                  transform: color === c ? 'scale(1.15)' : 'scale(1)'
                }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
        </div>

        {isCreate && (
          <div>
            <p className="text-xs font-medium text-secondary mb-1.5">
              Categories in this group <span className="text-tertiary">(at least one required)</span>
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <TextInput placeholder="Category name" value={childInput} onChange={setChildInput} />
              </div>
              <Button variant="secondary" size="md" icon="ti-plus" disabled={!childInput.trim()} onClick={addChild}>
                Add
              </Button>
            </div>
            {children.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {children.map((c, i) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => setChildren((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove ${c}`}
                    >
                      <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-tertiary mt-2">
              You can change each category's icon and colour later from the picker.
            </p>
          </div>
        )}

        {!isCreate && childCount === 0 && (
          <Button variant="danger" fullWidth icon="ti-trash" onClick={() => setConfirmDelete(true)}>
            Delete group
          </Button>
        )}
        {!isCreate && childCount > 0 && (
          <p className="text-[11px] text-tertiary">
            Move or delete this group's {childCount} categor{childCount === 1 ? 'y' : 'ies'} before deleting it.
          </p>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete}
        level={3}
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
