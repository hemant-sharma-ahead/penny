import { describe, expect, it } from 'vitest';
import {
  dedupKey,
  buildPreviewRows,
  matchCategory,
  buildResolvedPreviewRows,
  buildResolvedPreviewRowsByIndex,
  toConfirmedCategoryMap,
  applyConfirmedTransferPairs,
  type ConfirmedCategoryMap,
  type ResolvedPreviewRow,
  type RowOverride,
  type RowAction
} from '@/core/import/importPipeline';
import type { CategoryResolution } from '@/core/import/importCategoryResolution';
import type { TransferPair } from '@/core/import/importTransferPairing';
import type { ExpenseCategory } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';

const categories: ExpenseCategory[] = [
  { id: 'cat-food', name: 'Dining & Café', icon: 'ti-food', color: '#fff', isDefault: true, createdAt: 0 },
  { id: 'cat-other', name: 'Other', icon: 'ti-dots', color: '#fff', isDefault: true, createdAt: 0 }
];

function row(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    date: 0,
    amount: 100,
    description: 'Coffee',
    categoryName: 'Dining',
    type: 'expense',
    hashtags: [],
    ...overrides
  };
}

describe('legacy pipeline (apps/mobile compatibility — must not change behavior)', () => {
  it('matchCategory still resolves via the migration map, falling back to cat-other', () => {
    expect(matchCategory('dining & cafe', categories)).toMatchObject({ id: 'cat-food', unrecognised: false });
    expect(matchCategory('totally unknown', categories)).toMatchObject({ id: 'cat-other', unrecognised: true });
  });

  it('buildPreviewRows enriches rows with matchedCategoryId/duplicate exactly as before', () => {
    const rows = [row()];
    const preview = buildPreviewRows(rows, categories, new Set());
    expect(preview[0]).toMatchObject({ matchedCategoryId: 'cat-food', unrecognised: false, duplicate: false });
  });
});

