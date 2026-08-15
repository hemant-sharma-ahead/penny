import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import { TileRowList } from './TileRowList';

interface DuplicatesBucketProps {
  /** Every row excluded from a normal category tile because it's a duplicate — one single flat,
   *  whole-import bucket (never per-category). See `importTransactionsGrouping.ts`'s doc comment for
   *  exclusion precedence vs. a transfer-paired row. */
  rows: { row: ParsedRow; index: number }[];
  rowOverrides: Map<number, RowOverride>;
  /** "Not a duplicate — import anyway" (2026-08-14, redesign §8/Issue #7) — moves the row back into its
   *  normal category-decision tile instead of leaving it permanently excluded. Light touch: a per-row
   *  action, not a full un-flag mechanism (see the redesign doc's §8 "light touch, not full bank-import
   *  parity" decision). */
  onNotADuplicate: (index: number) => void;
}

/**
 * "Already imported" bucket body (2026-08-13, review redesign issue #3/#6; own header/expand chrome
 * removed 2026-08-13, bucket-tiles redesign) — structurally isolates every duplicate row out of its
 * normal category tile into one dedicated bucket, matching Bank Import's own "an already-recorded
 * transaction gets pulled out, never left sitting inline with rows that still need action" model.
 * `PreviewSection.tsx`'s former peer bucket-card wrapper (now `TransactionsStage.tsx`'s) owns the header/
 * expand chrome; this component is just the row-list body.
 */
export function DuplicatesBucket({ rows, rowOverrides, onNotADuplicate }: DuplicatesBucketProps) {
  if (rows.length === 0) return null;

  return (
    <TileRowList
      rows={rows}
      rowOverrides={rowOverrides}
      captionForRow={() => 'same date, amount & description as a logged expense'}
      actionForRow={(_row, index) => ({
        label: 'Not a duplicate — import anyway',
        onPress: () => onNotADuplicate(index)
      })}
    />
  );
}
