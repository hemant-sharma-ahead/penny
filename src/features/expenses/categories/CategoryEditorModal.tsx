import { useMemo, useState } from 'react';
import { Button, ConfirmDialog, Modal, SelectInput, TextInput } from '@/components/ui';
import type { ExpenseCategory } from '@/core/db/types';
import { CAT_COLORS } from '@/core/expenses/categoryIcons';
import { IconGridPicker } from './IconGridPicker';

export interface GroupOption {
  value: string;
  label: string;
  isParent: boolean;
}

interface Props {
  /** undefined ⇒ create mode */
  editing?: ExpenseCategory;
  type: 'expense' | 'income';
  groupOptions: GroupOption[];
  /** Other selectable leaf categories transactions can be moved to. */
  moveTargets: ExpenseCategory[];
  txnCount: number;
  onSave: (cat: ExpenseCategory) => Promise<void>;
  onMove: (sourceId: string, targetId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export function CategoryEditorModal({
  editing,
  type,
  groupOptions,
  moveTargets,
  txnCount,
  onSave,
  onMove,
  onDelete,
  onClose
}: Props) {
  const isDefault = editing?.isDefault ?? false;
  const defaultGroup = type === 'income' ? 'income' : (groupOptions[0]?.value ?? 'other');

  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? 'ti-dots');
  const [color, setColor] = useState(editing?.color ?? CAT_COLORS[2] ?? '#22c55e');
  const [group, setGroup] = useState(editing?.parentId ?? editing?.intentGroup ?? defaultGroup);
  const [moveTarget, setMoveTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'move'>(null);

  const targets = useMemo(() => moveTargets.filter((c) => c.id !== editing?.id), [moveTargets, editing]);

  async function handleSave() {
    if (!name.trim()) return;
    setBusy(true);
    const base: ExpenseCategory = editing
      ? { ...editing, name: name.trim(), icon, color }
      : {
          id: `cat-custom-${crypto.randomUUID().slice(0, 8)}`,
          name: name.trim(),
          icon,
          color,
          isDefault: false,
          applicableTo: type,
          createdAt: Date.now()
        };
    // Defaults keep their fixed intent group; for everything else the group select
    // decides whether the category sits under a fixed intent group or a custom parent.
    if (!isDefault) {
      const opt = groupOptions.find((o) => o.value === group);
      if (opt?.isParent) {
        base.parentId = opt.value;
        delete base.intentGroup;
      } else {
        base.intentGroup = group;
        delete base.parentId;
      }
    }
    try {
      await onSave(base);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleMove() {
    if (!editing || !moveTarget) return;
    setBusy(true);
    try {
      await onMove(editing.id, moveTarget);
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

  const canDelete = !!editing && !isDefault && txnCount === 0;

  return (
    <>
      <Modal
        level={3}
        scrollable
        onClose={onClose}
        title={editing ? 'Edit category' : 'New category'}
        footer={
          <Button fullWidth color={color} loading={busy} disabled={!name.trim()} onClick={() => void handleSave()}>
            {editing ? 'Save' : 'Create'}
          </Button>
        }
      >
        <TextInput label="Name" placeholder="Category name" value={name} onChange={setName} autoFocus />

        <div>
          <p className="text-xs font-medium text-secondary mb-1.5">Icon</p>
          <IconGridPicker value={icon} onChange={setIcon} color={color} />
        </div>

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

        {!isDefault && groupOptions.length > 0 && (
          <SelectInput
            label="Group"
            value={group}
            onChange={setGroup}
            options={groupOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        )}

        {editing && txnCount > 0 && (
          <div className="bg-surface-2 rounded-xl p-3 flex flex-col gap-2 border border-theme">
            <p className="text-xs text-secondary">
              This category has {txnCount} transaction{txnCount === 1 ? '' : 's'}. Move them to another category to
              empty it (it can then be deleted).
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <SelectInput
                  value={moveTarget}
                  onChange={setMoveTarget}
                  placeholder="Move to…"
                  options={targets.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
              <Button variant="secondary" size="md" disabled={!moveTarget} onClick={() => setConfirm('move')}>
                Move
              </Button>
            </div>
          </div>
        )}

        {canDelete && (
          <Button variant="danger" fullWidth icon="ti-trash" onClick={() => setConfirm('delete')}>
            Delete category
          </Button>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirm === 'move'}
        level={3}
        onClose={() => setConfirm(null)}
        onConfirm={() => void handleMove()}
        title="Move transactions"
        message={`Move ${txnCount} transaction${txnCount === 1 ? '' : 's'} from "${editing?.name}" to "${
          targets.find((c) => c.id === moveTarget)?.name ?? ''
        }"?`}
        confirmLabel="Move"
        confirmVariant="primary"
        loading={busy}
      />

      <ConfirmDialog
        isOpen={confirm === 'delete'}
        level={3}
        onClose={() => setConfirm(null)}
        onConfirm={() => void handleDelete()}
        title="Delete category"
        message={`Delete "${editing?.name}"? Any budgets for it will also be removed. This cannot be undone.`}
        confirmLabel="Delete"
        loading={busy}
      />
    </>
  );
}
