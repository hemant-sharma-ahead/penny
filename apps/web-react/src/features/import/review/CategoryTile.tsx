import { useState, type ReactNode } from 'react';
import { SelectInput, TextInput } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { STATUS, tint } from '@/lib/statusColors';
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
import { CategoryPickerModal } from '@/features/expenses/categories/CategoryPickerModal';

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Wraps a bare (unlabeled) input/select with a small label notched into its top border — keeps the
 *  label always visible (unlike a placeholder, which disappears once a value is set) without the extra
 *  vertical space a full label-above-field layout costs. */
function BorderLabelField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative pt-[7px]">
      <span className="absolute -top-0.5 left-2.5 px-1 text-[9px] font-semibold text-tertiary bg-surface rounded z-10">
        {label}
      </span>
      {children}
    </div>
  );
}

interface CategoryTileProps {
  resolution: CategoryResolution;
  decided: boolean;
  /** Drives the tile's background tint so status is scannable at a glance, matching the
   *  ready/attention/duplicate vocabulary used everywhere else on this screen — 'attention' whenever
   *  undecided (regardless of row status), else 'duplicate' only when EVERY row under this category is
   *  already a duplicate, else 'ready'. */
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

/** One tile per distinct source category. Everything needed to resolve it (kind picker, target
 *  category + edit icon, new-category/transfer inputs, tag box) lives in the always-visible header —
 *  expanding (chevron) only reveals the individual transactions, never controls. Undecided tiles get a
 *  warning border and sort first (see PreviewSection.tsx). See
 *  docs/mockups/proposals/import-wizard-redesign-v4.html for the originally-approved structure this has
 *  since been refined from, per direct user feedback on the built screen. */
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
      // manually changed it); otherwise compute a fresh smart suggestion from the source name. This was
      // a real bug: it used to hardcode 'other' on every click, stomping a correct suggestion like
      // 'financial' for "Investment" the moment this was selected.
      const suggestedIntentGroup =
        suggestion.kind === 'create' ? suggestion.suggestedIntentGroup : suggestIntentGroup(sourceName);
      onUpdate({ kind: 'create', suggestedName: sourceName, suggestedIntentGroup });
    } else {
      onUpdate({ kind: 'skip' });
    }
  }

  const targetLabel =
    suggestion.kind === 'existing' ? (
      suggestion.categoryName
    ) : suggestion.kind === 'transfer' ? (
      <span style={{ color: 'var(--color-info)' }}>Transfer</span>
    ) : suggestion.kind === 'create' ? (
      <>
        {suggestion.suggestedName}{' '}
        <span className="text-tertiary font-normal">(new · {intentGroupLabel(suggestion.suggestedIntentGroup)})</span>
      </>
    ) : (
      <span className="text-tertiary">Skip</span>
    );

  const statusColor =
    status === 'attention' ? STATUS.warning : status === 'duplicate' ? STATUS.neutral : STATUS.success;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: tint(statusColor, status === 'ready' ? 10 : 20),
        border: `1.5px solid ${statusColor}`
      }}
    >
      <div className="p-3 flex flex-col gap-2">
        {/* Row 1 — source → target, edit icon (existing only), count, expand-transactions toggle */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 text-xs font-semibold">
            <span className="text-primary truncate">&quot;{sourceName}&quot;</span>
            <i className="ti ti-arrow-right text-tertiary flex-shrink-0" style={{ fontSize: 12 }} aria-hidden="true" />
            <span
              className={`truncate ${decided ? 'text-primary' : 'italic text-tertiary border border-dashed border-theme rounded-full px-2 py-0.5 text-[10.5px] font-medium'}`}
            >
              {decided ? targetLabel : 'Choose…'}
            </span>
            {suggestion.kind === 'existing' && (
              <button
                type="button"
                onClick={() => setShowCategoryPicker(true)}
                aria-label="Change category"
                className="flex-shrink-0 text-tertiary"
              >
                <i className="ti ti-pencil" style={{ fontSize: 12 }} aria-hidden="true" />
              </button>
            )}
          </div>
          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-surface-3 text-secondary flex-shrink-0">
            {count} txn{count !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Hide transactions' : 'Show transactions'}
            className="flex-shrink-0 text-tertiary"
          >
            <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} aria-hidden="true" />
          </button>
        </div>

        {suggestedTransfer && (
          <p className="text-[9.5px] flex items-center gap-1 -mt-1" style={{ color: 'var(--color-info)' }}>
            <i className="ti ti-sparkles" aria-hidden="true" /> Suggested — looks like transfers, not spending
          </p>
        )}

        {/* Row 2 — kind dropdown + tag box, pill-styled (same behavior, chip-like look) */}
        <div className="grid grid-cols-2 gap-2">
          <SelectInput
            value={suggestion.kind}
            onChange={handleKindChange}
            options={kindOptions}
            triggerClassName="!rounded-full !py-1.5 !text-xs !font-semibold text-center"
          />
          <TextInput
            placeholder="Tag all transactions"
            value={tag}
            onChange={onTagChange}
            inputClassName="!rounded-full !py-1.5 !text-xs text-center"
          />
        </div>

        {/* Row 3 — conditional on the selected kind. Labels sit notched into the field's top border
         *  (BorderLabelField) instead of a separate label row — stays visible even once a value is set,
         *  unlike a placeholder, while still costing less height than a full label-above layout.
         *  Deliberately kept as normal fields, not pills — that treatment is reserved for the kind
         *  dropdown + tag box above. */}
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
          <div className="grid grid-cols-[2fr_3fr] gap-2">
            <BorderLabelField label="Group">
              <SelectInput
                value={suggestion.suggestedIntentGroup}
                onChange={(v) =>
                  onUpdate({ kind: 'create', suggestedName: suggestion.suggestedName, suggestedIntentGroup: v })
                }
                options={groupOptions}
              />
            </BorderLabelField>
            <BorderLabelField label="New category name">
              <TextInput
                value={suggestion.suggestedName}
                onChange={(v) =>
                  onUpdate({ kind: 'create', suggestedName: v, suggestedIntentGroup: suggestion.suggestedIntentGroup })
                }
              />
            </BorderLabelField>
          </div>
        )}
      </div>

      {/* Body — transactions only */}
      {expanded && (
        <div className="border-t border-theme px-3 py-2.5 flex flex-col divide-y divide-[var(--color-border)]">
          {rows.slice(0, 8).map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-primary truncate">{row.description}</p>
                <p className="text-[9.5px] text-tertiary">
                  {fmtShortDate(row.date)}
                  {row.account ? ` · ${row.account}` : ''}
                </p>
              </div>
              <span
                className="text-[11px] font-semibold flex-shrink-0"
                style={{ color: row.type === 'income' ? 'var(--color-success)' : 'var(--color-text-primary)' }}
              >
                {row.type === 'income' ? '+' : ''}
                {formatCurrency(row.amount)}
              </span>
            </div>
          ))}
          {rows.length > 8 && <p className="text-center text-[9.5px] text-tertiary pt-1.5">+ {rows.length - 8} more</p>}
        </div>
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
    </div>
  );
}
