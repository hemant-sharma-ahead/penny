import { useState, type ReactNode } from 'react';
import { View, Pressable, Text } from 'react-native';
import { SelectInput, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import type { ExpenseCategory } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import {
  isLikelyTransfer,
  intentGroupLabel,
  suggestIntentGroup,
  transferCategoryOptions,
  type CategoryResolution,
  type CategoryAction
} from '@/core/import/importCategoryResolution';
import { CategoryPickerModal } from '~/features/expenses/categories/CategoryPickerModal';

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** RN equivalent of web's `BorderLabelField` — a small label sitting on a field's top border instead
 *  of a separate label row or a placeholder that disappears once a value is set. Web notches the label
 *  half-onto the border via `absolute -top-0.5`; RN's `Text` baseline sits differently, so this uses an
 *  explicit numeric `top` offset (verified to sit centered on the 1px border of the wrapped
 *  SelectInput/TextInput below it, same visual effect as web). The wrapping `View` must NOT clip
 *  overflow (RN views don't clip by default, so no explicit `overflow: visible` is needed) for the
 *  label to sit outside its own top edge. */
function BorderLabelField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="relative" style={{ paddingTop: 8 }}>
      <View className="absolute left-2.5 px-1 bg-surface rounded z-10" style={{ top: -1 }}>
        <Text className="text-[9px] font-semibold text-tertiary">{label}</Text>
      </View>
      {children}
    </View>
  );
}

interface CategoryTileProps {
  resolution: CategoryResolution;
  decided: boolean;
  /** Drives the tile's background tint so status is scannable at a glance, matching the
   *  ready/attention/duplicate vocabulary used everywhere else on this screen. */
  status: 'ready' | 'attention' | 'duplicate';
  /** Each row paired with its ORIGINAL index into `parsedRows` (2026-08-06) — needed so bulk-select
   *  below can reference `onMoveRowsToCategory`/`onTagRows` by a stable identity. See
   *  `PreviewSection.tsx`'s doc comment on `rowsByCategory`. */
  rows: { row: ParsedRow; index: number }[];
  categories: ExpenseCategory[];
  /** Per-category existing-transaction counts, forwarded to `CategoryPickerModal`'s own
   *  `txnCountByCategory` prop for its "Frequent" quick-pick row. See `useImport.ts`'s doc comment. */
  txnCountByCategory: Map<string, number>;
  groupOptions: { value: string; label: string }[];
  /** The custom tag (if any) the user has set for every transaction under this source category —
   *  independent of which category it resolves to (existing/create/transfer/skip). */
  tag: string;
  /** Per-row overrides (2026-08-06), keyed by index into `parsedRows` — see `RowOverride`'s doc
   *  comment. Read here to show each overridden row's actual target category/tag distinctly from the
   *  rest of the tile's own group-level resolution. */
  rowOverrides: Map<number, RowOverride>;
  onTagChange: (tag: string) => void;
  onUpdate: (suggestion: CategoryAction) => void;
  /** Bulk-select action (2026-08-06) — moves exactly the given (this tile's own) row indices to a
   *  different EXISTING category, without touching the rest of the tile's rows or its own group-level
   *  resolution. See `useImport.ts`'s `moveRowsToCategory`. */
  onMoveRowsToCategory: (rowIndices: number[], categoryId: string, categoryName: string) => void;
  /** Bulk-select action (2026-08-06) — tags exactly the given row indices. See `useImport.ts`'s
   *  `tagRows`. */
  onTagRows: (rowIndices: number[], tag: string) => void;
}

const KIND_LABELS: Record<CategoryAction['kind'], string> = {
  existing: 'Map Existing',
  create: 'New Category',
  skip: 'Skip',
  transfer: 'Mark as Transfer'
};

/** RN port of apps/web-react/src/features/import/review/CategoryTile.tsx. One tile per distinct source
 *  category. Everything needed to resolve it (kind picker, target category + edit icon, new-category/
 *  transfer inputs, tag box) lives in the always-visible header — expanding (chevron) only reveals the
 *  individual transactions, never controls. Undecided tiles get a warning border and sort first (see
 *  PreviewSection.tsx). */
