import { describe, expect, it } from 'vitest';
import { computeEffectiveTileKey, groupRowsIntoTiles, type RowTriage } from '@/core/import/importTileGrouping';
import type { RowOverride } from '@/core/import/importPipeline';
import type { ParsedRow } from '@/core/import/importParsers';

function row(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    date: 0,
    amount: 100,
    description: 'x',
    categoryName: 'Other',
    type: 'expense',
    hashtags: [],
    ...overrides
  };
}

describe('computeEffectiveTileKey', () => {
  it('uses the row’s own source category name when there is no override', () => {
    const result = computeEffectiveTileKey(row({ categoryName: 'Uber' }), 0, undefined, new Map());
    expect(result).toEqual({ baseKey: 'Uber' });
  });

  it('falls back to "Other" for a blank/whitespace-only category name', () => {
    const result = computeEffectiveTileKey(row({ categoryName: '   ' }), 0, undefined, new Map());
    expect(result.baseKey).toBe('Other');
  });

  it('regroups into an already-existing resolution-backed tile when the override’s destination category is already mapped', () => {
    const overrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-travel', categoryName: 'Travel' }]]);
    const tileForExistingCategoryId = new Map([['cat-travel', 'Uber']]);
    const result = computeEffectiveTileKey(row({ categoryName: 'Ola' }), 0, overrides, tileForExistingCategoryId);
    expect(result).toEqual({ baseKey: 'Uber' });
  });

  it('synthesizes a fresh tile identity when no existing tile maps to the override’s destination category (the #5 fix)', () => {
    const overrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-food', categoryName: 'Food' }]]);
    const result = computeEffectiveTileKey(row({ categoryName: 'Uber' }), 0, overrides, new Map());
    expect(result).toEqual({
      baseKey: 'override:cat-food',
      synthetic: { categoryId: 'cat-food', categoryName: 'Food' }
    });
  });

  it('synthesizes using the row’s own source name as a categoryName fallback when the override omits one', () => {
    const overrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-food' }]]);
    const result = computeEffectiveTileKey(row({ categoryName: 'Uber' }), 0, overrides, new Map());
    expect(result.synthetic).toEqual({ categoryId: 'cat-food', categoryName: 'Uber' });
  });
});

describe('groupRowsIntoTiles', () => {
  const triageAllReady = (n: number): RowTriage[] => Array.from({ length: n }, () => 'ready' as const);

  it('groups rows by source category name when nothing is excluded', () => {
    const rows = [row({ categoryName: 'Uber' }), row({ categoryName: 'Uber' }), row({ categoryName: 'Food' })];
    const result = groupRowsIntoTiles(rows, triageAllReady(3), [], new Map());
    expect(result.rowsByTileKey.get('Uber::expense')).toHaveLength(2);
    expect(result.rowsByTileKey.get('Food::expense')).toHaveLength(1);
    expect(result.duplicateRows).toEqual([]);
  });

  it('excludes a duplicate row from its category tile into one flat duplicates bucket (#3)', () => {
    const rows = [row({ categoryName: 'Uber' }), row({ categoryName: 'Uber' }), row({ categoryName: 'Food' })];
    const triage: RowTriage[] = ['ready', 'duplicate', 'duplicate'];
    const result = groupRowsIntoTiles(rows, triage, [], new Map());
    expect(result.rowsByTileKey.get('Uber::expense')).toHaveLength(1);
    expect(result.rowsByTileKey.has('Food::expense')).toBe(false);
    expect(result.duplicateRows).toHaveLength(2);
    expect(result.duplicateRows.map((r) => r.index)).toEqual([1, 2]);
  });

  it('excludes both legs of a transfer pair from their category tiles entirely (#4)', () => {
    const rows = [
      row({ categoryName: 'Self Transfer', type: 'expense' }),
      row({ categoryName: 'Self Transfer', type: 'income' }),
      row({ categoryName: 'Groceries' })
    ];
    const result = groupRowsIntoTiles(rows, triageAllReady(3), [{ outgoingIndex: 0, incomingIndex: 1 }], new Map());
    expect(result.rowsByTileKey.has('Self Transfer::expense')).toBe(false);
    expect(result.rowsByTileKey.has('Self Transfer::income')).toBe(false);
    expect(result.rowsByTileKey.get('Groceries::expense')).toHaveLength(1);
  });

  it('never double-renders a duplicate leg of a still-paired transfer in the duplicates bucket (exclusion precedence)', () => {
    const rows = [
      row({ categoryName: 'Self Transfer', type: 'expense' }),
      row({ categoryName: 'Self Transfer', type: 'income' })
    ];
    const triage: RowTriage[] = ['duplicate', 'duplicate'];
    const result = groupRowsIntoTiles(rows, triage, [{ outgoingIndex: 0, incomingIndex: 1 }], new Map());
    // Both rows are ALSO duplicates, but transfer-pair membership wins — neither shows up anywhere else.
    expect(result.duplicateRows).toEqual([]);
    expect(result.rowsByTileKey.size).toBe(0);
  });

  it('an un-paired transfer leg (caller already filtered it out of `transferPairs`) rejoins its own homogeneous tile', () => {
    const rows = [
      row({ categoryName: 'Balance Correction', type: 'expense' }),
      row({ categoryName: 'Balance Correction', type: 'income' })
    ];
    // Simulates the caller (useImport.ts) having already dropped this pair from `transferPairs` because
    // the user tapped "Not a transfer — log separately".
    const result = groupRowsIntoTiles(rows, triageAllReady(2), [], new Map());
    expect(result.rowsByTileKey.get('Balance Correction::expense')).toHaveLength(1);
    expect(result.rowsByTileKey.get('Balance Correction::income')).toHaveLength(1);
  });

  it('splits a genuinely mixed source category into two homogeneous tiles (#10)', () => {
    const rows = [
      row({ categoryName: 'Cash', type: 'expense' }),
      row({ categoryName: 'Cash', type: 'income' }),
      row({ categoryName: 'Cash', type: 'expense' })
    ];
    const result = groupRowsIntoTiles(rows, triageAllReady(3), [], new Map());
    expect(result.rowsByTileKey.get('Cash::expense')).toHaveLength(2);
    expect(result.rowsByTileKey.get('Cash::income')).toHaveLength(1);
  });

  it('records a synthesized moved-to tile in `syntheticTiles`, keyed by its full homogeneity-suffixed key', () => {
    const rows = [row({ categoryName: 'Uber', type: 'expense' })];
    const overrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-food', categoryName: 'Food' }]]);
    const result = groupRowsIntoTiles(rows, triageAllReady(1), [], new Map(), overrides);
    expect(result.rowsByTileKey.get('override:cat-food::expense')).toHaveLength(1);
    expect(result.syntheticTiles.get('override:cat-food::expense')).toEqual({
      categoryId: 'cat-food',
      categoryName: 'Food'
    });
  });

  it('a moved row that regroups into an existing tile is NOT recorded as synthetic', () => {
    const rows = [row({ categoryName: 'Ola', type: 'expense' })];
    const overrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-travel', categoryName: 'Travel' }]]);
    const tileForExistingCategoryId = new Map([['cat-travel', 'Uber']]);
    const result = groupRowsIntoTiles(rows, triageAllReady(1), [], tileForExistingCategoryId, overrides);
    expect(result.rowsByTileKey.get('Uber::expense')).toHaveLength(1);
    expect(result.syntheticTiles.size).toBe(0);
  });
});
