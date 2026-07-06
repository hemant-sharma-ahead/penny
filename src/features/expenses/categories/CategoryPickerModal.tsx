import { useCallback, useMemo, useState } from 'react';
import { Banner, Button, ConfirmDialog, Modal, SelectInput } from '@/components/ui';
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
  /** Active Vacation (immersive event) mode, if any — leads with Travel picks instead of Frequent,
   *  with a note on why, but never hides other groups. Soft default, not a hard restriction. */
  activeVacationEvent?: { name: string } | undefined;
}

/** Horizontally-scrollable quick-pick row shared by "Frequent" and "Travel picks". */
function QuickPickRow({
  icon,
  accentColor,
  label,
  cats,
  selectedId,
  onSelect
}: {
  icon: string;
  accentColor?: string;
  label: string;
  cats: ExpenseCategory[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <i
          className={`ti ${icon} ${accentColor ? '' : 'text-tertiary'}`}
          style={{ fontSize: 11, color: accentColor }}
          aria-hidden="true"
        />
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${accentColor ? '' : 'text-tertiary'}`}
          style={{ color: accentColor }}
        >
          {label}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
        {cats.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className="flex flex-col items-center gap-1 flex-shrink-0 w-12"
          >
            <span
              className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0"
              style={{
                backgroundColor: cat.color,
                boxShadow:
                  selectedId === cat.id ? `0 0 0 2px var(--color-surface), 0 0 0 3.5px ${cat.color}` : undefined
              }}
            >
              <i className={`ti ${cat.icon}`} style={{ fontSize: 17, color: '#fff' }} aria-hidden="true" />
            </span>
            <span className="text-[8px] font-medium text-center leading-tight text-secondary line-clamp-2 break-words w-full">
              {cat.name}
            </span>
          </button>
        ))}
      </div>
      <div className="border-t border-theme my-1" />
    </div>
  );
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

export function CategoryPickerModal({
  type,
  categories,
  selectedId,
  onSelect,
  onClose,
  manager,
  activeVacationEvent
}: Props) {
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

  /** Top categories by actual usage — lets the common case skip the full group scroll entirely. */
  const frequentCategories = useMemo(
    () =>
      [...applicableCategories]
        .map((cat) => ({ cat, count: txnCountByCategory.get(cat.id) ?? 0 }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((entry) => entry.cat),
    [applicableCategories, txnCountByCategory]
  );

  /** Travel group categories, declared order — leads the picker during an active Vacation event. */
  const travelCategories = useMemo(
    () => applicableCategories.filter((cat) => groupKey(cat) === 'travel'),
    [applicableCategories]
  );
  const travelColor = INTENT_GROUP_META.travel?.color ?? '#0ea5e9';

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

        {mode === 'select' && activeVacationEvent && travelCategories.length > 0 ? (
          <div>
            <div
              className="flex items-center gap-2 rounded-[10px] border px-2.5 py-2 mb-2"
              style={{
                backgroundColor: `color-mix(in srgb, ${travelColor} 12%, var(--color-surface))`,
                borderColor: `color-mix(in srgb, ${travelColor} 30%, var(--color-surface))`
              }}
            >
              <i className="ti ti-plane-departure" style={{ fontSize: 13, color: travelColor }} aria-hidden="true" />
              <span className="text-[10.5px] font-bold" style={{ color: travelColor }}>
                Vacation On · {activeVacationEvent.name}
              </span>
            </div>
            <Banner variant="info" className="mb-2.5">
              Travel-tagged spend is kept separate from your everyday budget, so this trip won&apos;t skew your regular
              numbers. Pick a different category only for things that aren&apos;t really trip expenses — like an EMI or
              subscription still due.
            </Banner>
            <QuickPickRow
              icon="ti-plane"
              accentColor={travelColor}
              label="Travel picks"
              cats={travelCategories}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </div>
        ) : (
          mode === 'select' &&
          frequentCategories.length > 0 && (
            <QuickPickRow
              icon="ti-clock-hour-4"
              label="Frequent"
              cats={frequentCategories}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          )
        )}

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
            <div className="grid grid-cols-6 gap-x-1 gap-y-2.5">
              {cats.map((cat) => {
                const isSel = mode === 'select' ? selectedId === cat.id : selected.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleTileClick(cat)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className="relative w-9 h-9 rounded-[10px] grid place-items-center flex-shrink-0"
                      style={{
                        backgroundColor: cat.color,
                        boxShadow: isSel ? `0 0 0 2px var(--color-surface), 0 0 0 3.5px ${cat.color}` : undefined
                      }}
                    >
                      <i className={`ti ${cat.icon}`} style={{ fontSize: 14, color: '#fff' }} aria-hidden="true" />
                      {mode === 'manage' && multiSelect && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-surface grid place-items-center shadow">
                          <i
                            className={`ti ${isSel ? 'ti-circle-check-filled' : 'ti-circle'}`}
                            style={{ fontSize: 9, color: isSel ? cat.color : 'var(--color-text-tertiary)' }}
                            aria-hidden="true"
                          />
                        </span>
                      )}
                      {mode === 'manage' && !multiSelect && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-surface grid place-items-center shadow">
                          <i className="ti ti-pencil text-tertiary" style={{ fontSize: 8 }} aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="text-[7px] font-medium text-center leading-tight text-secondary line-clamp-2 break-words w-full">
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
