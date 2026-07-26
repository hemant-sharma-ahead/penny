import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { Banner, Button, ConfirmDialog, Modal, SelectInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
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
  const theme = useThemeColors();
  return (
    <View>
      <View className="flex-row items-center gap-1.5 mb-2">
        <Icon name={icon} size={11} color={accentColor ?? theme.textTertiary} />
        <Text
          className={`text-[10px] font-semibold uppercase tracking-wide ${accentColor ? '' : 'text-tertiary'}`}
          style={accentColor ? { color: accentColor } : undefined}
        >
          {label}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {cats.map((cat) => (
          <Pressable key={cat.id} onPress={() => onSelect(cat.id)} className="items-center gap-1 w-12">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{
                backgroundColor: cat.color,
                borderWidth: selectedId === cat.id ? 2 : 0,
                borderColor: theme.surface
              }}
            >
              <Icon name={cat.icon} size={17} color="#fff" />
            </View>
            <Text className="text-[8px] font-medium text-center leading-tight text-secondary w-full" numberOfLines={2}>
              {cat.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View className="border-t border-theme my-1" />
    </View>
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
  const theme = useThemeColors();
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
      <Modal
        scrollable
        onClose={onClose}
        title={mode === 'select' ? 'Select category' : 'Manage categories'}
        // Web keeps the bulk-action bar `sticky bottom-0` inside the scrolling body; RN's Modal has no
        // sticky-within-ScrollView primitive, but its `footer` slot already renders outside the
        // ScrollView and stays pinned — same "always visible while scrolling the grid" effect.
        footer={
          mode === 'manage' && multiSelect && selected.size > 0 ? (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="secondary" fullWidth size="sm" onPress={() => setShowBulkMove(true)}>
                  Move all to…
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  variant="danger"
                  fullWidth
                  size="sm"
                  icon="ti-trash"
                  disabled={!canBulkDelete}
                  onPress={() => setConfirmBulkDelete(true)}
                >
                  Delete
                </Button>
              </View>
            </View>
          ) : undefined
        }
      >
        {/* Toolbar */}
        <View className="flex-row items-center justify-between gap-2">
          {mode === 'select' ? (
            <>
              <Text className="text-[11px] text-tertiary">Tap to pick</Text>
              {canManage && (
                <Button variant="ghost" size="sm" icon="ti-settings" onPress={() => setMode('manage')}>
                  Manage
                </Button>
              )}
            </>
          ) : multiSelect ? (
            <>
              <Text className="text-[11px] text-tertiary">{selected.size} selected</Text>
              <Button variant="ghost" size="sm" onPress={exitMultiSelect}>
                Cancel
              </Button>
            </>
          ) : (
            <View className="flex-row items-center gap-1 flex-wrap justify-end w-full">
              <Button variant="ghost" size="sm" icon="ti-plus" onPress={() => setEditor({ kind: 'category' })}>
                Category
              </Button>
              <Button variant="ghost" size="sm" icon="ti-folder-plus" onPress={() => setEditor({ kind: 'parent' })}>
                Group
              </Button>
              <Button variant="ghost" size="sm" icon="ti-checkbox" onPress={() => setMultiSelect(true)}>
                Select
              </Button>
              <Button variant="ghost" size="sm" onPress={() => setMode('select')}>
                Done
              </Button>
            </View>
          )}
        </View>

        {mode === 'select' && activeVacationEvent && travelCategories.length > 0 ? (
          <View>
            <View
              className="flex-row items-center gap-2 rounded-[10px] border px-2.5 py-2 mb-2"
              style={{ backgroundColor: tint(travelColor, 12), borderColor: tint(travelColor, 30) }}
            >
              <Icon name="ti-plane-departure" size={13} color={travelColor} />
              <Text className="text-[10.5px] font-bold" style={{ color: travelColor }}>
                Vacation On · {activeVacationEvent.name}
              </Text>
            </View>
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
          </View>
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
          <View key={key}>
            <View className="flex-row items-center gap-1.5 mb-2">
              <View className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <Text className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
                {label}
              </Text>
              {mode === 'manage' && !multiSelect && parent && (
                <Pressable
                  onPress={() => setEditor({ kind: 'parent', editing: parent })}
                  className="ml-0.5"
                  accessibilityLabel={`Edit group ${label}`}
                >
                  <Icon name="ti-pencil" size={12} color={theme.textTertiary} />
                </Pressable>
              )}
            </View>
            <View className="flex-row flex-wrap gap-x-1 gap-y-2.5">
              {cats.map((cat) => {
                const isSel = mode === 'select' ? selectedId === cat.id : selected.has(cat.id);
                return (
                  <Pressable key={cat.id} onPress={() => handleTileClick(cat)} className="items-center gap-1 w-[15%]">
                    <View
                      className="relative w-9 h-9 rounded-[10px] items-center justify-center"
                      style={{
                        backgroundColor: cat.color,
                        borderWidth: isSel ? 2 : 0,
                        borderColor: theme.surface
                      }}
                    >
                      <Icon name={cat.icon} size={14} color="#fff" />
                      {mode === 'manage' && multiSelect && (
                        <View className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-surface items-center justify-center">
                          <Icon
                            name={isSel ? 'ti-circle-check-filled' : 'ti-circle'}
                            size={9}
                            color={isSel ? cat.color : theme.textTertiary}
                          />
                        </View>
                      )}
                      {mode === 'manage' && !multiSelect && (
                        <View className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-surface items-center justify-center">
                          <Icon name="ti-pencil" size={8} color={theme.textTertiary} />
                        </View>
                      )}
                    </View>
                    <Text
                      className="text-[7px] font-medium text-center leading-tight text-secondary w-full"
                      numberOfLines={2}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
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
          size="sm"
          onClose={() => setShowBulkMove(false)}
          title="Move transactions"
          footer={
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button variant="secondary" fullWidth onPress={() => setShowBulkMove(false)} disabled={busy}>
                  Cancel
                </Button>
              </View>
              <View className="flex-1">
                <Button fullWidth disabled={!bulkMoveTarget} loading={busy} onPress={() => void handleBulkMove()}>
                  Move
                </Button>
              </View>
            </View>
          }
        >
          <Text className="text-sm text-secondary">
            Move all transactions from {selected.size} categor{selected.size === 1 ? 'y' : 'ies'} to:
          </Text>
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
