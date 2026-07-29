import { useMemo, useState } from 'react';
import { SectionLabel } from '@/components/ui';
import type { ExpenseCategory } from '@/core/db/types';
import type { ParsedRow, RejectedRow } from '@/core/import/importParsers';
import type { ColumnMapping } from '@/core/import/importMatcher';
import type { CategoryResolution, CategoryAction } from '@/core/import/importCategoryResolution';
import { allIntentGroups } from '@/core/import/importCategoryResolution';
import type { DisplayTransferPair, RowTriage } from '../useImport';
import { CategoryTile } from './CategoryTile';
import { TransferPairCard } from './TransferPairCard';
import { UnparsedRows } from './UnparsedRows';
import { CarryForwardExcluded } from './CarryForwardExcluded';

interface PreviewSectionProps {
  rejectedRows: RejectedRow[];
  mapping: ColumnMapping | null;
  onFixRejected: (rowIndex: number, fields: { date: string; amount: string; description: string }) => boolean;
  /** Redundant MoneyView-style carry-forward markers (every occurrence but the earliest per account) —
   *  never written, but shown distinctly so they're never silently dropped. See CarryForwardExcluded. */
  carryForwardExcludedRows: ParsedRow[];
  transferPairs: DisplayTransferPair[];
  categoryResolutions: CategoryResolution[];
  categoriesDecidedCount: number;
  touchedCategorySources: Set<string>;
  parsedRows: ParsedRow[];
  rowTriage: RowTriage[];
  categories: ExpenseCategory[];
  /** Per-source-category custom tag, keyed by source name (see CategoryTile's "Tag all transactions"
   *  field) — orthogonal to which category kind the source resolves to. */
  categoryTags: Map<string, string>;
  onUpdateCategory: (sourceName: string, suggestion: CategoryAction) => void;
  onUpdateCategoryTag: (sourceName: string, tag: string) => void;
}

/** Section 2 of the review screen. Internal order per the approved mockup: unparsed rows → excluded
 *  carry-forward markers → linked transfer pairs → category tiles. The rows-read/ready/attention/
 *  duplicate/actual-transactions summary now lives ONLY in the accordion header above (see
 *  ReviewStep.tsx) — repeating it here was pure duplication once the header already showed it, so the
 *  redundant summary card was removed. */
export function PreviewSection({
  rejectedRows,
  mapping,
  onFixRejected,
  carryForwardExcludedRows,
  transferPairs,
  categoryResolutions,
  categoriesDecidedCount,
  touchedCategorySources,
  parsedRows,
  rowTriage,
  categories,
  categoryTags,
  onUpdateCategory,
  onUpdateCategoryTag
}: PreviewSectionProps) {
  const [transfersExpanded, setTransfersExpanded] = useState(false);
  const groupOptions = useMemo(() => allIntentGroups().map((g) => ({ value: g.key, label: g.label })), []);

  const rowsByCategory = useMemo(() => {
    const map = new Map<string, ParsedRow[]>();
    for (const row of parsedRows) {
      const key = row.categoryName.trim() || 'Other';
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [parsedRows]);

  /** Ready/attention/duplicate counts per source category, from the same per-row `rowTriage` the
   *  Accounts section already uses — drives each tile's background tint so status is scannable at a
   *  glance instead of only readable from text. */
  const statusByCategory = useMemo(() => {
    const map = new Map<string, { ready: number; attention: number; duplicate: number }>();
    parsedRows.forEach((row, i) => {
      const key = row.categoryName.trim() || 'Other';
      const bucket = map.get(key) ?? { ready: 0, attention: 0, duplicate: 0 };
      bucket[rowTriage[i] ?? 'ready']++;
      map.set(key, bucket);
    });
    return map;
  }, [parsedRows, rowTriage]);

  /** Undecided tiles (still showing "Choose…") sort first, so what needs attention is immediately
   *  visible instead of buried below already-resolved tiles — original file order preserved within
   *  each group. */
  const orderedCategoryResolutions = useMemo(() => {
    const isDecided = (r: CategoryResolution) =>
      r.suggestion.kind !== 'create' || touchedCategorySources.has(r.sourceName);
    return [...categoryResolutions].sort((a, b) => Number(isDecided(a)) - Number(isDecided(b)));
  }, [categoryResolutions, touchedCategorySources]);

  return (
    <div className="flex flex-col gap-3">
      {/* (a) structurally unparsed rows */}
      <UnparsedRows rejectedRows={rejectedRows} mapping={mapping} onFixRejected={onFixRejected} />

      {/* (a2) redundant carry-forward markers — excluded, never silently dropped */}
      <CarryForwardExcluded rows={carryForwardExcludedRows} />

      {/* (b) linked transfer pairs — collapsed by default, like a category tile, so a file with many
       *  self-transfers doesn't push the category tiles far down the scroll. */}
      {transferPairs.length > 0 && (
        <div className="surface rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setTransfersExpanded((e) => !e)}
            className="w-full flex items-center justify-between gap-2 p-3 text-left"
          >
            <span className="text-xs font-bold text-primary flex items-center gap-1.5">
              <i className="ti ti-arrows-left-right text-tertiary" aria-hidden="true" />
              Linked transfers
              <span className="bg-surface-3 text-secondary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {transferPairs.length}
              </span>
            </span>
            <i className={`ti ti-chevron-${transfersExpanded ? 'up' : 'down'} text-tertiary`} aria-hidden="true" />
          </button>
          {transfersExpanded && (
            <div className="border-t border-theme px-3 pb-3 pt-2 flex flex-col gap-2">
              {transferPairs.map((pair, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <TransferPairCard pair={pair} />
                  <p className="text-center text-[9.5px] text-tertiary">
                    {pair.alreadyImported
                      ? 'Already imported — not counted or re-imported'
                      : 'Counted once in the total above'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* (d) category tiles */}
      <div className="flex flex-col gap-2">
        <SectionLabel className="mb-0">
          Categories{' '}
          <span className="bg-surface-3 text-secondary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {categoriesDecidedCount} of {categoryResolutions.length} decided
          </span>
        </SectionLabel>
        {orderedCategoryResolutions.map((r) => {
          const decided = r.suggestion.kind !== 'create' || touchedCategorySources.has(r.sourceName);
          const stats = statusByCategory.get(r.sourceName);
          const allDuplicate = !!stats && stats.ready === 0 && stats.attention === 0 && stats.duplicate > 0;
          return (
            <CategoryTile
              key={r.sourceName}
              resolution={r}
              decided={decided}
              status={!decided ? 'attention' : allDuplicate ? 'duplicate' : 'ready'}
              rows={rowsByCategory.get(r.sourceName) ?? []}
              categories={categories}
              groupOptions={groupOptions}
              tag={categoryTags.get(r.sourceName) ?? ''}
              onTagChange={(tag) => onUpdateCategoryTag(r.sourceName, tag)}
              onUpdate={(suggestion) => onUpdateCategory(r.sourceName, suggestion)}
            />
          );
        })}
      </div>
    </div>
  );
}
