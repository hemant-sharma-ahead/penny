// Row grouping for the Transactions wizard stage (2026-08-14, CSV-import redesign Chunk B). Unlike
// `importTileGrouping.ts`'s `groupRowsIntoTiles()` (which derives a tile's identity fresh from each
// row's own `categoryName`+`type` — the model the old single-screen `ReviewStep`/`PreviewSection` used),
// this stage starts from row-groups the Categories stage ALREADY produced (one group per
// `DirectionalCategoryResolution`, or — for a transfer/IOU-suspect category — one group per
// `CounterpartyGroup`; see `importCategoryResolution.ts`/`importCounterpartySplit.ts`). Every row
// already belongs to exactly one such group by the time this stage is reached, so this function's job
// is narrower than `groupRowsIntoTiles`'s: apply the same two exclusion/synthesis rules on top of
// already-formed groups, instead of deriving groups from scratch:
//   1. A row already claimed by a (non-un-paired) transfer pair, or already a duplicate, must never ALSO
//      render inside its own Categories-stage group — exactly `groupRowsIntoTiles`' rule #1.
//   2. A row moved via a per-row `RowOverride` to an EXISTING category with no group of its own here
//      lands in a freshly-synthesized tile identity — `groupRowsIntoTiles`' rule #3, unchanged in spirit.
// `apps/web-react` never reaches a Transactions stage (frozen before this redesign) — this file has
// exactly one consumer, apps/mobile's new `useImport.ts`/`TransactionsStage.tsx`.
import type { ParsedRow } from './importParsers';
import type { RowOverride } from './importPipeline';

export type TransactionRowTriage = 'ready' | 'attention' | 'duplicate';

export interface TransactionRowRef {
  row: ParsedRow;
  index: number;
}

export interface TransferPairIndices {
  outgoingIndex: number;
  incomingIndex: number;
}

/** One Categories-stage-resolved row-group feeding into this stage — `fullKey` is either a
 *  `DirectionalCategoryResolution.key` (`${sourceName}::${type}`) or, for a counterparty-split
 *  category, `` `${parentKey}::${groupKey}` `` (see `CounterpartyGroup`'s own doc comment). */
export interface CategoryRowGroupInput {
  fullKey: string;
  rowIndices: number[];
}

export interface TransactionsGroupingResult {
  /** Every row NOT excluded below, grouped by its Categories-stage `fullKey`. */
  rowsByFullKey: Map<string, TransactionRowRef[]>;
  /** Every synthesized ("moved row, no existing Categories-stage group") key present in
   *  `rowsByFullKey`, with the destination category info needed to render it (`MovedRowsTile.tsx`). */
  syntheticTiles: Map<string, { categoryId: string; categoryName: string }>;
  /** Every duplicate row NOT already claimed by a transfer pair — one flat, whole-import bucket. */
  duplicateRows: TransactionRowRef[];
}

/** Computes one row's effective grouping key for this stage — mirrors
 *  `importTileGrouping.ts`'s `computeEffectiveTileKey`, adapted to look up the row's Categories-stage
 *  group instead of deriving a key from its raw category name. */
function effectiveKeyForRow(
  index: number,
  fullKeyByRowIndex: Map<number, string>,
  rowOverrides: Map<number, RowOverride> | undefined,
  tileForExistingCategoryId: Map<string, string>
): { key: string; synthetic?: { categoryId: string; categoryName: string } } {
  const override = rowOverrides?.get(index);
  if (!override?.categoryId) {
    return { key: fullKeyByRowIndex.get(index) ?? `unresolved:${index}` };
  }
  const existingGroupKey = tileForExistingCategoryId.get(override.categoryId);
  if (existingGroupKey) return { key: existingGroupKey };
  return {
    key: `override:${override.categoryId}`,
    synthetic: { categoryId: override.categoryId, categoryName: override.categoryName ?? 'Other' }
  };
}

/** Groups every parsed row into its rendered Transactions-stage tile. `rowGroups` is the Categories
 *  stage's own output (row index → `fullKey`); `transferPairs`/`rowTriage` are the same shapes
 *  `groupRowsIntoTiles` already takes. */
export function groupRowsForTransactionsStage(
  parsedRows: ParsedRow[],
  rowTriage: TransactionRowTriage[],
  transferPairs: TransferPairIndices[],
  rowGroups: CategoryRowGroupInput[],
  tileForExistingCategoryId: Map<string, string>,
  rowOverrides?: Map<number, RowOverride>
): TransactionsGroupingResult {
  const fullKeyByRowIndex = new Map<number, string>();
  for (const g of rowGroups) {
    for (const i of g.rowIndices) fullKeyByRowIndex.set(i, g.fullKey);
  }

  const transferPairedIndices = new Set<number>();
  for (const pair of transferPairs) {
    transferPairedIndices.add(pair.outgoingIndex);
    transferPairedIndices.add(pair.incomingIndex);
  }

  const rowsByFullKey = new Map<string, TransactionRowRef[]>();
  const syntheticTiles = new Map<string, { categoryId: string; categoryName: string }>();
  const duplicateRows: TransactionRowRef[] = [];

  parsedRows.forEach((row, index) => {
    if (transferPairedIndices.has(index)) return;
    if (rowTriage[index] === 'duplicate') {
      duplicateRows.push({ row, index });
      return;
    }

    const { key, synthetic } = effectiveKeyForRow(index, fullKeyByRowIndex, rowOverrides, tileForExistingCategoryId);
    const list = rowsByFullKey.get(key) ?? [];
    list.push({ row, index });
    rowsByFullKey.set(key, list);
    if (synthetic) syntheticTiles.set(key, synthetic);
  });

  // Most-recent-first within every tile's row list (2026-08-20, item 41 real-device testing pass) — the
  // file/parse order these groups were built in is otherwise ascending-by-appearance-in-file, not by
  // date, which reads oddly once a tile has more than a couple of rows. Applied once here so every
  // consumer of `rowsByFullKey` (`CategoryTile.tsx`'s row list, `MovedRowsTile.tsx`'s synthetic tiles)
  // and `duplicateRows` (`DuplicatesBucket.tsx`) gets the same order consistently, instead of each
  // component re-sorting its own copy.
  for (const list of rowsByFullKey.values()) sortByDateDescending(list);
  sortByDateDescending(duplicateRows);

  return { rowsByFullKey, syntheticTiles, duplicateRows };
}

function sortByDateDescending(rows: TransactionRowRef[]): void {
  rows.sort((a, b) => b.row.date - a.row.date);
}
