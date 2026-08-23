import { describe, expect, it } from 'vitest';
import {
  dedupKey,
  buildPreviewRows,
  matchCategory,
  buildResolvedPreviewRows,
  buildResolvedPreviewRowsByIndex,
  toConfirmedCategoryMap,
  applyConfirmedTransferPairs,
  releaseConfirmedPairsFromGroupSkip,
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

describe('applyConfirmedTransferPairs', () => {
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

describe('releaseConfirmedPairsFromGroupSkip (2026-08-22 real-device regression)', () => {
  const fallback = { id: 'cat-tr-other', name: 'Other Transfer' };

  it('un-skips a paired row that was force-skipped by its GROUP-level readiness gate', () => {
    const actions = new Map<number, RowAction>([
      [0, { categoryId: '', categoryName: 'Needs review — not yet resolved', skip: true }],
      [1, { categoryId: '', categoryName: 'Needs review — not yet resolved', skip: true }]
    ]);
    const pairs: TransferPair[] = [
      { outgoingIndex: 0, incomingIndex: 1, fromAccount: 'HDFC1234', toAccount: 'Cash', amount: 5000, date: 100 }
    ];
    const result = releaseConfirmedPairsFromGroupSkip(actions, pairs, fallback);
    expect(result.get(0)).toMatchObject({
      type: 'transfer',
      categoryId: 'cat-tr-other',
      categoryName: 'Other Transfer'
    });
    expect(result.get(1)).toMatchObject({
      type: 'transfer',
      categoryId: 'cat-tr-other',
      categoryName: 'Other Transfer'
    });
    expect(result.get(0)?.skip).toBeUndefined();
  });

  it('the real reported bug: 16 confirmed pairs sharing ONE category with a single unpaired straggler no longer all get force-skipped', () => {
    // Mirrors the exact shape of `useImport.ts`'s `transactionsRowGroups` commit loop: one category
    // group ("Cash Withdrawal::expense") owns 17 row indices — 16 that each pair with a reciprocal
    // "Cash Withdrawal::income" row, plus ONE unpaired straggler (index 32) needing its own manual
    // destination-account pick. Because the group has ANY undecided row, `g.transactionsReady` is false
    // for the WHOLE group, so every one of its 17 rows starts out force-skipped by the group loop —
    // exactly the real regression (16 correctly-detected, correctly-confirmed pairs writing zero rows).
    const groupRowIndices = Array.from({ length: 17 }, (_, i) => i * 2); // 0,2,4,...,32 (17 expense legs)
    const incomeRowIndices = Array.from({ length: 16 }, (_, i) => i * 2 + 1); // 1,3,...,31 (16 income legs)
    const actions = new Map<number, RowAction>();
    for (const i of [...groupRowIndices, ...incomeRowIndices]) {
      actions.set(i, { categoryId: '', categoryName: 'Needs review — not yet resolved', skip: true });
    }
    const pairs: TransferPair[] = Array.from({ length: 16 }, (_, i) => ({
      outgoingIndex: i * 2,
      incomingIndex: i * 2 + 1,
      fromAccount: 'HDFC1234',
      toAccount: 'Cash',
      amount: 5000,
      date: 100
    }));
    const result = releaseConfirmedPairsFromGroupSkip(actions, pairs, fallback);

    // All 16 confirmed pairs (32 row indices) are released from the group-level skip.
    for (const pair of pairs) {
      expect(result.get(pair.outgoingIndex)).toMatchObject({ type: 'transfer' });
      expect(result.get(pair.outgoingIndex)?.skip).toBeUndefined();
      expect(result.get(pair.incomingIndex)).toMatchObject({ type: 'transfer' });
      expect(result.get(pair.incomingIndex)?.skip).toBeUndefined();
    }
    // The unpaired straggler (index 32) correctly stays skipped — it was never confirmed, and this
    // function must never widen its scope beyond rows that are ACTUALLY part of a confirmed pair.
    expect(result.get(32)).toMatchObject({ skip: true, categoryName: 'Needs review — not yet resolved' });
  });

  it('leaves a normal, non-forced-skip action untouched even if the row happens to be paired', () => {
    // A row whose group WAS ready (e.g. `kind: 'existing'`, already decided) must be passed through
    // exactly as-is — `applyConfirmedTransferPairs` overrides `type`/`amount`/`toAccountId` anyway, so
    // there is nothing for this function to "fix" here, and it must never invent work.
    const readyAction: RowAction = { categoryId: 'cat-groceries', categoryName: 'Groceries' };
    const actions = new Map<number, RowAction>([
      [0, readyAction],
      [1, readyAction]
    ]);
    const pairs: TransferPair[] = [
      { outgoingIndex: 0, incomingIndex: 1, fromAccount: 'HDFC1234', toAccount: 'Cash', amount: 5000, date: 100 }
    ];
    const result = releaseConfirmedPairsFromGroupSkip(actions, pairs, fallback);
    expect(result.get(0)).toBe(readyAction);
    expect(result.get(1)).toBe(readyAction);
  });

  it('never touches a row that is not part of any confirmed pair', () => {
    const actions = new Map<number, RowAction>([
      [0, { categoryId: '', categoryName: 'Needs review — not yet resolved', skip: true }]
    ]);
    const result = releaseConfirmedPairsFromGroupSkip(actions, [], fallback);
    expect(result.get(0)).toMatchObject({ skip: true });
  });

  it('the SECOND real reported bug: an explicit user "Skip" on the visible stragglers must not also skip the invisible paired rows sharing that group (2026-08-22 follow-up)', () => {
    // This reproduces `useImport.ts`'s LIVE `rowActions` memo, not the commit-time `finalRowActions` —
    // the actual reported regression this time. The "Balance Correction" tile only ever DISPLAYS its 7
    // unpaired rows (both legs of every one of the 16 pairs are excluded from the tile by
    // `groupRowsForTransactionsStage`) — so when the user explicitly taps "Skip" for what they see, that
    // decision is recorded once at the GROUP's key and the per-group loop applies `{ skip: true }` to
    // EVERY row index the group owns, uniformly — all 39, not just the 7 the user actually acted on.
    // Simulates exactly that: one group's `RowAction` map, ALL 39 rows uniformly skipped by the user's
    // own explicit tile-level decision (deliberately NOT the `!transactionsReady` reason — proving this
    // function fixes a group-level skip regardless of WHY the group ended up skip).
    const pairedIndices = Array.from({ length: 16 }, (_, i) => [i * 2, i * 2 + 1] as const);
    const stragglerIndices = [32, 33, 34, 35, 36, 37, 38];
    const actions = new Map<number, RowAction>();
    for (const [out, inc] of pairedIndices) {
      actions.set(out, { categoryId: '', categoryName: 'Balance Correction', skip: true });
      actions.set(inc, { categoryId: '', categoryName: 'Balance Correction', skip: true });
    }
    for (const i of stragglerIndices) {
      actions.set(i, { categoryId: '', categoryName: 'Balance Correction', skip: true });
    }
    const pairs: TransferPair[] = pairedIndices.map(([outgoingIndex, incomingIndex]) => ({
      outgoingIndex,
      incomingIndex,
      fromAccount: 'HDFC XX8112',
      toAccount: 'Cash',
      amount: 5000,
      date: 100
    }));

    // This is the LIVE-layer release — called with every currently-still-paired `transferPairs` entry
    // (not the narrower `confirmedTransferPairs`, which doesn't exist yet at this point in the real hook).
    const result = releaseConfirmedPairsFromGroupSkip(actions, pairs, fallback);

    for (const [out, inc] of pairedIndices) {
      expect(result.get(out)).toMatchObject({ type: 'transfer' });
      expect(result.get(out)?.skip).toBeUndefined();
      expect(result.get(inc)).toMatchObject({ type: 'transfer' });
      expect(result.get(inc)?.skip).toBeUndefined();
    }
    // The 7 stragglers are exactly what the user actually chose to skip — must stay skipped.
    for (const i of stragglerIndices) {
      expect(result.get(i)).toMatchObject({ skip: true, categoryName: 'Balance Correction' });
    }
  });

  it('full real-shape simulation: 999 other-category rows + 16 confirmed transfers + 7 user-skipped stragglers = 1015 written, 0 silently lost', () => {
    // End-to-end proof against the exact real numbers reported: 1038 total rows, 39 "Balance
    // Correction" (16 pairs + 7 stragglers the user explicitly skips), 999 everything else. Simulates
    // both the LIVE release (fixing `confirmedTransferPairs`) and the COMMIT release (the first
    // regression's fix), then the real merge + duplicate/skip filter a write loop applies.
    const pairedIndices = Array.from({ length: 16 }, (_, i) => [i * 2, i * 2 + 1] as const);
    const stragglerIndices = Array.from({ length: 7 }, (_, i) => 32 + i);
    const otherIndices = Array.from({ length: 999 }, (_, i) => 39 + i);

    const liveActions = new Map<number, RowAction>();
    for (const [out, inc] of pairedIndices) {
      liveActions.set(out, { categoryId: '', categoryName: 'Balance Correction', skip: true });
      liveActions.set(inc, { categoryId: '', categoryName: 'Balance Correction', skip: true });
    }
    for (const i of stragglerIndices)
      liveActions.set(i, { categoryId: '', categoryName: 'Balance Correction', skip: true });
    for (const i of otherIndices) liveActions.set(i, { categoryId: 'cat-other', categoryName: 'Other' });

    const pairs: TransferPair[] = pairedIndices.map(([outgoingIndex, incomingIndex]) => ({
      outgoingIndex,
      incomingIndex,
      fromAccount: 'HDFC XX8112',
      toAccount: 'Cash',
      amount: 5000,
      date: 100
    }));

    // Step 1 (live layer fix): `confirmedTransferPairs`'s equivalent — a pair only counts as confirmed
    // if BOTH legs are not skipped in the (now correctly released) live actions.
    const releasedLive = releaseConfirmedPairsFromGroupSkip(liveActions, pairs, fallback);
    const confirmedPairs = pairs.filter(
      (p) => !releasedLive.get(p.outgoingIndex)?.skip && !releasedLive.get(p.incomingIndex)?.skip
    );
    expect(confirmedPairs).toHaveLength(16);

    // Step 2 (commit layer): rebuild a fresh, commit-shaped action map from scratch (mirrors
    // `finalRowActions` never reusing `rowActions`) and apply the SAME release using the now-correct
    // `confirmedPairs`.
    const commitActions = new Map<number, RowAction>(liveActions);
    const releasedCommit = releaseConfirmedPairsFromGroupSkip(commitActions, confirmedPairs, fallback);

    const allIndices = [...pairedIndices.flat(), ...stragglerIndices, ...otherIndices];
    const totalRows = allIndices.length;
    expect(totalRows).toBe(1038);

    const previewRows: ResolvedPreviewRow[] = allIndices.map((i) => {
      const action = releasedCommit.get(i);
      return {
        date: 100,
        amount: 5000,
        description: 'row',
        type: action?.type ?? 'expense',
        hashtags: [],
        categoryId: action?.categoryId ?? 'cat-other',
        categoryName: action?.categoryName ?? 'Other',
        accountId: i % 2 === 0 ? 'acc-hdfc' : 'acc-cash',
        skipped: !!action?.skip,
        duplicate: false,
        sourceRef: `ref-${i}`
      };
    });

    const merged = applyConfirmedTransferPairs(previewRows, confirmedPairs);
    const written = merged.filter((r) => !r.skipped && !r.duplicate);

    // 999 other-category rows + 16 MERGED transfer rows = 1015 written. The 7 stragglers stay excluded
    // (the user's own explicit choice — shown and actable-on, never silently imported either way).
    expect(written).toHaveLength(1015);
    expect(written.filter((r) => r.type === 'transfer')).toHaveLength(16);
    expect(merged.filter((r) => r.skipped)).toHaveLength(7);
  });

  it('end to end: a released pair action survives into a real merged type-transfer row via applyConfirmedTransferPairs', () => {
    // The full real chain this bug lived in: group loop force-skips → this function releases the
    // confirmed pair → `buildResolvedPreviewRowsByIndex`-shaped preview rows are no longer `skipped` →
    // `applyConfirmedTransferPairs` merges them into one real `type: 'transfer'` row that a write loop
    // filtering on `!row.skipped` will actually persist.
    const actions = new Map<number, RowAction>([
      [0, { categoryId: '', categoryName: 'Needs review — not yet resolved', skip: true }],
      [1, { categoryId: '', categoryName: 'Needs review — not yet resolved', skip: true }]
    ]);
    const pairs: TransferPair[] = [
      { outgoingIndex: 0, incomingIndex: 1, fromAccount: 'HDFC1234', toAccount: 'Cash', amount: 5000, date: 100 }
    ];
    const released = releaseConfirmedPairsFromGroupSkip(actions, pairs, fallback);

    // Simulate what `buildResolvedPreviewRowsByIndex` would now produce given the released actions —
    // `skipped: !!resolved?.skip` is the exact expression that function uses.
    const preview: ResolvedPreviewRow[] = [
      resolvedRow({ accountId: 'acc-hdfc', type: 'expense', skipped: !!released.get(0)?.skip }),
      resolvedRow({ accountId: 'acc-cash', type: 'income', sourceRef: 'ref-2', skipped: !!released.get(1)?.skip })
    ];
    expect(preview[0]?.skipped).toBe(false);
    expect(preview[1]?.skipped).toBe(false);

    const merged = applyConfirmedTransferPairs(preview, pairs);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: 'transfer',
      accountId: 'acc-hdfc',
      toAccountId: 'acc-cash',
      skipped: false
    });
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
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Map());
    expect(result[0]).toMatchObject({ type: 'transfer', categoryId: 'cat-tr-other', toAccountId: 'acc-cash' });
    expect(result[1]).toMatchObject({ type: 'income', categoryId: 'cat-salary' });
  });

  it('an override always wins over the row-action map entry', () => {
    const rows = [row()];
    const rowActions = new Map<number, RowAction>([[0, { categoryId: 'cat-other', categoryName: 'Other' }]]);
    const rowOverrides = new Map<number, RowOverride>([[0, { categoryId: 'cat-food', categoryName: 'Dining' }]]);
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Map(), rowOverrides);
    expect(result[0]).toMatchObject({ categoryId: 'cat-food', categoryName: 'Dining' });
  });

  it('marks duplicate against both existing DB keys and earlier rows in the same batch', () => {
    const rows = [row({ description: 'Same' }), row({ description: 'Same' })];
    const rowActions = new Map<number, RowAction>([
      [0, { categoryId: 'cat-food', categoryName: 'Food' }],
      [1, { categoryId: 'cat-food', categoryName: 'Food' }]
    ]);
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Map());
    expect(result[0]?.duplicate).toBe(false);
    expect(result[1]?.duplicate).toBe(true); // duplicate of the first row within this same batch
  });

  it('2026-08-16 fix: caps DB-match consumption at the real existing count, not unlimited Set membership', () => {
    // Two rows share a dedupKey, but differ in every OTHER field the same-batch check now looks at
    // (different category/payment mode/notes) — so they must NOT suppress each other as a "same file,
    // repeated line" (fix #2); only the DB's own real count (1 id) should explain either of them.
    const rows = [
      row({ description: 'Same', categoryName: 'Groceries', paymentMode: 'upi', notes: 'a' }),
      row({ description: 'Same', categoryName: 'Rent', paymentMode: 'cash', notes: 'b' })
    ];
    const rowActions = new Map<number, RowAction>([
      [0, { categoryId: 'cat-food', categoryName: 'Groceries' }],
      [1, { categoryId: 'cat-rent', categoryName: 'Rent' }]
    ]);
    const key = dedupKey(0, 100, 'same');
    // Only ONE real existing expense id shares this key — a plain Set would have flagged BOTH rows
    // (unconditional membership test); the id-list-based fix only lets one of them claim it.
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Map([[key, ['exp-1']]]));
    const duplicateCount = result.filter((r) => r.duplicate).length;
    expect(duplicateCount).toBe(1);
  });

  it('2026-08-16: the duplicate row carries the specific matched expense id, not just a boolean flag', () => {
    const rows = [row({ description: 'Same' })];
    const rowActions = new Map<number, RowAction>([[0, { categoryId: 'cat-food', categoryName: 'Groceries' }]]);
    const key = dedupKey(0, 100, 'same');
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Map([[key, ['exp-42']]]));
    expect(result[0]).toMatchObject({ duplicate: true, matchedExpenseId: 'exp-42' });
  });

  it('2026-08-16: a same-batch-only duplicate (no real DB match) never gets a matchedExpenseId', () => {
    // Two rows sharing the exact same signature in-file — a genuine "repeated line" duplicate, not a
    // DB match — the second is flagged duplicate but has no specific existing expense to point at.
    const rows = [row({ description: 'Same' }), row({ description: 'Same' })];
    const rowActions = new Map<number, RowAction>([
      [0, { categoryId: 'cat-food', categoryName: 'Food' }],
      [1, { categoryId: 'cat-food', categoryName: 'Food' }]
    ]);
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Map());
    expect(result[1]).toMatchObject({ duplicate: true });
    expect(result[1]?.matchedExpenseId).toBeUndefined();
  });

  it('2026-08-16 fix: same-batch matching requires a fuller row signature, not just date/amount/description', () => {
    // Two DIFFERENT real transactions coincidentally sharing date+amount+description (the day-precision-
    // collision case dedupKey's own doc comment measured) but differing in category — must NOT suppress
    // each other, since the bare 3-field key used to conflate them with a genuine same-file repeat.
    const rows = [
      row({ description: 'Same', categoryName: 'Groceries' }),
      row({ description: 'Same', categoryName: 'Rent' })
    ];
    const rowActions = new Map<number, RowAction>([
      [0, { categoryId: 'cat-food', categoryName: 'Groceries' }],
      [1, { categoryId: 'cat-rent', categoryName: 'Rent' }]
    ]);
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Map());
    expect(result[0]?.duplicate).toBe(false);
    expect(result[1]?.duplicate).toBe(false); // no longer falsely flagged as a repeat of row 0
  });

  it('a "skip" action marks the row skipped with an empty categoryId, falling back to "Other"', () => {
    const rows = [row()];
    const rowActions = new Map<number, RowAction>([[0, { categoryId: '', categoryName: 'A/c to A/c', skip: true }]]);
    const result = buildResolvedPreviewRowsByIndex(rows, rowActions, resolveAccountId, new Map());
    expect(result[0]).toMatchObject({ skipped: true, categoryName: 'A/c to A/c' });
  });

  it('falls back to cat-other/"Other" for a row with no action at all', () => {
    const rows = [row()];
    const result = buildResolvedPreviewRowsByIndex(rows, new Map(), resolveAccountId, new Map());
    expect(result[0]).toMatchObject({ categoryId: 'cat-other', categoryName: 'Other' });
  });
});
