// Tile-grouping logic for the Expense Import review screen's category tiles
// (apps/mobile/src/features/import/review/PreviewSection.tsx). Extracted to packages/core (2026-08-13,
// review-screen redesign) so the exclusion/homogeneity/moved-row rules — previously inline `useMemo`
// callbacks with no unit coverage — get real vitest coverage. Three structural fixes live here:
//
//   1. A row already claimed by a (non-un-paired) transfer pair, or already marked a duplicate, must
//      never ALSO render inside its own category tile — each row lives in exactly one place. Transfer
//      membership is checked first: a duplicate leg of a still-paired transfer stays visible (dimmed)
//      only inside "Linked transfers", not a second time in a separate "Already imported" bucket.
//   2. A tile must never mix expense and income rows (homogeneity) — the full tile key is always
//      `${baseKey}::${row.type}`, so a source category whose rows are genuinely mixed produces two
//      tiles instead of one.
//   3. A row moved (via a per-row `RowOverride`) to a category with no existing resolution-backed tile
//      of its own must land in a freshly-synthesized tile identity, not fall back to its origin
//      source-category tile (the real bug this closes — see `computeEffectiveTileKey`'s doc comment).
import type { ParsedRow } from './importParsers';
import type { RowOverride } from './importPipeline';

export type RowTriage = 'ready' | 'attention' | 'duplicate';

export interface TileRowRef {
  row: ParsedRow;
  index: number;
}

/** Minimal transfer-pair shape this module needs — deliberately narrower than the full `TransferPair`
 *  (just the two indices) so this file doesn't have to import `./importTransferPairing` for a type-only
 *  dependency. */
export interface TransferPairIndices {
  outgoingIndex: number;
  incomingIndex: number;
}

export interface EffectiveTileKey {
  /** The tile identity BEFORE the `::${row.type}` homogeneity suffix is appended — either the row's own
   *  (trimmed) source category name, an already-existing resolution-backed tile's source name (when an
   *  override moved this row to a category some OTHER source name already resolves to via 'existing'),
   *  or a freshly-synthesized `override:${categoryId}` identity when neither applies. */
  baseKey: string;
  /** Present only for the freshly-synthesized case above — the destination category info needed to
   *  render a lightweight synthetic tile with no backing `CategoryResolution` (no kind picker, no
   *  transfer/create fields; see `MovedRowsTile.tsx`). */
  synthetic?: { categoryId: string; categoryName: string };
}

/** Computes one row's effective tile identity. `tileForExistingCategoryId` maps a real `categoryId` to
 *  whichever source category name is ALREADY resolved ('existing') to it — see `PreviewSection.tsx`'s
 *  own doc comment for why the first match wins on a tie. A row with an active override:
 *    - regroups into that already-existing tile if one exists for its destination categoryId (this is
 *      the ORIGINAL, still-correct behavior for "moved to a category some other source name already
 *      maps to");
 *    - otherwise synthesizes a brand-new tile identity (this is the FIX — previously it fell back to
 *      the row's own origin source name, silently leaving the row stuck in its old tile with only a
 *      cosmetic "moved to X" annotation; see docs/mockups/proposals/expense-import-review-redesign-v1.html
 *      §5).
 *  A row with no override at all just uses its own source category name, unchanged. */
export function computeEffectiveTileKey(
  row: ParsedRow,
  index: number,
  rowOverrides: Map<number, RowOverride> | undefined,
  tileForExistingCategoryId: Map<string, string>
): EffectiveTileKey {
  const sourceKey = row.categoryName.trim() || 'Other';
  const override = rowOverrides?.get(index);
  if (!override?.categoryId) return { baseKey: sourceKey };

  const existingTileSourceName = tileForExistingCategoryId.get(override.categoryId);
  if (existingTileSourceName) return { baseKey: existingTileSourceName };

  return {
    baseKey: `override:${override.categoryId}`,
    synthetic: { categoryId: override.categoryId, categoryName: override.categoryName ?? sourceKey }
  };
}

export interface TileGroupingResult {
  /** Every row NOT excluded below, grouped by its full (homogeneity-safe) tile key
   *  `${baseKey}::${row.type}` — never mixes expense/income under one key. */
  rowsByTileKey: Map<string, TileRowRef[]>;
  /** Every synthesized ("moved row, no existing tile") key present in `rowsByTileKey`, with the
   *  destination category info needed to render it — see `computeEffectiveTileKey`'s doc comment. */
  syntheticTiles: Map<string, { categoryId: string; categoryName: string }>;
  /** Every duplicate row NOT already claimed by a transfer pair — one single flat, whole-import bucket
   *  (never per-category), matching Bank Import's own "already-recorded transaction gets pulled into
   *  one dedicated bucket" model. See this function's own doc comment for exclusion precedence. */
  duplicateRows: TileRowRef[];
}

/** Groups every parsed row into its rendered category tile, applying (in one single pass) the three
 *  structural exclusion/homogeneity rules described in this file's header comment.
 *
 *  Exclusion precedence: a row already claimed by `transferPairs` (the caller is expected to have
 *  already filtered out any pair the user explicitly un-paired — see `useImport.ts`'s
 *  `unpairedTransferKeys`) is excluded FIRST, before the duplicate check — its "already imported" status
 *  (if any) is shown once, inside "Linked transfers" (`TransferPairCard`'s own dimmed treatment), never
 *  a second time in the separate duplicates bucket this function also produces. */
export function groupRowsIntoTiles(
  parsedRows: ParsedRow[],
  rowTriage: RowTriage[],
  transferPairs: TransferPairIndices[],
  tileForExistingCategoryId: Map<string, string>,
  rowOverrides?: Map<number, RowOverride>
): TileGroupingResult {
  const transferPairedIndices = new Set<number>();
  for (const pair of transferPairs) {
    transferPairedIndices.add(pair.outgoingIndex);
    transferPairedIndices.add(pair.incomingIndex);
  }

  const rowsByTileKey = new Map<string, TileRowRef[]>();
  const syntheticTiles = new Map<string, { categoryId: string; categoryName: string }>();
  const duplicateRows: TileRowRef[] = [];

  parsedRows.forEach((row, index) => {
    if (transferPairedIndices.has(index)) return;
    if (rowTriage[index] === 'duplicate') {
      duplicateRows.push({ row, index });
      return;
    }

    const { baseKey, synthetic } = computeEffectiveTileKey(row, index, rowOverrides, tileForExistingCategoryId);
    const fullKey = `${baseKey}::${row.type}`;
    const list = rowsByTileKey.get(fullKey) ?? [];
    list.push({ row, index });
    rowsByTileKey.set(fullKey, list);
    if (synthetic) syntheticTiles.set(fullKey, synthetic);
  });

  return { rowsByTileKey, syntheticTiles, duplicateRows };
}