describe('dedupKey', () => {
  it('is stable for the same date/amount/description and differs otherwise', () => {
    const a = dedupKey(1_700_000_000_000, 100, 'Coffee');
    const b = dedupKey(1_700_000_000_000, 100, 'Coffee');
    const c = dedupKey(1_700_000_000_000, 100, 'Tea');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('buildResolvedPreviewRows', () => {
  const categoryMap: ConfirmedCategoryMap = new Map([
    ['Dining', { categoryId: 'cat-food', categoryName: 'Dining & Café' }]
  ]);
  const resolveAccountId = () => 'acc-1';

  it('applies the confirmed category resolution to each row', () => {
    const preview = buildResolvedPreviewRows([row()], categoryMap, resolveAccountId, new Set());
    expect(preview[0]).toMatchObject({ categoryId: 'cat-food', categoryName: 'Dining & Café', accountId: 'acc-1' });
  });

  it('catches an in-batch duplicate — two identical rows in the SAME file, not just against existing DB expenses', () => {
    // This was a real, confirmed gap in the original pipeline: it only ever checked existingKeys
    // (loaded once from the DB at mount), so two identical rows in one uploaded file both imported.
    const rows = [row(), row()];
    const preview = buildResolvedPreviewRows(rows, categoryMap, resolveAccountId, new Set());
    expect(preview[0]?.duplicate).toBe(false);
    expect(preview[1]?.duplicate).toBe(true);
  });

  it('still flags a duplicate against an existing DB expense', () => {
    const ref = dedupKey(0, 100, 'Coffee');
    const preview = buildResolvedPreviewRows([row()], categoryMap, resolveAccountId, new Set([ref]));
    expect(preview[0]?.duplicate).toBe(true);
  });

  it('does NOT flag two genuinely distinct same-day/amount/description rows as duplicates of each other (2026-08-14 fix)', () => {
    // Real MoneyView shape: two separate ATM withdrawals, same day/amount/description, different
    // exact timestamps (confirmed 149 such collisions / 334 rows in one real 9,384-row file) — before
    // this fix, dedupKey truncated to day-only, so the second was silently dropped as a false-positive
    // "already imported" duplicate despite never existing anywhere before.
    const rows = [row({ date: 1_700_000_000_000 }), row({ date: 1_700_003_600_000 })]; // 1 hour apart
    const preview = buildResolvedPreviewRows(rows, categoryMap, resolveAccountId, new Set());
    expect(preview[0]?.duplicate).toBe(false);
    expect(preview[1]?.duplicate).toBe(false);
  });

  it('marks a row skipped when its category resolution was "skip", excluding it without dropping it', () => {
    const skipMap: ConfirmedCategoryMap = new Map([['Dining', { categoryId: '', categoryName: 'Dining', skip: true }]]);
    const preview = buildResolvedPreviewRows([row()], skipMap, resolveAccountId, new Set());
    expect(preview[0]?.skipped).toBe(true);
  });

  it('overrides the row type to "transfer" when the category resolved as a transfer', () => {
    const transferMap: ConfirmedCategoryMap = new Map([
      ['Balance Correction', { categoryId: 'cat-tr-other', categoryName: 'Other Transfer', type: 'transfer' }]
    ]);
    const preview = buildResolvedPreviewRows(
      [row({ categoryName: 'Balance Correction', type: 'income' })],
      transferMap,
      resolveAccountId,
      new Set()
    );
    expect(preview[0]?.type).toBe('transfer');
  });

  it('applies a per-source-category custom tag to every matching row, on top of its own hashtags', () => {
    const taggedMap: ConfirmedCategoryMap = new Map([
      ['Dining', { categoryId: 'cat-food', categoryName: 'Dining & Café', tag: 'goa-trip' }]
    ]);
    const preview = buildResolvedPreviewRows(
      [row({ hashtags: ['existing-tag'] }), row({ description: 'Tea' })],
      taggedMap,
      resolveAccountId,
      new Set()
    );
    expect(preview[0]?.hashtags).toEqual(['existing-tag', 'goa-trip']);
    expect(preview[1]?.hashtags).toEqual(['goa-trip']);
  });

  it('does not duplicate a custom tag the row already carries', () => {
    const taggedMap: ConfirmedCategoryMap = new Map([
      ['Dining', { categoryId: 'cat-food', categoryName: 'Dining & Café', tag: 'goa-trip' }]
    ]);
    const preview = buildResolvedPreviewRows([row({ hashtags: ['goa-trip'] })], taggedMap, resolveAccountId, new Set());
    expect(preview[0]?.hashtags).toEqual(['goa-trip']);
  });

  // rowOverrides (2026-08-06) — bulk-select port from Bank Statement Import, per explicit user
  // decision. A row-level override sits ON TOP of the group-level resolution above; these tests confirm
  // it wins when present, and that siblings sharing the same sourceName are untouched.
  describe('rowOverrides', () => {
    it("a row-level override's category wins over the group-level resolution, for that row only", () => {
      const rows = [row(), row({ description: 'Tea' })];
      const overrides = new Map<number, RowOverride>([[1, { categoryId: 'cat-other', categoryName: 'Other' }]]);
      const preview = buildResolvedPreviewRows(rows, categoryMap, resolveAccountId, new Set(), overrides);
      // Row 0 (not overridden) still gets the group's own "Dining" resolution.
      expect(preview[0]).toMatchObject({ categoryId: 'cat-food', categoryName: 'Dining & Café' });
      // Row 1 (overridden) gets the override's category instead, despite sharing the same sourceName.
      expect(preview[1]).toMatchObject({ categoryId: 'cat-other', categoryName: 'Other' });
    });

    it("an override's tag applies only to that row, independent of the group's own tag", () => {
      const taggedMap: ConfirmedCategoryMap = new Map([
        ['Dining', { categoryId: 'cat-food', categoryName: 'Dining & Café', tag: 'group-tag' }]
      ]);
      const rows = [row(), row({ description: 'Tea' })];
      const overrides = new Map<number, RowOverride>([[1, { tag: 'row-tag' }]]);
      const preview = buildResolvedPreviewRows(rows, taggedMap, resolveAccountId, new Set(), overrides);
      expect(preview[0]?.hashtags).toEqual(['group-tag']);
      // The row-level tag REPLACES the group's tag for this row, it doesn't add both.
      expect(preview[1]?.hashtags).toEqual(['row-tag']);
      // And the row-level override's own category is untouched (tag-only override) — still whatever
      // the group resolved to.
      expect(preview[1]).toMatchObject({ categoryId: 'cat-food', categoryName: 'Dining & Café' });
    });

    it('a category-move override un-skips a row even if its group resolution was "skip"', () => {
      const skipMap: ConfirmedCategoryMap = new Map([
        ['Dining', { categoryId: '', categoryName: 'Dining', skip: true }]
      ]);
      const overrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-food', categoryName: 'Dining & Café' }]]);
      const preview = buildResolvedPreviewRows([row()], skipMap, resolveAccountId, new Set(), overrides);
      expect(preview[0]?.skipped).toBe(false);
      expect(preview[0]).toMatchObject({ categoryId: 'cat-food', categoryName: 'Dining & Café' });
    });

    it("a category-move override reverts a row's type back from 'transfer' to its own natural type", () => {
      const transferMap: ConfirmedCategoryMap = new Map([
        ['Balance Correction', { categoryId: 'cat-tr-other', categoryName: 'Other Transfer', type: 'transfer' }]
      ]);
      const overrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-food', categoryName: 'Dining & Café' }]]);
      const preview = buildResolvedPreviewRows(
        [row({ categoryName: 'Balance Correction', type: 'income' })],
        transferMap,
        resolveAccountId,
        new Set(),
        overrides
      );
      expect(preview[0]?.type).toBe('income');
    });

    it('is a no-op when omitted entirely — existing callers with no 5th argument behave exactly as before', () => {
      const preview = buildResolvedPreviewRows([row()], categoryMap, resolveAccountId, new Set());
      expect(preview[0]).toMatchObject({ categoryId: 'cat-food', categoryName: 'Dining & Café' });
    });
  });
});

describe('applyConfirmedTransferPairs', () => {
  function resolvedRow(overrides: Partial<ResolvedPreviewRow> = {}): ResolvedPreviewRow {
    return {
      date: 100,
      amount: 5000,
      description: 'Cash withdrawal',
      type: 'expense',
      hashtags: [],
      categoryId: 'cat-tr-other',
      categoryName: 'Other Transfer',
      accountId: 'acc-hdfc',
      skipped: false,
      duplicate: false,
      sourceRef: 'ref-1',
      ...overrides
    };
  }

  it('merges a confirmed pair into ONE row with type transfer, accountId, and toAccountId', () => {
    const rows: ResolvedPreviewRow[] = [
      resolvedRow({ accountId: 'acc-hdfc', type: 'expense', amount: 5000 }),
      resolvedRow({ accountId: 'acc-cash', type: 'income', amount: 5000, sourceRef: 'ref-2' })
    ];
    const pairs: TransferPair[] = [
      { outgoingIndex: 0, incomingIndex: 1, fromAccount: 'HDFC1234', toAccount: 'Cash', amount: 5000, date: 100 }
    ];
    const result = applyConfirmedTransferPairs(rows, pairs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'transfer',
      accountId: 'acc-hdfc',
      toAccountId: 'acc-cash',
      amount: 5000
    });
  });

  it('leaves rows NOT part of any pair unchanged', () => {
    const rows: ResolvedPreviewRow[] = [
      resolvedRow({ accountId: 'acc-hdfc', type: 'expense' }),
      resolvedRow({ accountId: 'acc-cash', type: 'income', sourceRef: 'ref-2' }),
      resolvedRow({ accountId: 'acc-other', type: 'expense', description: 'Groceries', sourceRef: 'ref-3' })
    ];
    const pairs: TransferPair[] = [
      { outgoingIndex: 0, incomingIndex: 1, fromAccount: 'HDFC1234', toAccount: 'Cash', amount: 5000, date: 100 }
    ];
    const result = applyConfirmedTransferPairs(rows, pairs);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.description === 'Groceries')).toMatchObject({ accountId: 'acc-other' });
  });

  it('returns every row unchanged when there are no confirmed pairs', () => {
    const rows: ResolvedPreviewRow[] = [resolvedRow(), resolvedRow({ sourceRef: 'ref-2' })];
    const result = applyConfirmedTransferPairs(rows, []);
    expect(result).toEqual(rows);
  });
});

describe('toConfirmedCategoryMap', () => {
  it('resolves a "create" action to the real id created for it', () => {
    const resolutions: CategoryResolution[] = [
      {
        sourceName: 'Pet Supplies',
        count: 3,
        suggestion: { kind: 'create', suggestedName: 'Pet Supplies', suggestedIntentGroup: 'other' }
      }
    ];
    const created = new Map([['Pet Supplies', 'cat-new-123']]);
    const map = toConfirmedCategoryMap(resolutions, created);
    expect(map.get('Pet Supplies')).toMatchObject({ categoryId: 'cat-new-123', categoryName: 'Pet Supplies' });
  });

  it('marks a "skip" action with skip: true and an empty categoryId', () => {
    const resolutions: CategoryResolution[] = [{ sourceName: 'A/c to A/c', count: 1, suggestion: { kind: 'skip' } }];
    const map = toConfirmedCategoryMap(resolutions, new Map());
    expect(map.get('A/c to A/c')).toMatchObject({ skip: true });
  });

  it('threads the optional per-source tag through, normalised (trimmed, lowercased, leading # stripped)', () => {
    const resolutions: CategoryResolution[] = [
      {
        sourceName: 'Jaipur Expenses',
        count: 2,
        suggestion: { kind: 'existing', categoryId: 'cat-travel', categoryName: 'Travel' }
      }
    ];
    const map = toConfirmedCategoryMap(resolutions, new Map(), new Map([['Jaipur Expenses', '  #Goa-Trip  ']]));
    expect(map.get('Jaipur Expenses')).toMatchObject({ tag: 'goa-trip' });
  });

  it('omits tag entirely when no tag was set for that source name', () => {
    const resolutions: CategoryResolution[] = [
      {
        sourceName: 'Groceries',
        count: 1,
        suggestion: { kind: 'existing', categoryId: 'cat-food', categoryName: 'Food' }
      }
    ];
    const map = toConfirmedCategoryMap(resolutions, new Map(), new Map());
    expect(map.get('Groceries')).not.toHaveProperty('tag');
  });
});

describe('buildResolvedPreviewRowsByIndex (2026-08-14, CSV-import redesign Chunk B)', () => {
  const resolveAccountId = () => 'acc-1';

  it('resolves two rows sharing the same source category name to COMPLETELY different actions, keyed by index', () => {
    const rows = [
      row({ categoryName: 'A/c to A/c', type: 'expense' }),
      row({ categoryName: 'A/c to A/c', type: 'income' })
    ];
    const rowActions = new Map<number, RowAction>([
      [0, { categoryId: 'cat-tr-other', categoryName: 'Other Transfer', type: 'transfer', toAccountId: 'acc-cash' }],
      [1, { categoryId: 'cat-salary', categoryName: 'Salary' }]
    ]);
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Set());
    expect(result[0]).toMatchObject({ type: 'transfer', categoryId: 'cat-tr-other', toAccountId: 'acc-cash' });
    expect(result[1]).toMatchObject({ type: 'income', categoryId: 'cat-salary' });
  });

  it('an override always wins over the row-action map entry', () => {
    const rows = [row()];
    const rowActions = new Map<number, RowAction>([[0, { categoryId: 'cat-other', categoryName: 'Other' }]]);
    const rowOverrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-food', categoryName: 'Dining' }]]);
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Set(), rowOverrides);
    expect(result[0]).toMatchObject({ categoryId: 'cat-food', categoryName: 'Dining' });
  });

  it('marks duplicate against both existing DB keys and earlier rows in the same batch', () => {
    const rows = [row({ description: 'Same' }), row({ description: 'Same' })];
    const rowActions = new Map<number, RowAction>([
      [0, { categoryId: 'cat-food', categoryName: 'Food' }],
      [1, { categoryId: 'cat-food', categoryName: 'Food' }]
    ]);
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Set());
    expect(result[0]?.duplicate).toBe(false);
    expect(result[1]?.duplicate).toBe(true); // duplicate of the first row within this same batch
  });

  it('a "skip" action marks the row skipped with an empty categoryId, falling back to "Other"', () => {
    const rows = [row()];
    const rowActions = new Map<number, RowAction>([[0, { categoryId: '', categoryName: 'A/c to A/c', skip: true }]]);
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Set());
    expect(result[0]).toMatchObject({ skipped: true, categoryName: 'A/c to A/c' });
  });

  it('falls back to cat-other/"Other" for a row with no action at all', () => {
    const rows = [row()];
    const result = buildResolvedPreviewRowsByIndex(rows, new Map(), resolveAccountId, new Set());
    expect(result[0]).toMatchObject({ categoryId: 'cat-other', categoryName: 'Other' });
  });
});
