import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import { TileRowList } from './TileRowList';

interface DuplicatesBucketProps {
  /** Every row excluded from a normal category tile because it's a duplicate — one single flat,
   *  whole-import bucket (never per-category), from `groupRowsIntoTiles`'s `duplicateRows`. See
   *  `importTileGrouping.ts`'s doc comment for exclusion precedence vs. a transfer-paired row. */
  rows: { row: ParsedRow; index: number }[];
  rowOverrides: Map<number, RowOverride>;
}

/**
 * "Already imported" bucket body (2026-08-13, review redesign issue #3/#6; own header/expand chrome
 * removed 2026-08-13, bucket-tiles redesign) — structurally isolates every duplicate row out of its
 * normal category tile into one dedicated bucket, matching Bank Import's own "an already-recorded
 * transaction gets pulled out, never left sitting inline with rows that still need action" model. Used
 * to own its own collapsed-by-default header/chevron; `PreviewSection.tsx`'s new peer bucket-card wrapper
 * owns that chrome now (same header/expand convention as "Needs your input"/"Staged"), so this component
 * is just the row-list body.
 */
export function DuplicatesBucket({ rows, rowOverrides }: DuplicatesBucketProps) {
  if (rows.length === 0) return null;

  return (
    <TileRowList
      rows={rows}
      rowOverrides={rowOverrides}
      captionForRow={() => 'same date, amount & description as a logged expense'}
    />
  );
}
