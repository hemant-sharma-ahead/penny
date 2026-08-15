import { describe, expect, it } from 'vitest';
import { groupRowsForTransactionsStage } from '@/core/import/importTransactionsGrouping';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';

function row(categoryName: string, type: ParsedRow['type'] = 'expense'): ParsedRow {
  return { date: 0, amount: 100, description: 'x', categoryName, type, hashtags: [] };
}

describe('groupRowsForTransactionsStage', () => {
  it('groups rows by their Categories-stage fullKey', () => {
    const rows = [row('Groceries'), row('Groceries'), row('Travel')];
    const result = groupRowsForTransactionsStage(
      rows,
      ['ready', 'ready', 'ready'],
      [],
      [
        { fullKey: 'Groceries::expense', rowIndices: [0, 1] },
        { fullKey: 'Travel::expense', rowIndices: [2] }
      ],
      new Map()
    );
    expect(result.rowsByFullKey.get('Groceries::expense')).toHaveLength(2);
    expect(result.rowsByFullKey.get('Travel::expense')).toHaveLength(1);
    expect(result.duplicateRows).toHaveLength(0);
  });

  it('excludes a transfer-paired row from its normal group entirely', () => {
    const rows = [row('Balance Correction', 'expense'), row('Balance Correction', 'income')];
    const result = groupRowsForTransactionsStage(
      rows,
      ['ready', 'ready'],
      [{ outgoingIndex: 0, incomingIndex: 1 }],
      [
        { fullKey: 'Balance Correction::expense', rowIndices: [0] },
        { fullKey: 'Balance Correction::income', rowIndices: [1] }
      ],
      new Map()
    );
    expect(result.rowsByFullKey.size).toBe(0);
    expect(result.duplicateRows).toHaveLength(0);
  });

  it('routes a duplicate (non-transfer-paired) row into the flat duplicateRows bucket, not its normal group', () => {
    const rows = [row('Groceries'), row('Groceries')];
    const result = groupRowsForTransactionsStage(
      rows,
      ['ready', 'duplicate'],
      [],
      [{ fullKey: 'Groceries::expense', rowIndices: [0, 1] }],
      new Map()
    );
    expect(result.rowsByFullKey.get('Groceries::expense')).toHaveLength(1);
    expect(result.duplicateRows).toHaveLength(1);
    expect(result.duplicateRows[0]?.index).toBe(1);
  });

  it('regroups a row-level override into an already-existing group for that category id', () => {
    const rows = [row('Groceries'), row('Zomato Guess')];
    const rowOverrides = new Map<number, RowOverride>([[1, { categoryId: 'cat-food', categoryName: 'Dining' }]]);
    const tileForExistingCategoryId = new Map([['cat-food', 'Groceries::expense']]);
    const result = groupRowsForTransactionsStage(
      rows,
      ['ready', 'ready'],
      [],
      [{ fullKey: 'Groceries::expense', rowIndices: [0] }],
      tileForExistingCategoryId,
      rowOverrides
    );
    expect(result.rowsByFullKey.get('Groceries::expense')).toHaveLength(2);
    expect(result.syntheticTiles.size).toBe(0);
  });

  it('synthesizes a fresh tile for a moved row with no existing group for its destination category', () => {
    const rows = [row('Some Source Category')];
    const rowOverrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-new', categoryName: 'Freelance' }]]);
    const result = groupRowsForTransactionsStage(rows, ['ready'], [], [], new Map(), rowOverrides);
    expect(result.rowsByFullKey.get('override:cat-new')).toHaveLength(1);
    expect(result.syntheticTiles.get('override:cat-new')).toMatchObject({
      categoryId: 'cat-new',
      categoryName: 'Freelance'
    });
  });
});
