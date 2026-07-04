import { useCallback, useMemo, useState } from 'react';
import { Button, ConfirmDialog, Modal, SelectInput } from '@/components/ui';
import type { ExpenseCategory } from '@/core/db/types';
import { INTENT_GROUP_META } from '@/core/db/defaultCategories';
import { groupKey } from '@/core/expenses/categoryGroups';
import { CategoryEditorModal, type GroupOption } from './CategoryEditorModal';
import { ParentEditorModal } from './ParentEditorModal';
import type { CategoryManager } from './types';

interface Props {
  type: 'expense' | 'income';
  categories: ExpenseCategory[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Category CRUD. Omit for a select-only picker (e.g. the group shared-expense composer) — the
   *  "Manage" affordance is then hidden. */
  manager?: CategoryManager;
}

/** Select-only fallback so the picker can be reused without threading the full manager. */
const NOOP_MANAGER: CategoryManager = {
  parentCategoryMap: new Map(),
  txnCountByCategory: new Map(),
  saveCategory: async () => undefined,
  moveTransactions: async () => undefined,
  deleteCategory: async () => undefined,
  saveParent: async () => undefined,
  deleteParent: async () => undefined,
  createParentWithChildren: async () => undefined
};

interface RenderedGroup {
  key: string;
  label: string;
  color: string;
  parent?: ExpenseCategory;
  cats: ExpenseCategory[];
}

type Editor = { kind: 'category'; editing?: ExpenseCategory } | { kind: 'parent'; editing?: ExpenseCategory };

export function CategoryPickerModal({ type, categories, selectedId, onSelect, onClose, manager }: Props) {
  const canManage = !!manager;
  const {
    parentCategoryMap,
    txnCountByCategory,
    saveCategory: onSaveCategory,
    moveTransactions: onMoveTransactions,
    deleteCategory: onDeleteCategory,
    saveParent: onSaveParent,
    deleteParent: onDeleteParent,
    createParentWithChildren: onCreateParentWithChildren
  } = manager ?? NOOP_MANAGER;
  const [mode, setMode] = useState<'select' | 'manage'>('select');
  const [multiSelect, setMultiSelect] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [bulkMoveTarget, setBulkMoveTarget] = useState('');
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const applies = useCallback(
    (c: ExpenseCategory) =>
      type === 'income' ? c.applicableTo === 'income' : !c.applicableTo || c.applicableTo === 'expense',
    [type]
  );

  const applicableCategories = useMemo(() => categories.filter((c) => !c.isGroup && applies(c)), [categories, applies]);

  const groups = useMemo<RenderedGroup[]>(() => {
    const byKey = new Map<string, ExpenseCategory[]>();
    for (const cat of applicableCategories) {
      const key = groupKey(cat);
      const arr = byKey.get(key);
      if (arr) arr.push(cat);
      else byKey.set(key, [cat]);
    }
    const ordered: RenderedGroup[] = [];
    // Fixed intent groups, in their declared order
    for (const [key, meta] of Object.entries(INTENT_GROUP_META)) {
      const isIncome = key === 'income';
      if (type === 'income' ? !isIncome : isIncome || key === 'transfers') continue;
      const cats = byKey.get(key);
      if (cats?.length) ordered.push({ key, label: meta.label, color: meta.color, cats });
    }
    // User-created parent groups
    for (const parent of parentCategoryMap.values()) {
      if (!applies(parent)) continue;
      const cats = byKey.get(parent.id);
      if (cats?.length) ordered.push({ key: parent.id, label: parent.name, color: parent.color, parent, cats });
    }
    return ordered;
  }, [applicableCategories, parentCategoryMap, type, applies]);

  const groupOptions = useMemo<GroupOption[]>(() => {
    const opts: GroupOption[] = [];
    for (const [key, meta] of Object.entries(INTENT_GROUP_META)) {
      const isIncome = key === 'income';
      if (type === 'income' ? !isIncome : isIncome || key === 'transfers') continue;
      opts.push({ value: key, label: meta.label, isParent: false });
    }
    for (const parent of parentCategoryMap.values()) {
      if (applies(parent)) opts.push({ value: parent.id, label: parent.name, isParent: true });
    }
    return opts;
  }, [parentCategoryMap, type, applies]);

  const selectedCats = useMemo(
    () => applicableCategories.filter((c) => selected.has(c.id)),
    [applicableCategories, selected]
  );
  const canBulkDelete =
    selectedCats.length > 0 && selectedCats.every((c) => !c.isDefault && (txnCountByCategory.get(c.id) ?? 0) === 0);
  const bulkMoveTargets = applicableCategories.filter((c) => !selected.has(c.id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitMultiSelect() {
    setMultiSelect(false);
    setSelected(new Set());
  }

  function handleTileClick(cat: ExpenseCategory) {
    if (mode === 'select') {
      onSelect(cat.id);
      return;
    }
    if (multiSelect) toggleSelected(cat.id);
    else setEditor({ kind: 'category', editing: cat });
  }

  async function handleBulkMove() {
    if (!bulkMoveTarget || selected.size === 0) return;
    setBusy(true);
    try {
      await onMoveTransactions([...selected], bulkMoveTarget);
      setShowBulkMove(false);
      setBulkMoveTarget('');
      exitMultiSelect();
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDelete() {
    setBusy(true);
    try {
      for (const id of selected) await onDeleteCategory(id);
      setConfirmBulkDelete(false);
      exitMultiSelect();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal nested scrollable onClose={onClose} title={mode === 'select' ? 'Select category' : 'Manage categories'}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 -mt-1">
          {mode === 'select' ? (
            <>
              <span className="text-[11px] text-tertiary">Tap to pick</span>
              {canManage && (
                <Button variant="ghost" size="sm" icon="ti-settings" onClick={() => setMode('manage')}>
                  Manage
                </Button>
              )}
            </>
          ) : multiSelect ? (
            <>
              <span className="text-[11px] text-tertiary">{selected.size} selected</span>
              <Button variant="ghost" size="sm" onClick={exitMultiSelect}>
                Cancel
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-1 flex-wrap justify-end w-full">
              <Button variant="ghost" size="sm" icon="ti-plus" onClick={() => setEditor({ kind: 'category' })}>
                Category
              </Button>
              <Button variant="ghost" size="sm" icon="ti-folder-plus" onClick={() => setEditor({ kind: 'parent' })}>
                Group
              </Button>
              <Button variant="ghost" size="sm" icon="ti-checkbox" onClick={() => setMultiSelect(true)}>
                Select
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode('select')}>
                Done
              </Button>
            </div>
          )}
        </div>

        {groups.map(({ key, label, color, parent, cats }) => (
          <div key={key}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
                {label}
              </span>
              {mode === 'manage' && !multiSelect && parent && (
                <button
                  type="button"
                  onClick={() => setEditor({ kind: 'parent', editing: parent })}
                  className="text-tertiary ml-0.5"
                  aria-label={`Edit group ${label}`}
                >
                  <i className="ti ti-pencil" style={{ fontSize: 12 }} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {cats.map((cat) => {
                const isSel = mode === 'select' ? selectedId === cat.id : selected.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleTileClick(cat)}
                    className="relative flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition-colors"
                    style={{
                      borderColor: isSel ? cat.color : 'transparent',
                      backgroundColor: 'var(--color-surface-secondary)'
                    }}
                  >
                    {mode === 'manage' && multiSelect && (
                      <i
                        className={`ti ${isSel ? 'ti-circle-check-filled' : 'ti-circle'} absolute top-0.5 right-0.5`}
                        style={{ fontSize: 12, color: isSel ? cat.color : 'var(--color-text-tertiary)' }}
                        aria-hidden="true"
                      />
                    )}
                    {mode === 'manage' && !multiSelect && (
                      <i
                        className="ti ti-pencil absolute top-0.5 right-0.5 text-tertiary"
                        style={{ fontSize: 10 }}
                        aria-hidden="true"
                      />
                    )}
                    <i className={`ti ${cat.icon}`} style={{ fontSize: 16, color: cat.color }} aria-hidden="true" />
                    <span className="text-[8px] font-medium text-center leading-tight text-secondary line-clamp-2 break-words w-full">
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Bulk action bar */}
        {mode === 'manage' && multiSelect && selected.size > 0 && (
          <div className="sticky bottom-0 flex gap-2 pt-2 bg-surface">
            <Button variant="secondary" fullWidth size="sm" onClick={() => setShowBulkMove(true)}>
              Move all to…
            </Button>
            <Button
              variant="danger"
              fullWidth
              size="sm"
              icon="ti-trash"
              disabled={!canBulkDelete}
              onClick={() => setConfirmBulkDelete(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </Modal>

      {editor?.kind === 'category' && (
        <CategoryEditorModal
          {...(editor.editing ? { editing: editor.editing } : {})}
          type={type}
          groupOptions={groupOptions}
          moveTargets={applicableCategories}
          txnCount={editor.editing ? (txnCountByCategory.get(editor.editing.id) ?? 0) : 0}
          onSave={onSaveCategory}
          onMove={(s, t) => onMoveTransactions([s], t)}
          onDelete={onDeleteCategory}
          onClose={() => setEditor(null)}
        />
      )}

      {editor?.kind === 'parent' &&
        (() => {
          const parent = editor.editing;
          const childCount = parent ? categories.filter((c) => c.parentId === parent.id).length : 0;
          return (
            <ParentEditorModal
              {...(parent ? { editing: parent } : {})}
              childCount={childCount}
              type={type}
              onCreate={onCreateParentWithChildren}
              onSave={onSaveParent}
              onDelete={onDeleteParent}
              onClose={() => setEditor(null)}
            />
          );
        })()}

      {/* Bulk move target picker */}
      {showBulkMove && (
        <Modal
          level={3}
          size="sm"
          onClose={() => setShowBulkMove(false)}
          title="Move transactions"
          footer={
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setShowBulkMove(false)} disabled={busy}>
                Cancel
              </Button>
              <Button fullWidth disabled={!bulkMoveTarget} loading={busy} onClick={() => void handleBulkMove()}>
                Move
              </Button>
            </div>
          }
        >
          <p className="text-sm text-secondary">
            Move all transactions from {selected.size} categor{selected.size === 1 ? 'y' : 'ies'} to:
          </p>
          <SelectInput
            value={bulkMoveTarget}
            onChange={setBulkMoveTarget}
            placeholder="Choose category…"
            options={bulkMoveTargets.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Modal>
      )}

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        level={3}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => void handleBulkDelete()}
        title="Delete categories"
        message={`Delete ${selected.size} categor${selected.size === 1 ? 'y' : 'ies'}? Their budgets will also be removed.`}
        confirmLabel="Delete"
        loading={busy}
      />
    </>
  );
}
