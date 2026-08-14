import type { Account, ExpenseCategory } from '@/core/db/types';
import type { CategoryAction } from '@/core/import/importCategoryResolution';
import type { TransactionsRowGroup } from '../useImport';
import { CategoryTile } from './CategoryTile';

interface CategoryResolutionRowProps {
  group: TransactionsRowGroup;
  categories: ExpenseCategory[];
  transferAccountOptions: Account[];
  txnCountByCategory: Map<string, number>;
  groupOptions: { value: string; label: string }[];
  tag: string;
  rememberedSuggestion?: { categoryId: string; categoryName: string };
  onUpdate: (suggestion: CategoryAction) => void;
  onTagChange: (tag: string) => void;
  onAcknowledge: () => void;
  /** "Move to residual" (redesign §7's correction mechanism) — only rendered for a low-confidence split
   *  child (never for a residual row itself, and never for a plain non-split category). */
  onMoveToResidual?: () => void;
}

/**
 * Categories wizard stage's own row — a thin wrapper around `CategoryTile.tsx`'s shared shell
 * (2026-08-14, manual-testing refinement: the two used to be separate, visually-drifting components
 * even though they're meant to look and behave identically everywhere this control appears; see
 * `CategoryTile.tsx`'s own doc comment). Passes `expandable={false}` — this stage has no per-row
 * `ParsedRow` data at all (only counts), and nothing to show in an expanded transaction list this early
 * in the wizard — so `CategoryTile` renders header + footer only, always effectively "collapsed", no
 * chevron. "Categorize"/"Skip" in that footer always act on the WHOLE group as a result (there's no
 * per-row selection possible without a body), and the modal always opens with `isPartialSelection={false}`,
 * `enforceIouPerson={false}` (supplying the IOU person is explicitly a Transactions-stage-only concern —
 * see that prop's own doc comment).
 */
export function CategoryResolutionRow({
  group,
  categories,
  transferAccountOptions,
  txnCountByCategory,
  groupOptions,
  tag,
  rememberedSuggestion,
  onUpdate,
  onTagChange,
  onAcknowledge,
  onMoveToResidual
}: CategoryResolutionRowProps) {
  return (
    <CategoryTile
      resolution={{ sourceName: group.label, count: group.count, suggestion: group.effectiveSuggestion }}
      decided={group.decided}
      status={group.decided ? 'ready' : 'attention'}
      rowOverrides={EMPTY_ROW_OVERRIDES}
      categories={categories}
      transferAccountOptions={transferAccountOptions}
      txnCountByCategory={txnCountByCategory}
      groupOptions={groupOptions}
      tag={tag}
      rememberedSuggestion={rememberedSuggestion}
      onUpdate={onUpdate}
      onTagChange={onTagChange}
      onMoveRowsToCategory={NOOP_MOVE_ROWS}
      onTagRows={NOOP_TAG_ROWS}
      onAcknowledge={onAcknowledge}
      expandable={false}
      pickerTypeOverride={group.type === 'income' ? 'income' : 'expense'}
      isSplitChild={group.isSplitChild}
      confidence={group.confidence}
      isInvestmentMovement={group.isInvestmentMovement}
      onMoveToResidual={onMoveToResidual}
    />
  );
}

// Stable no-op/empty references (module scope, not recreated per render) for the props `CategoryTile`
// needs but this stage never actually exercises — `expandable={false}` means the row-list/bulk-select
// body that would call `onMoveRowsToCategory`/`onTagRows`, or read `rowOverrides`, never renders here.
const EMPTY_ROW_OVERRIDES = new Map();
function NOOP_MOVE_ROWS() {}
function NOOP_TAG_ROWS() {}
