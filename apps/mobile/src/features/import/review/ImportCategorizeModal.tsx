import { useState, type ReactNode } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal, Button, Banner, SelectInput, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, ExpenseCategory } from '@/core/db/types';
import {
  isLikelyTransfer,
  intentGroupLabel,
  suggestIntentGroup,
  transferCategoryOptions,
  type CategoryAction
} from '@/core/import/importCategoryResolution';
import { CategoryPickerModal } from '~/features/expenses/categories/CategoryPickerModal';

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
  groupOptions: { value: string; label: string }[];
  pickerType: 'expense' | 'income';
  /** "Remembered — {categoryName}" (2026-08-13, review redesign issue #8) — a one-tap prefill, moved in
   *  here from the tile header (bucket-tiles redesign) since it's a resolution-affecting shortcut like
   *  everything else in this modal. Still requires pressing Apply — never auto-applied. */
  rememberedSuggestion?: { categoryId: string; categoryName: string };
  /** Applies to the WHOLE tile (every one of its rows) — used whenever `isPartialSelection` is false. */
  onApplyFull: (suggestion: CategoryAction, tag: string) => void;
  /** Applies to just the checked subset via a row-level override — `suggestion.kind` is always
   *  'existing' here (the only kind a row-level override supports); the caller is trusted to route this
   *  to `moveRowsToCategory`/`tagRows` rather than the group-level `onUpdateCategory`. */
  onApplyPartial: (categoryId: string, categoryName: string, tag: string) => void;
  /** "Looks good, use this" (2026-08-13, bucket-tiles redesign, decision #5) — acknowledges the tile's
   *  CURRENT 'create' suggestion as-is, without changing it. Only ever rendered for a whole-tile
   *  selection whose suggestion is already 'create' and not yet decided. */
  onAcknowledge: () => void;
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
  groupOptions,
  pickerType,
  rememberedSuggestion,
  onApplyFull,
  onApplyPartial,
  onAcknowledge,
  onClose
}: ImportCategorizeModalProps) {
  const theme = useThemeColors();
  const [localSuggestion, setLocalSuggestion] = useState<CategoryAction>(suggestion);
  const [tag, setTag] = useState(initialTag);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const transferOptions = transferCategoryOptions().map((c) => ({ value: c.id, label: c.name }));
  const suggestedTransfer = localSuggestion.kind !== 'transfer' && isLikelyTransfer(sourceName);
  const selectedCat =
    localSuggestion.kind === 'existing' ? categories.find((c) => c.id === localSuggestion.categoryId) : undefined;

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
    } else {
      setLocalSuggestion({ kind: 'skip' });
    }
  }

  const canApply =
    localSuggestion.kind === 'existing'
      ? localSuggestion.categoryId.length > 0
      : isPartialSelection
        ? false // only 'existing' is reachable for a partial selection — see handleKindChange's guard
        : localSuggestion.kind === 'create'
          ? localSuggestion.suggestedName.trim().length > 0
          : localSuggestion.kind === 'transfer'
            ? localSuggestion.toAccountId.length > 0
            : true; // 'skip' has no further requirement

  function handleApply() {
    if (!canApply) return;
    if (isPartialSelection) {
      if (localSuggestion.kind === 'existing')
        onApplyPartial(localSuggestion.categoryId, localSuggestion.categoryName, tag);
      return;
    }
    onApplyFull(localSuggestion, tag);
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

        {localSuggestion.kind === 'create' && (
          <View className="flex-row gap-2">
            <View style={{ flex: 2 }}>
              <BorderLabelField label="Group">
                <SelectInput
                  value={localSuggestion.suggestedIntentGroup}
                  onChange={(v) =>
                    setLocalSuggestion({
                      kind: 'create',
                      suggestedName: (localSuggestion as { suggestedName: string }).suggestedName,
                      suggestedIntentGroup: v
                    })
                  }
                  options={groupOptions}
                />
              </BorderLabelField>
            </View>
            <View style={{ flex: 3 }}>
              <BorderLabelField label="New category name">
                <TextInput
                  value={localSuggestion.suggestedName}
                  onChange={(v) =>
                    setLocalSuggestion({
                      kind: 'create',
                      suggestedName: v,
                      suggestedIntentGroup: (localSuggestion as { suggestedIntentGroup: string }).suggestedIntentGroup
                    })
                  }
                />
              </BorderLabelField>
            </View>
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
    </>
  );
}
