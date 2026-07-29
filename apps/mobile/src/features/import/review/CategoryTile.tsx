import { useState, type ReactNode } from 'react';
import { View, Pressable, Text } from 'react-native';
import { SelectInput, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import type { ExpenseCategory } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
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
  rows: ParsedRow[];
  categories: ExpenseCategory[];
  groupOptions: { value: string; label: string }[];
  /** The custom tag (if any) the user has set for every transaction under this source category —
   *  independent of which category it resolves to (existing/create/transfer/skip). */
  tag: string;
  onTagChange: (tag: string) => void;
  onUpdate: (suggestion: CategoryAction) => void;
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
  groupOptions,
  tag,
  onTagChange,
  onUpdate
}: CategoryTileProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const { suggestion, sourceName, count } = resolution;
  const transferOptions = transferCategoryOptions().map((c) => ({ value: c.id, label: c.name }));
  const suggestedTransfer = suggestion.kind !== 'transfer' && isLikelyTransfer(sourceName);
  /** A source category's rows are overwhelmingly one direction in practice (e.g. "Salary" is always
   *  income) — pick whichever the majority of this category's rows actually are, so "Map Existing"
   *  opens the picker filtered to the right applicableTo (income vs expense) categories. */
  const pickerType: 'expense' | 'income' =
    rows.filter((r) => r.type === 'income').length > rows.length / 2 ? 'income' : 'expense';

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
            <Text className="text-xs font-semibold text-primary" numberOfLines={1}>
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

        {/* Row 2 — kind dropdown + tag box, pill-styled (same behavior, chip-like look) */}
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
              placeholder="Tag all transactions"
              value={tag}
              onChange={onTagChange}
              inputClassName="!rounded-full !py-1.5 !text-xs text-center"
            />
          </View>
        </View>

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

      {/* Body — transactions only */}
      {expanded && (
        <View className="border-t border-theme px-3 py-2.5">
          {rows.slice(0, 8).map((row, i) => (
            <View
              key={i}
              className={`flex-row items-center justify-between gap-2 py-1.5 ${i > 0 ? 'border-t border-theme' : ''}`}
            >
              <View className="flex-1 min-w-0">
                <Text className="text-[11px] font-medium text-primary" numberOfLines={1}>
                  {row.description}
                </Text>
                <Text className="text-[9.5px] text-tertiary">
                  {fmtShortDate(row.date)}
                  {row.account ? ` · ${row.account}` : ''}
                </Text>
              </View>
              <Text
                className="text-[11px] font-semibold flex-shrink-0"
                style={{ color: row.type === 'income' ? theme.success : theme.textPrimary }}
              >
                {row.type === 'income' ? '+' : ''}
                {formatCurrency(row.amount)}
              </Text>
            </View>
          ))}
          {rows.length > 8 && (
            <Text className="text-center text-[9.5px] text-tertiary pt-1.5">+ {rows.length - 8} more</Text>
          )}
        </View>
      )}

      {showCategoryPicker && (
        <CategoryPickerModal
          type={pickerType}
          categories={categories}
          selectedId={suggestion.kind === 'existing' ? suggestion.categoryId : ''}
          onSelect={(id) => {
            const c = categories.find((x) => x.id === id);
            onUpdate({ kind: 'existing', categoryId: id, categoryName: c?.name ?? id });
            setShowCategoryPicker(false);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
      )}
    </View>
  );
}