export function CategoryTile({
  resolution,
  decided,
  status,
  rows,
  categories,
  txnCountByCategory,
  groupOptions,
  tag,
  rowOverrides,
  onTagChange,
  onUpdate,
  onMoveRowsToCategory,
  onTagRows
}: CategoryTileProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  // Row list defaults to the first 8 (unchanged) — but bulk-select needs to reach every row, not just
  // the ones currently rendered, so "+ N more" becomes a real "show all" toggle (2026-08-06) once
  // there's more than 8. A plain `.map()`, same as before this change — this screen has no virtualized
  // list anywhere, and a single source category rarely runs past the low hundreds even in a large file.
  const [showAllRows, setShowAllRows] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  // Bulk-select (2026-08-06) — which of THIS tile's rows (by their original parsedRows index) are
  // currently checked. Starts empty (nothing pre-selected — unlike bank-import's "everything checked by
  // default", there's no equivalent "categorize the rest" fallback need here since the tile's own
  // group-level resolution already covers every row by default). Local to this tile; not persisted
  // anywhere, so it resets if the tile unmounts (e.g. collapsing/reopening Preview).
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkMovePicker, setShowBulkMovePicker] = useState(false);
  const { suggestion, sourceName, count } = resolution;
  const transferOptions = transferCategoryOptions().map((c) => ({ value: c.id, label: c.name }));
  const suggestedTransfer = suggestion.kind !== 'transfer' && isLikelyTransfer(sourceName);
  /** A source category's rows are overwhelmingly one direction in practice (e.g. "Salary" is always
   *  income) — pick whichever the majority of this category's rows actually are, so "Map Existing"
   *  opens the picker filtered to the right applicableTo (income vs expense) categories. */
  const pickerType: 'expense' | 'income' =
    rows.filter((r) => r.row.type === 'income').length > rows.length / 2 ? 'income' : 'expense';

  // A strict subset selected (not none, not all) is what actually enables bulk actions — selecting
  // literally everything is equivalent to (and simpler to leave as) the tile's own group-level
  // resolution, and selecting nothing means there's nothing to act on.
  const selectedCount = selected.size;
  const hasPartialSelection = selectedCount > 0 && selectedCount < rows.length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  function toggleRow(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.index))));
  }

  // The tag field switches meaning based on selection (2026-08-06, per explicit user request): with a
  // strict subset selected, it reads/writes ONLY those rows' individual tag overrides instead of the
  // whole tile's group-level tag — so tagging a subset never touches the rest of the group's tag.
  // With 0 or all selected, it's the plain group-level field, unchanged from before. If the selected
  // rows don't all already share the exact same tag override (e.g. two were tagged separately in an
  // earlier selection), show blank rather than an arbitrary one of them — typing then applies that same
  // new tag to the whole current selection uniformly.
  const selectedTags = new Set([...selected].map((i) => rowOverrides.get(i)?.tag ?? ''));
  const bulkTagValue = hasPartialSelection ? (selectedTags.size === 1 ? ([...selectedTags][0] ?? '') : '') : tag;
  function handleTagChange(value: string) {
    if (hasPartialSelection) onTagRows([...selected], value);
    else onTagChange(value);
  }

  const kindOptions = (['existing', 'create', 'skip', 'transfer'] as const).map((kind) => ({
    value: kind,
    label: kind === 'transfer' && suggestedTransfer ? `${KIND_LABELS[kind]} ✨` : KIND_LABELS[kind]
  }));

  function handleKindChange(kind: string) {
    if (kind === 'existing') {
      setShowCategoryPicker(true);
    } else if (kind === 'transfer') {
      const first = transferOptions[0];
      onUpdate({
        kind: 'transfer',
        categoryId: first?.value ?? 'cat-tr-other',
        categoryName: first?.label ?? 'Other Transfer'
      });
    } else if (kind === 'create') {
      // Preserve the current suggested group if we're already in 'create' state (the user may have
      // manually changed it); otherwise compute a fresh smart suggestion from the source name.
      const suggestedIntentGroup =
        suggestion.kind === 'create' ? suggestion.suggestedIntentGroup : suggestIntentGroup(sourceName);
      onUpdate({ kind: 'create', suggestedName: sourceName, suggestedIntentGroup });
    } else {
      onUpdate({ kind: 'skip' });
    }
  }

  const targetLabel: ReactNode =
    suggestion.kind === 'existing' ? (
      suggestion.categoryName
    ) : suggestion.kind === 'transfer' ? (
      <Text style={{ color: theme.info }}>Transfer</Text>
    ) : suggestion.kind === 'create' ? (
      <>
        {suggestion.suggestedName}{' '}
        <Text className="text-tertiary" style={{ fontWeight: '400' }}>
          (new · {intentGroupLabel(suggestion.suggestedIntentGroup)})
        </Text>
      </>
    ) : (
      <Text className="text-tertiary">Skip</Text>
    );

  const statusColor = status === 'attention' ? theme.warning : status === 'duplicate' ? theme.neutral : theme.success;

  return (
    <View
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: tint(statusColor, status === 'ready' ? 10 : 20),
        borderWidth: 1.5,
        borderColor: statusColor
      }}
    >
      <View className="p-3 gap-2">
        {/* Row 1 — source → target, edit icon (existing only), count, expand-transactions toggle */}
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center gap-1.5">
            <Text className="text-xs font-semibold text-primary flex-shrink" numberOfLines={1}>
              &quot;{sourceName}&quot;
            </Text>
            <Icon name="ti-arrow-right" size={12} color={theme.textTertiary} />
            {decided ? (
              <Text className="text-xs font-semibold text-primary flex-shrink" numberOfLines={1}>
                {targetLabel}
              </Text>
            ) : (
              <View className="rounded-full border border-dashed px-2 py-0.5" style={{ borderColor: theme.border }}>
                <Text className="text-[10.5px] font-medium italic text-tertiary">Choose…</Text>
              </View>
            )}
            {suggestion.kind === 'existing' && (
              <Pressable onPress={() => setShowCategoryPicker(true)} accessibilityLabel="Change category" hitSlop={6}>
                <Icon name="ti-pencil" size={12} color={theme.textTertiary} />
              </Pressable>
            )}
          </View>
          <View className="rounded-full bg-surface-3 px-1.5 py-0.5 flex-shrink-0">
            <Text className="text-[9.5px] font-bold text-secondary">
              {count} txn{count !== 1 ? 's' : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => setExpanded((e) => !e)}
            accessibilityLabel={expanded ? 'Hide transactions' : 'Show transactions'}
            hitSlop={6}
          >
            <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
          </Pressable>
        </View>

        {suggestedTransfer && (
          <View className="flex-row items-center gap-1">
            <Icon name="ti-sparkles" size={11} color={theme.info} />
            <Text className="text-[9.5px]" style={{ color: theme.info }}>
              Suggested — looks like transfers, not spending
            </Text>
          </View>
        )}

        {/* Row 2 — kind dropdown + tag box, pill-styled (same behavior, chip-like look). The tag box
         *  reads/writes only the selected subset's own tag override once a strict subset is checked
         *  below (2026-08-06) — its placeholder says so, so it's never ambiguous which transactions a
         *  typed tag will actually land on. */}
        <View className="flex-row gap-2">
          <View className="flex-1">
            <SelectInput
              value={suggestion.kind}
              onChange={handleKindChange}
              options={kindOptions}
              triggerClassName="!rounded-full !py-1.5 justify-center"
            />
          </View>
          <View className="flex-1">
            <TextInput
              placeholder={hasPartialSelection ? `Tag ${selectedCount} selected` : 'Tag all transactions'}
              value={bulkTagValue}
              onChange={handleTagChange}
              inputClassName="!rounded-full !py-1.5 !text-xs text-center"
            />
          </View>
        </View>

        {/* Row 2b — bulk-move action, only once a strict subset of this tile's own rows is checked
         *  below (2026-08-06). Moves just the selection to a different EXISTING category, leaving the
         *  rest of this source category's rows on the tile's own group-level resolution untouched. */}
        {hasPartialSelection && (
          <Pressable
            onPress={() => setShowBulkMovePicker(true)}
            className="flex-row items-center justify-center gap-1.5 rounded-full py-1.5"
            style={{ backgroundColor: tint(theme.primary, 12) }}
          >
            <Icon name="ti-arrow-right" size={13} color={theme.primary} />
            <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
              Move {selectedCount} selected to…
            </Text>
          </Pressable>
        )}

        {/* Row 3 — conditional on the selected kind. Labels sit notched into the field's top border
         *  (BorderLabelField) instead of a separate label row. Deliberately kept as normal fields, not
         *  pills — that treatment is reserved for the kind dropdown + tag box above. */}
        {suggestion.kind === 'transfer' && (
          <BorderLabelField label="Transfer category">
            <SelectInput
              value={suggestion.categoryId}
              onChange={(v) => {
                const c = transferOptions.find((x) => x.value === v);
                onUpdate({ kind: 'transfer', categoryId: v, categoryName: c?.label ?? v });
              }}
              options={transferOptions}
            />
          </BorderLabelField>
        )}
        {suggestion.kind === 'create' && (
          <View className="flex-row gap-2">
            <View style={{ flex: 2 }}>
              <BorderLabelField label="Group">
                <SelectInput
                  value={suggestion.suggestedIntentGroup}
                  onChange={(v) =>
                    onUpdate({ kind: 'create', suggestedName: suggestion.suggestedName, suggestedIntentGroup: v })
                  }
                  options={groupOptions}
                />
              </BorderLabelField>
            </View>
            <View style={{ flex: 3 }}>
              <BorderLabelField label="New category name">
                <TextInput
                  value={suggestion.suggestedName}
                  onChange={(v) =>
                    onUpdate({
                      kind: 'create',
                      suggestedName: v,
                      suggestedIntentGroup: suggestion.suggestedIntentGroup
                    })
                  }
                />
              </BorderLabelField>
            </View>
          </View>
        )}
      </View>

      {/* Body — transactions, each with a bulk-select checkbox (2026-08-06). Select-all here means
       *  "select every row shown right now" — with more than 8 rows and "show all" not yet tapped, that
       *  intentionally selects just the visible 8 rather than silently reaching into hidden ones. */}
      {expanded && (
        <View className="border-t border-theme px-3 py-2.5">
          {rows.length > 1 && (
            <Pressable onPress={toggleSelectAll} className="flex-row items-center gap-2 pb-1.5">
              <View
                className="w-4 h-4 rounded items-center justify-center border shrink-0"
                style={{
                  borderColor: allSelected ? theme.primary : theme.border,
                  backgroundColor: allSelected ? theme.primary : 'transparent'
                }}
              >
                {allSelected && <Icon name="ti-check" size={10} color="#fff" />}
              </View>
              <Text className="text-[10.5px] font-semibold text-secondary">
                {selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}
              </Text>
            </Pressable>
          )}
          {(showAllRows ? rows : rows.slice(0, 8)).map(({ row, index }, i) => {
            const override = rowOverrides.get(index);
            const isSelected = selected.has(index);
            return (
              <Pressable
                key={index}
                onPress={() => toggleRow(index)}
                className={`flex-row items-center gap-2 py-1.5 ${i > 0 ? 'border-t border-theme' : ''}`}
              >
                <View
                  className="w-4 h-4 rounded items-center justify-center border shrink-0"
                  style={{
                    borderColor: isSelected ? theme.primary : theme.border,
                    backgroundColor: isSelected ? theme.primary : 'transparent'
                  }}
                >
                  {isSelected && <Icon name="ti-check" size={10} color="#fff" />}
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-[11px] font-medium text-primary" numberOfLines={1}>
                    {row.description}
                  </Text>
                  <Text className="text-[9.5px] text-tertiary" numberOfLines={1}>
                    {fmtShortDate(row.date)}
                    {row.account ? ` · ${row.account}` : ''}
                    {override?.categoryName && (
                      <Text style={{ color: theme.primary }}> · moved to {override.categoryName}</Text>
                    )}
                    {override?.tag && <Text style={{ color: theme.info }}> · #{override.tag}</Text>}
                  </Text>
                </View>
                <Text
                  className="text-[11px] font-semibold flex-shrink-0"
                  style={{ color: row.type === 'income' ? theme.success : theme.textPrimary }}
                >
                  {row.type === 'income' ? '+' : ''}
                  {formatCurrency(row.amount)}
                </Text>
              </Pressable>
            );
          })}
          {rows.length > 8 && (
            <Pressable onPress={() => setShowAllRows((v) => !v)}>
              <Text className="text-center text-[9.5px] font-semibold pt-1.5" style={{ color: theme.primary }}>
                {showAllRows ? 'Show fewer' : `+ ${rows.length - 8} more`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {showCategoryPicker && (
        <CategoryPickerModal
          type={pickerType}
          categories={categories}
          txnCountByCategory={txnCountByCategory}
          selectedId={suggestion.kind === 'existing' ? suggestion.categoryId : ''}
          onSelect={(id) => {
            const c = categories.find((x) => x.id === id);
            onUpdate({ kind: 'existing', categoryId: id, categoryName: c?.name ?? id });
            setShowCategoryPicker(false);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
      )}

      {/* Bulk-move picker (2026-08-06) — moves exactly the checked subset to a different EXISTING
       *  category, then clears the selection (the moved rows now show "moved to X" on their own row
       *  instead of staying visibly checked with nothing left to do). Only ever "existing" — a row-level
       *  override deliberately can't create a new category/mark as transfer/skip; those stay exclusively
       *  group-level decisions (see RowOverride's doc comment). */}
      {showBulkMovePicker && (
        <CategoryPickerModal
          type={pickerType}
          categories={categories}
          txnCountByCategory={txnCountByCategory}
          selectedId=""
          onSelect={(id) => {
            const c = categories.find((x) => x.id === id);
            onMoveRowsToCategory([...selected], id, c?.name ?? id);
            setShowBulkMovePicker(false);
            setSelected(new Set());
          }}
          onClose={() => setShowBulkMovePicker(false)}
        />
      )}
    </View>
  );
}
