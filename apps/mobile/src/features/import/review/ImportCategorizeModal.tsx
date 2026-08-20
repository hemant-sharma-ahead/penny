import { useMemo, useState, type ReactNode } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal, Button, Banner, SelectInput, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, ExpenseCategory, Hashtag, Person } from '@/core/db/types';
import { IOU_MANDATORY_CATEGORY_IDS, INTENT_GROUP_META } from '@/core/db/defaultCategories';
import { buildParentCategoryMap } from '@/core/expenses/categoryGroups';
import {
  isLikelyTransfer,
  intentGroupLabel,
  suggestIntentGroup,
  transferCategoryOptions,
  type CategoryAction
} from '@/core/import/importCategoryResolution';
import { CategoryPickerModal } from '~/features/expenses/categories/CategoryPickerModal';
import { CategoryEditorModal, type GroupOption } from '~/features/expenses/categories/CategoryEditorModal';
import { ExtraCircle } from '~/components/shared/ExtraCircle';

/** Same border-notched-label wrapper `CategoryTile.tsx`/`AccountsSection.tsx` each already have their own
 *  copy of — a third local copy here follows that same established (if duplicative) single-consumer
 *  convention rather than introducing a new shared file for one small presentational wrapper. */
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

const KIND_META: Record<CategoryAction['kind'], { label: string; icon: string }> = {
  existing: { label: 'Map to existing', icon: 'ti-tag' },
  create: { label: 'Create new', icon: 'ti-square-plus' },
  transfer: { label: 'Mark as transfer', icon: 'ti-arrows-left-right' },
  skip: { label: 'Skip', icon: 'ti-player-skip-forward' }
};

function KindTile({
  kind,
  selected,
  disabled,
  suggested,
  onPress
}: {
  kind: CategoryAction['kind'];
  selected: boolean;
  disabled: boolean;
  suggested: boolean;
  onPress: () => void;
}) {
  const theme = useThemeColors();
  const meta = KIND_META[kind];
  const borderColor = selected ? theme.primary : theme.border;
  const backgroundColor = selected ? tint(theme.primary, 12) : theme.surfaceTertiary;
  const color = disabled ? theme.textTertiary : selected ? theme.primary : theme.textSecondary;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="flex-1 items-center gap-1 rounded-xl border py-2.5 px-1"
      style={{ borderColor, backgroundColor, opacity: disabled ? 0.45 : 1 }}
    >
      <Icon name={meta.icon} size={16} color={color} />
      <Text className="text-[10px] font-bold text-center" style={{ color }}>
        {meta.label}
        {suggested ? ' ✨' : ''}
      </Text>
    </Pressable>
  );
}

