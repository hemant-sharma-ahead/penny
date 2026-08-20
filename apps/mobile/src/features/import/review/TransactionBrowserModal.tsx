import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { View, Pressable, ScrollView, Text, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Modal, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { RowCheckbox } from '~/components/shared';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { ThemeTokens } from '@penny/core/theme/tokens';
import { formatCurrency } from '@/lib/formatters';
import { toMonthYearKey, offsetMonth, monthChipLabel, monthLabel, toDateKey, formatDate } from '@/lib/date';
import type { ExpenseCategory, Person } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import type { CategoryAction } from '@/core/import/importCategoryResolution';
import {
  buildNormalizedPersons,
  classifyCounterparty,
  type CounterpartyRowClassification,
  type NormalizedPerson
} from '@/core/import/importCounterpartySplit';

/** Year-inclusive short date, matching `TileRowList.tsx`'s own `fmtShortDate`. */
function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** This tile's own effective category icon/color — every row in a tile shares the same resolution, so
 *  this is computed ONCE per popup open (not per row) and threaded down as a fixed value. Mirrors
 *  `ImportCategorizeModal.tsx`'s identical `selectedCat` lookup for 'existing', and the same
 *  transfer/create/skip icon vocabulary used elsewhere on this screen (`CategoryTile.tsx`'s
 *  `targetLabel`, `ImportCategorizeModal.tsx`'s `KIND_META`). */
function iconForSuggestion(
  suggestion: CategoryAction,
  categories: ExpenseCategory[],
  theme: ThemeTokens
): { icon: string; color: string } {
  if (suggestion.kind === 'existing') {
    const cat = categories.find((c) => c.id === suggestion.categoryId);
    return cat ? { icon: cat.icon, color: cat.color } : { icon: 'ti-tag', color: theme.textSecondary };
  }
  if (suggestion.kind === 'transfer') return { icon: 'ti-arrows-left-right', color: theme.info };
  if (suggestion.kind === 'create') return { icon: 'ti-square-plus', color: theme.primary };
  return { icon: 'ti-player-skip-forward', color: theme.textTertiary };
}

// ─── Month scrub bar — group-scoped sibling of `~/features/expenses/transactions/MonthScrubBar.tsx` ──
//
// Deliberately NOT an import of that real component: it lives in `features/expenses/transactions/`, a
// different feature module, and this repo's architecture rule (CLAUDE.md non-negotiable #3 / this app's
// own ESLint config) forbids a feature module importing another feature's files directly — only
// `core/`, `components/`, `context/`, `hooks/`, `lib/` are reachable across feature boundaries. Moving
// `MonthScrubBar`/`MonthPickerModal` into `components/shared/` to make a shared import legal would be a
// bigger, cross-cutting relocation affecting other call sites, not something this task asked for — so
// this is a small, self-contained sibling that reuses the exact same visual/interaction pattern (pinned
// "All" chip, horizontally scrollable month chips that auto-scroll the selected one into view, a
// calendar-icon jump-to-modal) against a caller-supplied, GROUP-scoped month list instead of the real
// component's app-wide one. See this task's write-up for the explicit judgment call.
interface GroupMonthScrubBarProps {
  months: string[];
  selected: string | null;
  onSelectMonth: (m: string) => void;
  onSelectAll: () => void;
  onOpenPicker: () => void;
}

function GroupMonthScrubBar({ months, selected, onSelectMonth, onSelectAll, onOpenPicker }: GroupMonthScrubBarProps) {
  const theme = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const chipOffsets = useRef<Map<string, number>>(new Map());
  const pendingScrollTo = useRef<string | null>(selected);

  const scrollToMonth = useCallback((m: string) => {
    const x = chipOffsets.current.get(m);
    if (x === undefined) return false;
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
    return true;
  }, []);

  useEffect(() => {
    pendingScrollTo.current = selected;
    if (selected && scrollToMonth(selected)) pendingScrollTo.current = null;
  }, [selected, scrollToMonth]);

  const handleChipLayout = useCallback(
    (m: string) => (e: LayoutChangeEvent) => {
      chipOffsets.current.set(m, e.nativeEvent.layout.x);
      if (pendingScrollTo.current === m && scrollToMonth(m)) pendingScrollTo.current = null;
    },
    [scrollToMonth]
  );

  return (
    <View className="flex-row items-center gap-[5px] px-3 py-2 border-t border-b border-theme">
      <Pressable
        onPress={onSelectAll}
        className="shrink-0 px-3 py-2 rounded-[10px] border border-theme"
        style={{
          backgroundColor: selected === null ? theme.primary : theme.surfaceSecondary,
          borderColor: selected === null ? 'transparent' : theme.border
        }}
        accessibilityLabel="Show all transactions in this group"
      >
        <Text
          className="text-[10.5px] font-extrabold"
          style={{ color: selected === null ? '#fff' : theme.textSecondary }}
        >
          All
        </Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-1"
        contentContainerStyle={{ gap: 6 }}
      >
        {months.map((m) => {
          const isSelected = selected === m;
          return (
            <Pressable
              key={m}
              onLayout={handleChipLayout(m)}
              onPress={() => onSelectMonth(m)}
              className="shrink-0 px-[11px] py-[7px] rounded-[10px] border border-theme"
              style={{
                backgroundColor: isSelected ? theme.primary : theme.surfaceSecondary,
                borderColor: isSelected ? 'transparent' : theme.border
              }}
            >
              <Text className="text-[10.5px] font-bold" style={{ color: isSelected ? '#fff' : theme.textSecondary }}>
                {monthChipLabel(m)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={onOpenPicker}
        className="shrink-0 w-8 h-8 items-center justify-center rounded-[10px] border border-theme"
        style={{ backgroundColor: theme.surfaceSecondary }}
        accessibilityLabel="Open month picker"
      >
        <Icon name="ti-calendar" size={15} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Group-scoped sibling of `~/features/expenses/transactions/MonthPickerModal.tsx` — same cross-feature-
 *  import constraint as `GroupMonthScrubBar` above. Bounded on BOTH ends (`minMonth`/`maxMonth`, the
 *  group's own date range) rather than just a max — the real `MonthPickerModal` only ever needed a max
 *  (today), since app-wide transaction history has no meaningful lower bound worth disabling months for. */
function GroupMonthPickerModal({
  value,
  minMonth,
  maxMonth,
  onSelect,
  onClose
}: {
  value: string;
  minMonth: string;
  maxMonth: string;
  onSelect: (m: string) => void;
  onClose: () => void;
}) {
  const theme = useThemeColors();
  const [year, setYear] = useState(() => parseInt(value.split('-')[0] ?? maxMonth.split('-')[0] ?? '0', 10));
  const minYear = parseInt(minMonth.split('-')[0] ?? '0', 10);
  const maxYear = parseInt(maxMonth.split('-')[0] ?? '0', 10);

  return (
    <Modal onClose={onClose} title="Select Month" size="sm">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => setYear((y) => y - 1)}
          disabled={year <= minYear}
          className="w-9 h-9 items-center justify-center rounded-lg"
          style={{ opacity: year <= minYear ? 0.3 : 1 }}
          accessibilityLabel="Previous year"
        >
          <Icon name="ti-chevron-left" size={18} color={theme.textSecondary} />
        </Pressable>
        <Text className="text-base font-semibold text-primary">{year}</Text>
        <Pressable
          onPress={() => setYear((y) => y + 1)}
          disabled={year >= maxYear}
          className="w-9 h-9 items-center justify-center rounded-lg"
          style={{ opacity: year >= maxYear ? 0.3 : 1 }}
          accessibilityLabel="Next year"
        >
          <Icon name="ti-chevron-right" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {MONTH_LABELS_SHORT.map((label, idx) => {
          const m = `${year}-${String(idx + 1).padStart(2, '0')}`;
          const isSelected = m === value;
          const isDisabled = m < minMonth || m > maxMonth;
          return (
            <Pressable
              key={m}
              onPress={() => {
                onSelect(m);
                onClose();
              }}
              disabled={isDisabled}
              className="py-2.5 rounded-xl items-center"
              style={{
                width: '22%',
                opacity: isDisabled ? 0.3 : 1,
                backgroundColor: isSelected ? theme.primary : theme.surfaceSecondary
              }}
            >
              <Text className="text-sm font-medium" style={{ color: isSelected ? '#fff' : theme.textSecondary }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

// ─── Row list — virtualized (FlashList) since a group can genuinely hold thousands of rows ─────────────

interface BrowserHeaderItem {
  type: 'header';
  key: string;
  label: string;
}
interface BrowserRowItem {
  type: 'row';
  key: string;
  row: ParsedRow;
  index: number;
  counterparty?: CounterpartyRowClassification;
  overrideCategoryName?: string;
  overrideTag?: string;
}
type BrowserListItem = BrowserHeaderItem | BrowserRowItem;

/** Selection state for the visible rows — a separate context (not plain props threaded through
 *  `renderItem`) so `renderItem`'s own identity stays stable across every checkbox tap, matching
 *  `TransactionsTab.tsx`'s identical `SelectionContext` fix (see that file's doc comment for the exact
 *  FlashList `ViewHolder` memoization mechanism this avoids re-triggering for every mounted cell on a
 *  single tap, not just the one tapped). */
const RowSelectionContext = createContext<{
  uncheckedIndices: Set<number>;
  onToggleRow: (index: number) => void;
}>({ uncheckedIndices: new Set(), onToggleRow: () => {} });

const BrowserRow = memo(function BrowserRow({
  row,
  index,
  counterparty,
  overrideCategoryName,
  overrideTag,
  icon,
  iconColor
}: {
  row: ParsedRow;
  index: number;
  counterparty?: CounterpartyRowClassification;
  overrideCategoryName?: string;
  overrideTag?: string;
  icon: string;
  iconColor: string;
}) {
  const theme = useThemeColors();
  const { uncheckedIndices, onToggleRow } = useContext(RowSelectionContext);
  const checked = !uncheckedIndices.has(index);

  return (
    <Pressable onPress={() => onToggleRow(index)} className="flex-row items-center gap-2.5 py-2 border-b border-theme">
      <RowCheckbox checked={checked} size={15} />
      <View
        className="w-[30px] h-[30px] rounded-[9px] items-center justify-center shrink-0"
        style={{ backgroundColor: tint(iconColor, 15) }}
      >
        <Icon name={icon} size={14} color={iconColor} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-xs font-medium text-primary" numberOfLines={1}>
          {row.description}
        </Text>
        <Text className="text-[9.5px] text-tertiary" numberOfLines={1}>
          {fmtShortDate(row.date)}
          {row.account ? ` · ${row.account}` : ''}
          {overrideCategoryName && <Text style={{ color: theme.primary }}> · moved to {overrideCategoryName}</Text>}
          {overrideTag && <Text style={{ color: theme.info }}> · #{overrideTag}</Text>}
        </Text>
        {counterparty && (
          <View className="flex-row mt-1">
            <View
              className="rounded-full px-1.5 py-0.5"
              style={{
                backgroundColor: counterparty.confidence === 'residual' ? theme.surfaceTertiary : tint(theme.info, 16)
              }}
            >
              <Text
                className="text-[8px] font-bold"
                style={{ color: counterparty.confidence === 'residual' ? theme.textSecondary : theme.info }}
              >
                {counterparty.label}
              </Text>
            </View>
          </View>
        )}
      </View>
      <View className="items-end shrink-0">
        <Text
          className="text-[11.5px] font-semibold"
          style={{ color: row.type === 'income' ? theme.success : theme.textPrimary }}
        >
          {row.type === 'income' ? '+' : ''}
          {formatCurrency(row.amount)}
        </Text>
      </View>
    </Pressable>
  );
});

// ─── Main modal ──────────────────────────────────────────────────────────────────────────────────────

export interface TransactionBrowserSelection {
  uncheckedIndices: Set<number>;
  onToggleRow: (index: number) => void;
  /** Batch variant (2026-08-20) — used by this popup's month-scoped "Select all"/"Clear" control, which
   *  `TileRowList.tsx`'s own single-index `onToggleRow` can't express without an N-call loop. */
  onSetChecked: (indices: number[], checked: boolean) => void;
}

interface TransactionBrowserModalProps {
  /** The tile's raw source category name, unquoted — this component applies its own quoting, matching
   *  `CategoryTile.tsx`'s header convention now that counterparty-split's `isSplitChild` dash-prefixed
   *  form no longer exists (2026-08-20, counterparty-split removal — every tile is a plain, unsplit
   *  source category again). */
  sourceName: string;
  targetLabel: ReactNode;
  /** ALL of this tile's rows (never capped) — most-recent-first, already sorted by
   *  `importTransactionsGrouping.ts`. */
  rows: { row: ParsedRow; index: number }[];
  rowOverrides: Map<number, RowOverride>;
  categories: ExpenseCategory[];
  /** For the per-row counterparty chip's Person-match lookup — omit/empty renders every row's chip at
   *  low/residual confidence, same as `splitByCounterparty` would with no persons to match against. */
  persons?: Person[];
  /** Whether this tile's category is transfer- or IOU-suspect (2026-08-20, counterparty-split removal) —
   *  mirrors `shouldSplitByCounterparty`'s own gate, applied per-row now instead of forking into
   *  separate top-level groups. `false` for an ordinary spend category renders no counterparty chip at
   *  all — there's nothing counterparty-shaped about a groceries row. */
  showCounterparty: boolean;
  /** The tile's current effective suggestion — drives every row's shared icon/color (see
   *  `iconForSuggestion`). */
  suggestion: CategoryAction;
  selection: TransactionBrowserSelection;
  /** Opens the real, unchanged `ImportCategorizeModal` for the tile's current checked selection — this
   *  popup never redesigns that flow, it just closes itself first (`onClose`) so the two don't stack. */
  onOpenCategorize: () => void;
  onClose: () => void;
}

/**
 * Full-screen transaction browser for a high-volume category-resolution tile (2026-08-20, CSV-import
 * transaction-browser feature) — `docs/mockups/proposals/csv-import-transaction-browser-v2.html`.
 * Reuses the shared `Modal` primitive (centered, near-full-height via an explicit body height rather
 * than a bottom sheet — see `modalBodyHeight` below), `RowCheckbox`, and this tile's own selection state
 * (`uncheckedIndices`/`onToggleRow`, owned by `CategoryTile.tsx` — this component never creates its own
 * parallel copy, so ticking a row here or in the tile's inline `TileRowList` preview is always the same
 * underlying state).
 */
export function TransactionBrowserModal({
  sourceName,
  targetLabel,
  rows,
  rowOverrides,
  categories,
  persons = [],
  showCounterparty,
  suggestion,
  selection,
  onOpenCategorize,
  onClose
}: TransactionBrowserModalProps) {
  const theme = useThemeColors();
  const { height: screenHeight } = useWindowDimensions();
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // Near-full-height card (approved mockup — a centered Modal, never a bottom sheet, just sized to fill
  // almost all of it) — `Modal.tsx`'s own backdrop reserves 56px top / 72px below the card, and its body
  // wrapper adds a further 20px of padding on each side; subtracting both gives this single child
  // exactly the height available inside the card, so the FlashList below can flex to fill it instead of
  // the whole card collapsing to fit its (otherwise auto-sized) content.
  const modalBodyHeight = screenHeight - 56 - 72 - 40;

  const { icon, color: iconColor } = useMemo(
    () => iconForSuggestion(suggestion, categories, theme),
    [suggestion, categories, theme]
  );
  const normalizedPersons: NormalizedPerson[] = useMemo(() => buildNormalizedPersons(persons), [persons]);

  const groupMonths = useMemo(() => {
    if (rows.length === 0) return [];
    let min = Infinity;
    let max = -Infinity;
    for (const { row } of rows) {
      if (row.date < min) min = row.date;
      if (row.date > max) max = row.date;
    }
    const minKey = toMonthYearKey(new Date(min));
    const maxKey = toMonthYearKey(new Date(max));
    const list: string[] = [];
    let m = minKey;
    let guard = 0;
    while (m <= maxKey && guard < 1200) {
      list.push(m);
      m = offsetMonth(m, 1);
      guard++;
    }
    return list;
  }, [rows]);
  const minMonth = groupMonths[0] ?? toMonthYearKey();
  const maxMonth = groupMonths[groupMonths.length - 1] ?? toMonthYearKey();

  const filteredRows = useMemo(() => {
    if (activeMonth === null) return rows;
    return rows.filter(({ row }) => toMonthYearKey(new Date(row.date)) === activeMonth);
  }, [rows, activeMonth]);

  const listItems = useMemo<BrowserListItem[]>(() => {
    const items: BrowserListItem[] = [];
    let lastHeaderKey: string | null = null;
    for (const { row, index } of filteredRows) {
      const headerKey = activeMonth === null ? toMonthYearKey(new Date(row.date)) : toDateKey(row.date);
      if (headerKey !== lastHeaderKey) {
        items.push({
          type: 'header',
          key: `h-${headerKey}`,
          label: activeMonth === null ? monthLabel(headerKey) : formatDate(row.date)
        });
        lastHeaderKey = headerKey;
      }
      const override = rowOverrides.get(index);
      const counterparty = showCounterparty ? classifyCounterparty(row.description, normalizedPersons) : undefined;
      items.push({
        type: 'row',
        key: `r-${index}`,
        row,
        index,
        counterparty,
        overrideCategoryName: override?.categoryName,
        overrideTag: override?.tag
      });
    }
    return items;
  }, [filteredRows, activeMonth, rowOverrides, showCounterparty, normalizedPersons]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<BrowserListItem>) => {
      if (item.type === 'header') {
        return (
          <Text
            className="text-[9.5px] font-extrabold uppercase tracking-wide text-tertiary"
            style={{ paddingTop: 10, paddingBottom: 4 }}
          >
            {item.label}
          </Text>
        );
      }
      return (
        <BrowserRow
          row={item.row}
          index={item.index}
          counterparty={item.counterparty}
          overrideCategoryName={item.overrideCategoryName}
          overrideTag={item.overrideTag}
          icon={icon}
          iconColor={iconColor}
        />
      );
    },
    [icon, iconColor]
  );

  const totalCount = rows.length;
  const checkedCount = totalCount - selection.uncheckedIndices.size;

  // Scope for "Select all"/"Clear" (approved mockup's v2 correction #3) — the active month's own row
  // indices, or the whole group under "All". Deliberately distinct from `TileRowList.tsx`'s own
  // whole-group-only inline "Select all"/"Unselect all" row, which has no month concept to scope to.
  const scopeIndices = useMemo(() => filteredRows.map(({ index }) => index), [filteredRows]);
  const scopeCheckedCount = useMemo(
    () => scopeIndices.filter((i) => !selection.uncheckedIndices.has(i)).length,
    [scopeIndices, selection.uncheckedIndices]
  );
  const scopeAllChecked = scopeIndices.length > 0 && scopeCheckedCount === scopeIndices.length;

  function handleScopedSelectAll() {
    selection.onSetChecked(scopeIndices, !scopeAllChecked);
  }

  const selectionContextValue = useMemo(
    () => ({ uncheckedIndices: selection.uncheckedIndices, onToggleRow: selection.onToggleRow }),
    [selection.uncheckedIndices, selection.onToggleRow]
  );

  const viewingLabel =
    activeMonth === null
      ? 'Viewing: All time'
      : `Viewing: ${monthLabel(activeMonth)} · ${scopeIndices.length} in this month`;

  return (
    <>
      <Modal onClose={onClose}>
        <View style={{ height: modalBodyHeight }}>
          {/* Header — group name → target category, plus a close button (this popup's own "back"
           *  affordance — it's a full-screen sub-view, not a bottom sheet). */}
          <View className="flex-row items-start gap-2 pb-2">
            <View className="flex-1 min-w-0">
              <Text className="text-sm font-extrabold text-primary" numberOfLines={1}>
                &quot;{sourceName}&quot; <Text className="text-tertiary">→</Text> {targetLabel}
              </Text>
              <Text className="text-[10px] text-tertiary" style={{ marginTop: 1 }}>
                Browse & select which transactions to categorize
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="w-7 h-7 items-center justify-center rounded-lg"
              accessibilityLabel="Close"
            >
              <Icon name="ti-x" size={18} color={theme.textTertiary} />
            </Pressable>
          </View>

          <Text className="text-xs font-bold text-primary" style={{ paddingBottom: 8 }}>
            <Text style={{ color: theme.primary }}>{checkedCount}</Text> of {totalCount} selected
          </Text>

          <View className="flex-row items-center justify-between" style={{ paddingBottom: 10 }}>
            <Pressable onPress={handleScopedSelectAll} className="flex-row items-center gap-2">
              <RowCheckbox checked={scopeAllChecked} size={15} />
              <Text className="text-[10.5px] font-bold text-secondary">{scopeAllChecked ? 'Clear' : 'Select all'}</Text>
            </Pressable>
            <Text className="text-[9.5px] font-bold text-tertiary">
              {activeMonth !== null &&
                (scopeIndices.length > 0
                  ? `${scopeCheckedCount}/${scopeIndices.length} this month`
                  : 'none this month')}
            </Text>
          </View>

          <GroupMonthScrubBar
            months={groupMonths}
            selected={activeMonth}
            onSelectMonth={setActiveMonth}
            onSelectAll={() => setActiveMonth(null)}
            onOpenPicker={() => setShowMonthPicker(true)}
          />

          <View className="flex-row justify-between" style={{ paddingTop: 6, paddingBottom: 4 }}>
            <Text className="text-[9px] text-tertiary">{viewingLabel}</Text>
            <Text className="text-[9px] text-tertiary">{groupMonths.length} months scrollable</Text>
          </View>

          {listItems.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-xs text-tertiary">
                No transactions in {activeMonth ? monthLabel(activeMonth) : 'this group'}
              </Text>
            </View>
          ) : (
            <RowSelectionContext.Provider value={selectionContextValue}>
              <View className="flex-1">
                <FlashList
                  data={listItems}
                  keyExtractor={(item) => item.key}
                  getItemType={(item) => item.type}
                  renderItem={renderItem}
                  drawDistance={500}
                />
              </View>
            </RowSelectionContext.Provider>
          )}

          <View className="border-t border-theme" style={{ paddingTop: 12 }}>
            <Button
              variant="primary"
              fullWidth
              disabled={checkedCount === 0}
              onPress={() => {
                onClose();
                onOpenCategorize();
              }}
            >
              {`Categorize ${checkedCount} selected ›`}
            </Button>
          </View>
        </View>
      </Modal>

      {showMonthPicker && (
        <GroupMonthPickerModal
          value={activeMonth ?? maxMonth}
          minMonth={minMonth}
          maxMonth={maxMonth}
          onSelect={setActiveMonth}
          onClose={() => setShowMonthPicker(false)}
        />
      )}
    </>
  );
}
