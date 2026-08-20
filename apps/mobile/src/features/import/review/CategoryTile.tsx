import { useState, type ReactNode } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, ExpenseCategory, Hashtag, Person } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import { intentGroupLabel, type CategoryResolution, type CategoryAction } from '@/core/import/importCategoryResolution';
import { TileRowList } from './TileRowList';
import { ImportCategorizeModal } from './ImportCategorizeModal';
import { TransactionBrowserModal } from './TransactionBrowserModal';

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
  /** Real accounts eligible as this tile's transfer destination (2026-08-09 fix) — already excludes
   *  this import's own target account; see `PreviewSection.tsx`'s doc comment. Forwarded to
   *  `ImportCategorizeModal`'s "Transfer to account" picker. */
  transferAccountOptions: Account[];
  /** Per-category existing-transaction counts, forwarded through to `ImportCategorizeModal` →
   *  `CategoryPickerModal`'s own `txnCountByCategory` prop for its "Frequent" quick-pick row. See
   *  `useImport.ts`'s doc comment. */
  txnCountByCategory: Map<string, number>;
  /** The custom tag (if any) the user has set for every transaction under this source category —
   *  independent of which category it resolves to (existing/create/transfer/skip). */
  tag: string;
  /** Per-row overrides (2026-08-06), keyed by index into `parsedRows` — see `RowOverride`'s doc
   *  comment. Read here to compute the checked subset's own shared tag (fed to the modal as its seed
   *  value) and to show each overridden row's actual target category/tag inside `TileRowList`. */
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
  /** Disambiguates this tile's header when the same source name produced two homogeneous tiles
   *  (2026-08-13, review redesign issue #10 — a tile never mixes expense/income) — only ever set when a
   *  sibling tile genuinely exists for the SAME `sourceName` with the other type; never shown otherwise
   *  so a normal, unambiguous tile's header stays uncluttered. */
  typeSuffix?: 'expense' | 'income';
  /** "Remembered — {categoryName}" suggestion (2026-08-13, review redesign issue #8) — undefined when
   *  no remembered category exists for this tile's `sourceName`, or when it exactly matches the current
   *  suggestion already (nothing new to offer). Forwarded to `ImportCategorizeModal` as a one-tap
   *  prefill (2026-08-13, bucket-tiles redesign — moved out of the tile header along with every other
   *  resolution control). */
  rememberedSuggestion?: { categoryId: string; categoryName: string };
  /** "Looks good, use this" (2026-08-13, bucket-tiles redesign) — marks an unconfirmed 'create'
   *  suggestion reviewed-and-accepted-as-is, WITHOUT changing it (unlike picking a kind in the modal,
   *  which always changes the suggestion too). Only ever called for a `suggestion.kind === 'create'`
   *  tile that isn't yet `decided`. */
  onAcknowledge: () => void;
  /** IOU (Lent/Borrowed) pass-through (2026-08-14, redesign §9.6, Issue #8) — forwarded to
   *  `ImportCategorizeModal`'s Lent/Borrowed panel. `initialIouPersonName` is the current standing value
   *  (whatever was last saved for this tile, or the detected counterparty seed the very first time this
   *  tile's modal opens). */
  iouPersons?: Person[];
  /** Tag suggestions for `ImportCategorizeModal`'s tag field (2026-08-20, item 41 real-device testing
   *  pass) — forwarded straight through; see that component's own doc comment. */
  hashtags?: Hashtag[];
  initialIouPersonName?: string;
  /** Applies to a FULL-tile apply (`onApplyFull`) — the group-level IOU person, keyed by this tile's own
   *  fullKey. Never used for a partial-selection apply — see `onSetRowIouPersonNames` below. */
  onIouPersonNameChange?: (name: string) => void;
  /** Applies to a PARTIAL-selection apply (`onApplyPartial`) — code-review fix: a bulk-move of just the
   *  checked subset to a different EXISTING category must capture the IOU person PER ROW INDEX
   *  (`checkedIndices`), never under this tile's own group-level fullKey — those rows are leaving this
   *  group entirely via a `RowOverride`, so a group-keyed save would either get silently dropped (the
   *  group-level IOU check no longer applies to them) or leak onto whichever rows stay behind. */
  onSetRowIouPersonNames?: (rowIndices: number[], name: string) => void;
  isInvestmentMovement?: boolean;
  /** Whether this tile's source category is transfer- or IOU-suspect (2026-08-20, counterparty-split
   *  removal) — mirrors `shouldSplitByCounterparty`'s own gate, now applied per-row inside
   *  `TransactionBrowserModal.tsx`'s popup instead of forking rows into separate top-level tiles. */
  isTransferSuspect?: boolean;
  isIouSuspect?: boolean;
  /** Creates a real `ExpenseCategory` immediately (2026-08-20, item 41 flow redesign) — forwarded
   *  straight through to `ImportCategorizeModal`'s "Create" kind, which now opens the real
   *  `CategoryEditorModal` instead of its old bespoke inline name+group fields. See `useImport.ts`'s
   *  `createCategory` doc comment. */
  onCreateCategory: (cat: ExpenseCategory) => Promise<void>;
}