interface ImportCategorizeModalProps {
  sourceName: string;
  /** The tile's own group-level resolution — the initial/seed value when applying to the WHOLE
   *  selection, and the value the "Looks good, use this" shortcut compares against. Never mutated
   *  directly; edits live in this modal's own local state until Apply. */
  suggestion: CategoryAction;
  decided: boolean;
  /** Total rows in the tile this modal was opened from (for the "N of M selected" line). */
  totalCount: number;
  /** How many of the tile's rows are currently checked — what Apply will actually act on. */
  checkedCount: number;
  /** True when a STRICT subset of the tile's rows is checked. A row-level override
   *  (`RowOverride`, see `importPipeline.ts`) can only ever move rows to an EXISTING category — it can't
   *  create a new one, mark a transfer, or skip, since those stay exclusively group-level decisions. This
   *  restricts the kind picker to "Map to existing category" only in that case. */
  isPartialSelection: boolean;
  /** Seed value for the tag field — the tile's own group tag, or (once `isPartialSelection`) the checked
   *  subset's own shared row-override tag, computed exactly as `CategoryTile.tsx`'s former inline tag box
   *  already did (blank if the selection's overrides don't already share one exact tag). */
  initialTag: string;
  categories: ExpenseCategory[];
  transferAccountOptions: Account[];
  txnCountByCategory: Map<string, number>;
  pickerType: 'expense' | 'income';
  /** "Remembered — {categoryName}" (2026-08-13, review redesign issue #8) — a one-tap prefill, moved in
   *  here from the tile header (bucket-tiles redesign) since it's a resolution-affecting shortcut like
   *  everything else in this modal. Still requires pressing Apply — never auto-applied. */
  rememberedSuggestion?: { categoryId: string; categoryName: string };
  /** For the Lent/Borrowed panel's autocomplete (2026-08-14, redesign §9.6, Issue #8) — omit (or pass
   *  empty) to hide suggestions; the free-text field itself still works either way, same as
   *  `BulkCategorizeModal`'s own IOU panel. */
  iouPersons?: Person[];
  /** Tag field suggestions (2026-08-20, item 41 real-device testing pass) — "Frequent" (top-5 by
   *  `usageCount`) + live `startsWith` suggestions as the user types, ported from
   *  `BulkHashtagModal.tsx`'s identical pattern. Omit (or pass empty) to render the tag field with no
   *  suggestions at all — it still works as a plain free-text field either way. */
  hashtags?: Hashtag[];
  /** Seed value for the Lent/Borrowed person field (2026-08-14, redesign §9.6/§7's 2026-08-14
   *  clarification) — pre-fills from the per-row counterparty detection when one exists (a
   *  `CounterpartyGroup`'s matched Person name, or its raw low-confidence candidate text), still fully
   *  editable. A row with no detected counterparty (the residual group, or a plain non-split category)
   *  starts blank. */
  initialIouPersonName?: string;
  /** Whether this modal instance should show/require the Lent/Borrowed panel at all (2026-08-14,
   *  redesign §3/§9.6). Defaults to `true` (the Transactions stage's own standing-override usage, the
   *  only caller today — the "Categories" wizard stage this was once also conditional on was removed
   *  2026-08-20, item 41 flow redesign). */
  enforceIouPerson?: boolean;
  /** Applies to the WHOLE tile (every one of its rows) — used whenever `isPartialSelection` is false.
   *  `iouPersonName` is set only when the applied category is `IOU_MANDATORY_CATEGORY_IDS`-gated. */
  onApplyFull: (suggestion: CategoryAction, tag: string, iouPersonName?: string) => void;
  /** Applies to just the checked subset via a row-level override — `suggestion.kind` is always
   *  'existing' here (the only kind a row-level override supports); the caller is trusted to route this
   *  to `moveRowsToCategory`/`tagRows` rather than the group-level `onUpdateCategory`. */
  onApplyPartial: (categoryId: string, categoryName: string, tag: string, iouPersonName?: string) => void;
  /** "Looks good, use this" (2026-08-13, bucket-tiles redesign, decision #5) — acknowledges the tile's
   *  CURRENT 'create' suggestion as-is, without changing it. Only ever rendered for a whole-tile
   *  selection whose suggestion is already 'create' and not yet decided. */
  onAcknowledge: () => void;
  /** Creates a real `ExpenseCategory` immediately (2026-08-20, item 41 flow redesign) — backs the
   *  "Create" kind's real `CategoryEditorModal` below (replacing the old bespoke inline Group+Name
   *  fields). See `useImport.ts`'s `createCategory` doc comment. */
  onCreateCategory: (cat: ExpenseCategory) => Promise<void>;
  onClose: () => void;
}

/**
 * New modal (2026-08-13, bucket-tiles redesign) that now owns ALL of a `CategoryTile`'s resolution
 * surface — the kind picker, the tag field, and the create/transfer conditional fields that used to sit
 * always-visible in the tile's own header. Mirrors `BulkCategorizeModal.tsx`'s chrome (`Modal`/`Banner`/
 * footer button convention) but built around Expense Import's 4-way `CategoryAction` kind set (existing/
 * create/transfer/skip) instead of Bank Import's existing-or-transfer toggle. See
 * `docs/mockups/proposals/expense-import-bucket-tiles-v1.html` §3 for the visual spec this ports.
 */
export function ImportCategorizeModal({
  sourceName,
  suggestion,
  decided,
  totalCount,
  checkedCount,
  isPartialSelection,
  initialTag,
  categories,
  transferAccountOptions,
  txnCountByCategory,
  pickerType,
  rememberedSuggestion,
  iouPersons = [],
  hashtags = [],
  initialIouPersonName = '',
  enforceIouPerson = true,
  onApplyFull,
  onApplyPartial,
  onAcknowledge,
  onCreateCategory,
  onClose
}: ImportCategorizeModalProps) {
  const theme = useThemeColors();
  const [localSuggestion, setLocalSuggestion] = useState<CategoryAction>(suggestion);
  const [tag, setTag] = useState(initialTag);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  // Real category-creation flow (2026-08-20, item 41 flow redesign) — replaces the old bespoke inline
  // Group+Name fields with the real `CategoryEditorModal` (name/icon-grid/color-swatches/group). Opens
  // whenever the user ACTIVELY taps the "Create" `KindTile` (see `handleKindChange` below); if the
  // tile's own suggestion was ALREADY 'create' when this modal first opened (an unconfirmed smart
  // guess, never actively picked this session), a quiet summary row shows instead with its own "Edit ›"
  // link into this same editor — never force-opened on top of the modal the instant it renders.
  const [showCategoryEditor, setShowCategoryEditor] = useState(false);
  const [touched, setTouched] = useState(false);
  const [showIouPanel, setShowIouPanel] = useState(false);
  const [iouPersonName, setIouPersonName] = useState(initialIouPersonName);

  // Group options for the real category editor (2026-08-20) — mirrors `CategoryPickerModal.tsx`'s own
  // `groupOptions` memo: fixed intent groups first, then user-created parent categories, both filtered
  // to this modal's `pickerType`. Computed locally (rather than threaded down as a prop, the way the now-
  // removed bespoke inline Group field used to be) since only `CategoryEditorModal.GroupOption`'s fuller
  // shape (with `isParent`) is needed, and only here.
  const parentCategoryMap = useMemo(() => buildParentCategoryMap(categories), [categories]);
  const editorGroupOptions = useMemo<GroupOption[]>(() => {
    const opts: GroupOption[] = [];
    for (const [key, meta] of Object.entries(INTENT_GROUP_META)) {
      const isIncome = key === 'income';
      if (pickerType === 'income' ? !isIncome : isIncome || key === 'transfers') continue;
      opts.push({ value: key, label: meta.label, isParent: false });
    }
    for (const parent of parentCategoryMap.values()) {
      const applies =
        pickerType === 'income'
          ? parent.applicableTo === 'income'
          : !parent.applicableTo || parent.applicableTo === 'expense';
      if (applies) opts.push({ value: parent.id, label: parent.name, isParent: true });
    }
    return opts;
  }, [parentCategoryMap, pickerType]);

  // Tag field suggestions (2026-08-20, item 41) — same "Frequent"/live-suggestion pattern as
  // `BulkHashtagModal.tsx`. Normalized only for MATCHING purposes here, same as that component's own
  // `normalizedAdd` — the actual `tag` state stays exactly what the user typed until the real write path
  // (`importPipeline.ts`) normalizes it at commit time, same as every other entry point into this field.
  const normalizedTag = tag.replace(/^#/, '').trim().toLowerCase();
  const frequentTags = useMemo(() => [...hashtags].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5), [hashtags]);
  const tagSuggestions = useMemo(
    () =>
      normalizedTag.length > 0
        ? hashtags.filter((h) => h.name.startsWith(normalizedTag) && h.name !== normalizedTag).slice(0, 5)
        : [],
    [hashtags, normalizedTag]
  );

  const transferOptions = transferCategoryOptions().map((c) => ({ value: c.id, label: c.name }));
  const suggestedTransfer = localSuggestion.kind !== 'transfer' && isLikelyTransfer(sourceName);
  const selectedCat =
    localSuggestion.kind === 'existing' ? categories.find((c) => c.id === localSuggestion.categoryId) : undefined;

  // Lending / Borrowed Money / Collected Money / Return Borrowed (2026-08-14, ported from
  // `BulkCategorizeModal.tsx`'s identical rule) — makes the person mandatory and auto-opens (and locks
  // open) the Lent/Borrowed panel rather than leaving it a manual toggle someone might never open before
  // an otherwise-silent Apply-button failure. Only ever true for `kind === 'existing'` — a transfer/
  // create/skip resolution never maps to one of these four real category ids.
  const iouMandatory =
    enforceIouPerson &&
    localSuggestion.kind === 'existing' &&
    IOU_MANDATORY_CATEGORY_IDS.has(localSuggestion.categoryId);
  const iouApplicable =
    localSuggestion.kind === 'existing' && IOU_MANDATORY_CATEGORY_IDS.has(localSuggestion.categoryId);
  const iouPanelOpen = showIouPanel || iouMandatory;
  // Expense group → they owe you (lent); income group → you owe them (borrowed) — same convention as
  // `ExpenseForm`/`BulkCategorizeModal`. Also the icon-row accent color.
  const iouKind: 'lent' | 'borrowed' = pickerType === 'income' ? 'borrowed' : 'lent';
  const iouAccent = pickerType === 'income' ? theme.success : theme.danger;
  const iouMatches =
    iouPersonName.trim().length > 0
      ? (() => {
          const q = iouPersonName.trim().toLowerCase();
          return iouPersons
            .filter((p) => !p.isArchived && p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q)
            .slice(0, 6);
        })()
      : [];

  function handleKindChange(kind: CategoryAction['kind']) {
    if (isPartialSelection && kind !== 'existing') return;
    if (kind === 'existing') {
      setShowCategoryPicker(true);
      return;
    }
    if (kind === 'transfer') {
      const first = transferOptions[0];
      const existingToAccountId = localSuggestion.kind === 'transfer' ? localSuggestion.toAccountId : '';
      setLocalSuggestion({
        kind: 'transfer',
        categoryId: first?.value ?? 'cat-tr-other',
        categoryName: first?.label ?? 'Other Transfer',
        toAccountId: existingToAccountId
      });
    } else if (kind === 'create') {
      const suggestedIntentGroup =
        localSuggestion.kind === 'create' ? localSuggestion.suggestedIntentGroup : suggestIntentGroup(sourceName);
      setLocalSuggestion({ kind: 'create', suggestedName: sourceName, suggestedIntentGroup });
      // Active choice (2026-08-20, item 41 flow redesign) — opens the real editor right away; if the
      // user cancels without saving, the tile is left in the quiet-summary 'create' state below, still
      // applicable as-is (unedited) via the modal's own Apply button.
      setShowCategoryEditor(true);
    } else {
      setLocalSuggestion({ kind: 'skip' });
    }
  }

  const canApply =
    (localSuggestion.kind === 'existing'
      ? localSuggestion.categoryId.length > 0
      : isPartialSelection
        ? false // only 'existing' is reachable for a partial selection — see handleKindChange's guard
        : localSuggestion.kind === 'create'
          ? localSuggestion.suggestedName.trim().length > 0
          : localSuggestion.kind === 'transfer'
            ? localSuggestion.toAccountId.length > 0
            : true) && // 'skip' has no further requirement
    (!iouMandatory || iouPersonName.trim().length > 0);

  function handleApply() {
    setTouched(true);
    if (!canApply) return;
    const iou = iouMandatory ? iouPersonName.trim() : undefined;
    if (isPartialSelection) {
      if (localSuggestion.kind === 'existing')
        onApplyPartial(localSuggestion.categoryId, localSuggestion.categoryName, tag, iou);
      return;
    }
    onApplyFull(localSuggestion, tag, iou);
  }

  const showAcknowledgeShortcut = !isPartialSelection && !decided && suggestion.kind === 'create';
  const footerLabel =
    localSuggestion.kind === 'skip'
      ? `Skip ${checkedCount} transaction${checkedCount === 1 ? '' : 's'}`
      : `Apply to ${checkedCount} transaction${checkedCount === 1 ? '' : 's'}`;

  return (
    <>
      <Modal
        onClose={onClose}
        title={`Categorize · "${sourceName}"`}
        scrollable
        footer={
          <Button variant="primary" fullWidth disabled={!canApply} onPress={handleApply}>
            {footerLabel}
          </Button>
        }
      >
        <Text className="text-xs text-tertiary -mt-1">
          {checkedCount} of {totalCount} selected
        </Text>

        <Banner variant="info">
          Applies to the {checkedCount} checked transaction{checkedCount === 1 ? '' : 's'} — its own date, amount &
          account are untouched.
        </Banner>

        {isPartialSelection && (
          <Text className="text-[10.5px] text-tertiary">
            Only &quot;Map to existing category&quot; can apply to part of a tile — creating, transferring, or skipping
            are decisions for the whole group.
          </Text>
        )}

        {/* "Looks good, use this" (decision #5) — deliberately a quiet, link-style shortcut, not a second
         *  filled button competing with the modal's primary Apply action below. */}
        {showAcknowledgeShortcut && suggestion.kind === 'create' && (
          <View
            className="flex-row items-center gap-2 rounded-xl border border-dashed px-3 py-2"
            style={{ borderColor: theme.border, backgroundColor: theme.surfaceTertiary }}
          >
            <Icon name="ti-sparkles" size={14} color={theme.textSecondary} />
            <Text className="flex-1 text-[11px] text-secondary">
              Suggested: create &quot;{suggestion.suggestedName}&quot; (new ·{' '}
              {intentGroupLabel(suggestion.suggestedIntentGroup)})
            </Text>
            <Pressable onPress={onAcknowledge} hitSlop={6}>
              <Text className="text-xs font-bold" style={{ color: theme.primary }}>
                Use this ›
              </Text>
            </Pressable>
          </View>
        )}

        {!isPartialSelection &&
          rememberedSuggestion &&
          !(localSuggestion.kind === 'existing' && localSuggestion.categoryId === rememberedSuggestion.categoryId) && (
            <Pressable
              onPress={() =>
                setLocalSuggestion({
                  kind: 'existing',
                  categoryId: rememberedSuggestion.categoryId,
                  categoryName: rememberedSuggestion.categoryName
                })
              }
              className="flex-row items-center self-start gap-1 rounded-full px-2.5 py-1"
              style={{ backgroundColor: theme.surfaceSecondary }}
            >
              <Icon name="ti-sparkles" size={11} color={theme.primary} />
              <Text className="text-[9.5px] font-bold" style={{ color: theme.primary }}>
                Remembered — {rememberedSuggestion.categoryName}
              </Text>
            </Pressable>
          )}

        <Text className="text-xs font-medium text-secondary">How should these be recorded?</Text>
        <View className="gap-2">
          <View className="flex-row gap-2">
            <KindTile
              kind="existing"
              selected={localSuggestion.kind === 'existing'}
              disabled={false}
              suggested={false}
              onPress={() => handleKindChange('existing')}
            />
            <KindTile
              kind="create"
              selected={localSuggestion.kind === 'create'}
              disabled={isPartialSelection}
              suggested={false}
              onPress={() => handleKindChange('create')}
            />
          </View>
          <View className="flex-row gap-2">
            <KindTile
              kind="transfer"
              selected={localSuggestion.kind === 'transfer'}
              disabled={isPartialSelection}
              suggested={suggestedTransfer}
              onPress={() => handleKindChange('transfer')}
            />
            <KindTile
              kind="skip"
              selected={localSuggestion.kind === 'skip'}
              disabled={isPartialSelection}
              suggested={false}
              onPress={() => handleKindChange('skip')}
            />
          </View>
        </View>

        {localSuggestion.kind === 'existing' && (
          <Pressable
            onPress={() => setShowCategoryPicker(true)}
            className="flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5"
            style={{
              borderColor: selectedCat ? selectedCat.color : theme.border,
              borderStyle: selectedCat ? 'solid' : 'dashed'
            }}
          >
            <View
              className="w-7 h-7 rounded-lg items-center justify-center"
              style={{ backgroundColor: selectedCat ? tint(selectedCat.color, 15) : theme.surfaceTertiary }}
            >
              <Icon
                name={selectedCat ? selectedCat.icon : 'ti-layout-grid-add'}
                size={15}
                color={selectedCat ? selectedCat.color : theme.textTertiary}
              />
            </View>
            <Text
              className="text-sm font-medium flex-1"
              numberOfLines={1}
              style={{ color: selectedCat ? theme.textPrimary : theme.textTertiary }}
            >
              {selectedCat?.name ?? 'Choose a category…'}
            </Text>
            <Icon name="ti-chevron-right" size={14} color={theme.textTertiary} />
          </Pressable>
        )}

        {/* Lent/Borrowed lock-open panel (2026-08-14, redesign §9.6, Issue #8) — ported from
         *  `BulkCategorizeModal.tsx`'s identical pattern. Only ever relevant for `kind === 'existing'`,
         *  AND only when `enforceIouPerson` (true by default). */}
        {enforceIouPerson && iouApplicable && (
          <View className="flex-row justify-center pt-1">
            <ExtraCircle
              icon="ti-users"
              label={iouKind === 'lent' ? 'Lent' : 'Borrowed'}
              active={iouPanelOpen || iouPersonName.trim().length > 0}
              disabled={iouMandatory}
              accent={iouAccent}
              onPress={() => setShowIouPanel((v) => !v)}
            />
          </View>
        )}

        {enforceIouPerson && iouApplicable && iouPanelOpen && (
          <View
            className="rounded-xl border p-3 gap-2"
            style={{
              borderColor: touched && iouMandatory && !iouPersonName.trim() ? theme.danger : theme.border,
              backgroundColor: theme.surfaceTertiary
            }}
          >
            <TextInput
              placeholder="Person's name"
              value={iouPersonName}
              onChange={setIouPersonName}
              error={
                touched && iouMandatory && !iouPersonName.trim()
                  ? 'Enter who this is with — required for this category'
                  : undefined
              }
            />
            {!(touched && iouMandatory && !iouPersonName.trim()) && (
              <Text className="text-xs text-tertiary">
                {iouKind === 'lent'
                  ? `Adds a they-owe-you entry to this person's ledger for each of the ${checkedCount} transaction${checkedCount === 1 ? '' : 's'}.`
                  : `Adds a you-owe-them entry to this person's ledger for each of the ${checkedCount} transaction${checkedCount === 1 ? '' : 's'}.`}
              </Text>
            )}
            {iouMatches.length > 0 && (
              <View className="flex-row flex-wrap gap-1">
                {iouMatches.map((p) => (
                  <Button key={p.id} variant="secondary" size="sm" onPress={() => setIouPersonName(p.name)}>
                    {p.name}
                  </Button>
                ))}
              </View>
            )}
          </View>
        )}

        {localSuggestion.kind === 'transfer' && (
          <View className="gap-1.5">
            <View className="flex-row gap-2">
              <View className="flex-1">
                <BorderLabelField label="Transfer category">
                  <SelectInput
                    value={localSuggestion.categoryId}
                    onChange={(v) => {
                      const c = transferOptions.find((x) => x.value === v);
                      setLocalSuggestion({
                        kind: 'transfer',
                        categoryId: v,
                        categoryName: c?.label ?? v,
                        toAccountId: localSuggestion.kind === 'transfer' ? localSuggestion.toAccountId : ''
                      });
                    }}
                    options={transferOptions}
                  />
                </BorderLabelField>
              </View>
              <View className="flex-1">
                <BorderLabelField label="Transfer to account">
                  <SelectInput
                    value={localSuggestion.toAccountId}
                    onChange={(v) =>
                      setLocalSuggestion({
                        kind: 'transfer',
                        categoryId: (localSuggestion as { categoryId: string }).categoryId,
                        categoryName: (localSuggestion as { categoryName: string }).categoryName,
                        toAccountId: v
                      })
                    }
                    options={transferAccountOptions.map((a) => ({ value: a.id, label: a.name }))}
                    placeholder="Choose…"
                  />
                </BorderLabelField>
              </View>
            </View>
            {transferAccountOptions.length === 0 && (
              <Text className="text-[10px] text-tertiary">
                No other accounts yet — add one from Accounts, then come back to pick a destination.
              </Text>
            )}
          </View>
        )}

        {/* "Create" — real `CategoryEditorModal` now backs this (2026-08-20, item 41 flow redesign),
         *  replacing the old bespoke inline Group+Name fields. This quiet summary row is the PASSIVE
         *  state — the tile's own auto-suggested create guess, not yet actively edited this session — with
         *  its own "Edit ›" link into the same editor `handleKindChange` already opens on an active tap.
         *  Applying directly from here (no edit) still works exactly as before: `canApply`/`handleApply`
         *  below are unchanged for this kind, so `useImport.ts`'s existing deferred-at-commit creation
         *  (default gray/tag icon) is the fallback for anyone who never bothers customizing. */}
        {localSuggestion.kind === 'create' && (
          <View
            className="flex-row items-center gap-2 rounded-xl border px-3 py-2.5"
            style={{ borderColor: theme.border, backgroundColor: theme.surfaceTertiary }}
          >
            <View
              className="w-7 h-7 rounded-lg items-center justify-center"
              style={{ backgroundColor: tint(theme.primary, 15) }}
            >
              <Icon name="ti-square-plus" size={14} color={theme.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-primary" numberOfLines={1}>
                New category: {localSuggestion.suggestedName}
              </Text>
              <Text className="text-[10px] text-tertiary">
                {intentGroupLabel(localSuggestion.suggestedIntentGroup)}
              </Text>
            </View>
            <Pressable onPress={() => setShowCategoryEditor(true)} hitSlop={6}>
              <Text className="text-xs font-bold" style={{ color: theme.primary }}>
                Edit ›
              </Text>
            </Pressable>
          </View>
        )}

        {localSuggestion.kind === 'skip' && (
          <View
            className="rounded-xl border px-3 py-2.5 flex-row gap-2"
            style={{ borderColor: theme.border, backgroundColor: theme.surfaceTertiary }}
          >
            <Icon name="ti-info-circle" size={14} color={theme.textSecondary} />
            <Text className="flex-1 text-xs text-secondary">
              These {checkedCount} transaction{checkedCount === 1 ? '' : 's'} will be excluded from this import entirely
              — nothing is created or written for them.
            </Text>
          </View>
        )}

        {/* Tag field (relocated here from the tile header, bucket-tiles redesign) — visible but disabled
         *  for 'skip' (decision #1): tagging a transaction that won't import has no effect this session,
         *  but hiding the field entirely would look like a layout glitch when switching kinds. */}
        <View className="gap-1">
          <Text className="text-xs font-medium text-secondary">Tag (optional)</Text>
          <TextInput
            placeholder={isPartialSelection ? `Tag ${checkedCount} selected` : 'Tag all transactions'}
            value={tag}
            onChange={setTag}
            disabled={localSuggestion.kind === 'skip'}
          />
          {frequentTags.length > 0 && (
            <View>
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mb-1">Frequent</Text>
              <View className="flex-row flex-wrap gap-1">
                {frequentTags.map((h) => (
                  <Button key={h.id} variant="secondary" size="sm" onPress={() => setTag(h.name)}>
                    #{h.name}
                  </Button>
                ))}
              </View>
            </View>
          )}
          {tagSuggestions.length > 0 && (
            <View className="flex-row flex-wrap gap-1">
              {tagSuggestions.map((s) => (
                <Button key={s.id} variant="secondary" size="sm" onPress={() => setTag(s.name)}>
                  #{s.name}
                </Button>
              ))}
            </View>
          )}
        </View>
      </Modal>

      {showCategoryPicker && (
        <CategoryPickerModal
          type={pickerType}
          categories={categories}
          txnCountByCategory={txnCountByCategory}
          selectedId={localSuggestion.kind === 'existing' ? localSuggestion.categoryId : ''}
          onSelect={(id) => {
            const c = categories.find((x) => x.id === id);
            setLocalSuggestion({ kind: 'existing', categoryId: id, categoryName: c?.name ?? id });
            setShowCategoryPicker(false);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
      )}

      {/* Real category editor (2026-08-20, item 41 flow redesign) — replaces the old bespoke inline
       *  Group+Name "Create" fields. Always create mode (`editing` omitted) — this modal never edits an
       *  existing category, only creates a brand-new one. `moveTargets`/`onMove`/`onDelete` are
       *  unreachable in create mode (`txnCount={0}` and no `editing` hide both the move and delete UI —
       *  see `CategoryEditorModal.tsx`'s own `canDelete`/move-section conditions), so plain no-op stubs
       *  are safe here rather than threading real implementations neither of these two props could ever
       *  invoke. */}
      {showCategoryEditor && (
        <CategoryEditorModal
          type={pickerType}
          groupOptions={editorGroupOptions}
          moveTargets={[]}
          txnCount={0}
          onSave={async (cat) => {
            await onCreateCategory(cat);
            setLocalSuggestion({ kind: 'existing', categoryId: cat.id, categoryName: cat.name });
          }}
          onMove={async () => {}}
          onDelete={async () => {}}
          onClose={() => setShowCategoryEditor(false)}
        />
      )}
    </>
  );
}