/**
 * RN port of apps/web-react/src/features/import/review/CategoryTile.tsx, collapsed to a bucket-card
 * header (2026-08-13, bucket-tiles redesign — porting Bank Import's `UnmatchedBucket.tsx` model). The
 * tile itself renders the header (source → target/pill + count + chevron), the row list when expanded
 * (`TileRowList`, unchanged), and an always-visible "Categorize N selected ›" + "Skip" footer. Every
 * resolution control that used to sit always-visible in the header — the kind picker, the tag box, the
 * create/transfer conditional fields, and the unconfirmed-'create' gate block — lives in
 * `ImportCategorizeModal.tsx`, opened by the "Categorize" footer button.
 *
 * Lives only in the Transactions stage (2026-08-20, item 41 flow redesign removed the separate
 * "Categories" wizard stage that used to also render a collapsed, non-expandable variant of this tile
 * via `CategoryResolutionRow.tsx` — this tile's `effectiveSuggestion`-driven smart pre-resolve, plus its
 * own "Categorize N selected ›" override, already covers what that stage used to gate on).
 */
export function CategoryTile({
  resolution,
  decided,
  status,
  rows,
  categories,
  transferAccountOptions,
  txnCountByCategory,
  tag,
  rowOverrides,
  onTagChange,
  onUpdate,
  onMoveRowsToCategory,
  onTagRows,
  typeSuffix,
  rememberedSuggestion,
  onAcknowledge,
  iouPersons,
  hashtags,
  initialIouPersonName,
  onIouPersonNameChange,
  onSetRowIouPersonNames,
  isInvestmentMovement,
  isTransferSuspect,
  isIouSuspect,
  onCreateCategory
}: CategoryTileProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [showCategorizeModal, setShowCategorizeModal] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  // Bulk-select (2026-08-06, flipped to an opt-OUT model 2026-08-13 — review redesign issues #1/#9):
  // which of THIS tile's rows (by their original parsedRows index) the user has explicitly UNCHECKED.
  // Starting empty means every row starts CHECKED — matching Bank Import's `UnmatchedBucket.tsx`
  // "everything checked, track the exceptions" convention, and trivially solving the "unselect all must
  // cover every row, not just rendered ones" requirement, since this model doesn't care what's rendered
  // at all (see `toggleSelectAll` below). Local to this tile; not persisted anywhere, so it resets if
  // the tile unmounts (e.g. collapsing/reopening Preview).
  const [uncheckedIndices, setUncheckedIndices] = useState<Set<number>>(new Set());
  const { suggestion, sourceName } = resolution;
  /** A source category's rows are overwhelmingly one direction in practice (e.g. "Salary" is always
   *  income) — pick whichever the majority of this category's rows actually are, so
   *  `ImportCategorizeModal`'s "Map to existing" opens the picker filtered to the right applicableTo
   *  (income vs expense) categories. */
  const pickerType: 'expense' | 'income' =
    rows.filter((r) => r.row.type === 'income').length > rows.length / 2 ? 'income' : 'expense';

  // Checked indices derive from the opt-out `uncheckedIndices` set (2026-08-13), never from what's
  // currently rendered — see `uncheckedIndices`' own doc comment above.
  const checkedIndices = rows.map((r) => r.index).filter((i) => !uncheckedIndices.has(i));
  const checkedCount = checkedIndices.length;
  const isPartialSelection = checkedCount > 0 && checkedCount < rows.length;

  function toggleRow(index: number) {
    setUncheckedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // Master toggle (2026-08-13, review redesign issue #9) — always covers every one of `rows`, never
  // just whatever's currently rendered under the 8-row cap.
  function toggleSelectAll() {
    setUncheckedIndices((prev) => (prev.size === 0 ? new Set(rows.map((r) => r.index)) : new Set()));
  }

  // Batch variant (2026-08-20, `TransactionBrowserModal.tsx`'s month-scoped "Select all"/"Clear") — sets
  // exactly the given indices to `checked`, leaving every other index's state untouched. Distinct from
  // `toggleSelectAll` above, which always covers the whole tile.
  function setCheckedForIndices(indices: number[], checked: boolean) {
    setUncheckedIndices((prev) => {
      const next = new Set(prev);
      for (const i of indices) {
        if (checked) next.delete(i);
        else next.add(i);
      }
      return next;
    });
  }

  // The modal's tag field switches meaning based on selection, exactly as the tile's former inline tag
  // box already did (2026-08-06, per explicit user request): with a strict subset checked, it seeds from
  // ONLY those rows' individual tag overrides instead of the whole tile's group-level tag. If the
  // selected rows don't all already share the exact same tag override, seed blank rather than an
  // arbitrary one of them.
  const selectedTags = new Set(checkedIndices.map((i) => rowOverrides.get(i)?.tag ?? ''));
  const modalInitialTag = isPartialSelection ? (selectedTags.size === 1 ? ([...selectedTags][0] ?? '') : '') : tag;

  // Collapsed-header signals (2026-08-13, bucket-tiles redesign, decision #3): an unconfirmed 'create'
  // guess shows its suggested target PLUS a distinct "Needs confirming" badge (info-blue/help-circle,
  // deliberately NOT the same warning-amber/alert-triangle vocabulary as the tile's own attention border,
  // so the two signals never blur together). Any other still-undecided kind (e.g. 'transfer' with no
  // destination account yet) has no specific target worth showing yet, so it falls back to the generic
  // dashed "Needs categorizing" pill instead — same visual language as the old "Choose…" pill, relabeled.
  const needsConfirming = !decided && suggestion.kind === 'create';
  const showChoosePill = !decided && suggestion.kind !== 'create';

  const transferToAccountName =
    suggestion.kind === 'transfer'
      ? (transferAccountOptions.find((a) => a.id === suggestion.toAccountId)?.name ?? '')
      : '';

  const targetLabel: ReactNode =
    suggestion.kind === 'existing' ? (
      suggestion.categoryName
    ) : suggestion.kind === 'transfer' ? (
      <Text style={{ color: theme.info }}>Transfer{transferToAccountName ? ` → ${transferToAccountName}` : ''}</Text>
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

  const header = (
    <View className="flex-1 flex-row items-center gap-1.5 flex-wrap">
      <Text className="text-xs font-semibold text-primary flex-shrink" numberOfLines={1}>
        {`"${sourceName}"`}
        {typeSuffix && (
          <Text className="text-tertiary" style={{ fontWeight: '400' }}>
            {' '}
            ({typeSuffix})
          </Text>
        )}
      </Text>
      {isInvestmentMovement && (
        <View
          className="flex-row items-center gap-1 rounded-full px-1.5 py-0.5"
          style={{ backgroundColor: tint(theme.info, 16) }}
        >
          <Icon name="ti-chart-line" size={9} color={theme.info} />
          <Text className="text-[7.5px] font-extrabold uppercase tracking-wide" style={{ color: theme.info }}>
            Investment
          </Text>
        </View>
      )}
      <Icon name="ti-arrow-right" size={12} color={theme.textTertiary} />
      {showChoosePill ? (
        <View className="rounded-full border border-dashed px-2 py-0.5" style={{ borderColor: theme.border }}>
          <Text className="text-[10.5px] font-medium italic text-tertiary">Needs categorizing</Text>
        </View>
      ) : (
        <Text className="text-xs font-semibold text-primary flex-shrink" numberOfLines={1}>
          {targetLabel}
        </Text>
      )}
      {needsConfirming && (
        <View
          className="flex-row items-center gap-1 rounded-full px-1.5 py-0.5"
          style={{ backgroundColor: tint(theme.info, 18) }}
        >
          <Icon name="ti-help-circle" size={10} color={theme.info} />
          <Text className="text-[8px] font-extrabold uppercase tracking-wide" style={{ color: theme.info }}>
            Needs confirming
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View className="rounded-xl overflow-hidden border border-theme">
      {/* Header — the only always-visible resolution info now: source → target/pill, an unconfirmed-
       *  'create' badge, count, and the row-list expand toggle. Tapping anywhere on the header row
       *  expands/collapses the transaction list below (same affordance as the trailing chevron). Status
       *  color is scoped to just this header background (2026-08-13, per explicit user feedback comparing
       *  on-device screenshots against Bank Import's `UnmatchedBucket.tsx` — the outer card used to tint
       *  its ENTIRE background/border by status, including the footer button area; the card shell itself
       *  now stays a constant neutral `border-theme`, and the body/footer below get an explicit neutral
       *  `theme.surface` background so they don't inherit this tint). The badge shows `rows.length` (the
       *  actual current row count), not `resolution.count` (2026-08-20, item 41 real-device testing pass
       *  — `resolution.count` is a fixed count computed once per source category and never recomputed
       *  against a partial-move override, so it goes stale the moment some-but-not-all of this tile's
       *  rows get moved elsewhere). */}
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        accessibilityLabel={expanded ? 'Hide transactions' : 'Show transactions'}
        className="p-3 flex-row items-center gap-2"
        style={{ backgroundColor: tint(statusColor, status === 'ready' ? 10 : 20) }}
      >
        {header}
        <View className="rounded-full bg-surface-3 px-1.5 py-0.5 flex-shrink-0">
          <Text className="text-[9.5px] font-bold text-secondary">
            {rows.length} txn{rows.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>

      {/* Body — transactions, each with a bulk-select checkbox (2026-08-06, opt-out model + shared
       *  row-list rendering 2026-08-13 — see `TileRowList.tsx`). Only shown when expanded; the footer
       *  actions below stay visible regardless. */}
      {expanded && (
        <View className="border-t border-theme px-3 py-2.5" style={{ backgroundColor: theme.surface }}>
          <TileRowList
            rows={rows}
            rowOverrides={rowOverrides}
            selection={{ uncheckedIndices, onToggleRow: toggleRow, onToggleAll: toggleSelectAll }}
            onSeeAll={() => setShowBrowser(true)}
          />
        </View>
      )}

      {/* Always-visible footer actions (2026-08-13, bucket-tiles redesign; "Skip" added 2026-08-14,
       *  manual-testing refinement #1) — exact same convention as Bank Import's `UnmatchedBucket.tsx`
       *  merchant-group footer: a correctly-grouped tile must be actionable straight off the collapsed
       *  card; expanding the row list above is only for inspecting/excepting individual rows, never
       *  required before acting. "Skip" is deliberately GROUP-level-only — it always applies to the
       *  WHOLE group regardless of the checked/selected subset (consistent with `RowOverride` never
       *  supporting a per-row 'skip'), applies immediately with no modal and no confirmation (skipping is
       *  already fully recoverable — the Skipped bucket + re-categorize-anytime-before-commit already
       *  exist). */}
      <View className="border-t border-theme px-3 py-2.5 flex-row gap-2" style={{ backgroundColor: theme.surface }}>
        <View className="flex-1">
          <Button
            variant="secondary"
            size="sm"
            icon="ti-category"
            disabled={checkedCount === 0}
            onPress={() => setShowCategorizeModal(true)}
          >
            {`Categorize ${checkedCount} selected ›`}
          </Button>
        </View>
        <Button variant="ghost" size="sm" icon="ti-player-skip-forward" onPress={() => onUpdate({ kind: 'skip' })}>
          Skip
        </Button>
      </View>

      {showCategorizeModal && (
        <ImportCategorizeModal
          sourceName={sourceName}
          suggestion={suggestion}
          decided={decided}
          totalCount={rows.length}
          checkedCount={checkedCount}
          isPartialSelection={isPartialSelection}
          initialTag={modalInitialTag}
          categories={categories}
          transferAccountOptions={transferAccountOptions}
          txnCountByCategory={txnCountByCategory}
          pickerType={pickerType}
          rememberedSuggestion={rememberedSuggestion}
          iouPersons={iouPersons}
          hashtags={hashtags}
          initialIouPersonName={initialIouPersonName}
          onCreateCategory={onCreateCategory}
          onApplyFull={(action, newTag, iouPersonName) => {
            onUpdate(action);
            if (newTag !== tag) onTagChange(newTag);
            if (iouPersonName !== undefined) onIouPersonNameChange?.(iouPersonName);
            setShowCategorizeModal(false);
          }}
          onApplyPartial={(categoryId, categoryName, newTag, iouPersonName) => {
            onMoveRowsToCategory(checkedIndices, categoryId, categoryName);
            if (newTag !== modalInitialTag) onTagRows(checkedIndices, newTag);
            // Per-row, NOT this tile's own group-level `onIouPersonNameChange` — see
            // `onSetRowIouPersonNames`'s own doc comment for why.
            if (iouPersonName !== undefined) onSetRowIouPersonNames?.(checkedIndices, iouPersonName);
            // Reset back to "everything checked" (2026-08-13) — the moved rows relocate out of this
            // tile entirely once the Transactions stage recomputes, so there's nothing stale left here.
            setUncheckedIndices(new Set());
            setShowCategorizeModal(false);
          }}
          onAcknowledge={() => {
            onAcknowledge();
            setShowCategorizeModal(false);
          }}
          onClose={() => setShowCategorizeModal(false)}
        />
      )}

      {showBrowser && (
        <TransactionBrowserModal
          sourceName={sourceName}
          targetLabel={targetLabel}
          rows={rows}
          rowOverrides={rowOverrides}
          categories={categories}
          persons={iouPersons}
          showCounterparty={!!isTransferSuspect || !!isIouSuspect}
          suggestion={suggestion}
          selection={{ uncheckedIndices, onToggleRow: toggleRow, onSetChecked: setCheckedForIndices }}
          onOpenCategorize={() => {
            setShowBrowser(false);
            setShowCategorizeModal(true);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </View>
  );
}
