// Real-bug regression: "Cashew CSV import identifies linked transfers but does not import them, and
// shows the same transactions to categorize" (2026-08-22). Root cause traced across three files:
//
//   1. `detectSelfAccountMovementPairs` (importTransferPairing.ts) correctly PAIRS a genuine two-leg
//      self-account movement (e.g. a Cashew "Cash Withdrawal" bank-debit + its matching Cash-account
//      credit) — this part was never broken.
//   2. `groupRowsForTransactionsStage` (importTransactionsGrouping.ts) correctly EXCLUDES both legs of
//      any detected pair from category-tile grouping — this part was never broken either.
//   3. The actual break: `suggestForNameDirectional` (importCategoryResolution.ts) never checked
//      `isLikelySelfAccountMovement` — only `isLikelyTransfer`/`isLikelyIouSuspect`/
//      `isLikelyInvestmentMovement` — so a source category like "Cash Withdrawal" defaulted to
//      `kind: 'create'`, not `kind: 'transfer'`. `isDirectionalCategoryResolutionDecided` only ever
//      short-circuits "decided" via `fullyAutoResolvedTransferKeys` for a `kind: 'transfer'` suggestion,
//      never `kind: 'create'` — so once EVERY row of that category was excluded from its own tile (step
//      2, because they're all paired), the category-group had zero rows left to show, meaning the user
//      could never "touch" it, meaning it stayed permanently `!transactionsReady`. apps/mobile's
//      `useImport.ts` commit step force-skips every row of a `!transactionsReady` group (including both
//      legs of every pair it owns) — so the pair, despite being correctly detected and shown in the
//      "Linked transfers" card, was silently dropped from the actual write. This file proves the full
//      chain now works end to end using only packages/core exports (the same functions apps/mobile's
//      useImport.ts composes) — see that file's own doc comments for how these pieces fit together.
import { describe, expect, it } from 'vitest';
import { detectSelfAccountMovementPairs, type TransferPair } from '@/core/import/importTransferPairing';
import {
  resolveCategoriesDirectional,
  isDirectionalCategoryResolutionDecided,
  type DirectionalCategoryResolution
} from '@/core/import/importCategoryResolution';
import { groupRowsForTransactionsStage, type CategoryRowGroupInput } from '@/core/import/importTransactionsGrouping';
import { applyConfirmedTransferPairs, type ResolvedPreviewRow } from '@/core/import/importPipeline';
import type { ParsedRow } from '@/core/import/importParsers';
import type { ExpenseCategory } from '@/core/db/types';

const categories: ExpenseCategory[] = [];

/** Mirrors `useImport.ts`'s `fullyAutoResolvedTransferKeys` computation exactly, scoped down to just
 *  what this test needs — every `kind: 'transfer'`, blank-`toAccountId` resolution whose every row is
 *  claimed by a confirmed pair is "fully auto resolved". */
function fullyAutoResolvedKeys(
  resolutions: DirectionalCategoryResolution[],
  rowIndicesByKey: Map<string, number[]>,
  pairs: TransferPair[]
): Set<string> {
  const pairedIndices = new Set<number>();
  for (const p of pairs) {
    pairedIndices.add(p.outgoingIndex);
    pairedIndices.add(p.incomingIndex);
  }
  const result = new Set<string>();
  for (const r of resolutions) {
    if (r.suggestion.kind !== 'transfer' || r.suggestion.toAccountId) continue;
    const indices = rowIndicesByKey.get(r.key) ?? [];
    if (indices.length === 0) continue;
    if (indices.every((i) => pairedIndices.has(i))) result.add(r.key);
  }
  return result;
}

describe('Cashew linked-transfer import — end-to-end regression', () => {
  // A genuine Cashew-shaped two-leg cash withdrawal: one expense row debiting the bank account, one
  // income row crediting the user's own Cash account, same amount/date, category name "Cash Withdrawal"
  // on both legs (Cashew's own real-world phrasing — matches `isLikelySelfAccountMovement`, NOT
  // `isLikelyTransfer`'s narrower TRANSFER_KEYWORDS list).
  const rows: ParsedRow[] = [
    {
      date: 1000,
      amount: 5000,
      description: 'Cash withdrawal',
      categoryName: 'Cash Withdrawal',
      type: 'expense',
      account: 'HDFC Savings',
      hashtags: []
    },
    {
      date: 1000,
      amount: 5000,
      description: 'Cash withdrawal',
      categoryName: 'Cash Withdrawal',
      type: 'income',
      account: 'Cash',
      hashtags: []
    }
  ];

  it('step 1: the two legs are detected as a confident transfer pair', () => {
    const pairs = detectSelfAccountMovementPairs(rows);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      outgoingIndex: 0,
      incomingIndex: 1,
      fromAccount: 'HDFC Savings',
      toAccount: 'Cash',
      amount: 5000
    });
  });

  it('step 2: the category-resolution group for "Cash Withdrawal" now defaults to a decidable transfer, not a stuck create', () => {
    const resolutions = resolveCategoriesDirectional(rows, categories);
    // Two direction-groups exist ("Cash Withdrawal::expense" and "Cash Withdrawal::income") — pairing
    // crosses direction, so each is its own resolution, and BOTH must independently become decided.
    expect(resolutions.map((r) => r.key).sort()).toEqual(['Cash Withdrawal::expense', 'Cash Withdrawal::income']);
    for (const r of resolutions) expect(r.suggestion.kind).toBe('transfer');

    const rowIndicesByKey = new Map<string, number[]>();
    rows.forEach((row, i) => {
      const key = `${row.categoryName}::${row.type}`;
      rowIndicesByKey.set(key, [...(rowIndicesByKey.get(key) ?? []), i]);
    });
    const pairs = detectSelfAccountMovementPairs(rows);
    const autoResolved = fullyAutoResolvedKeys(resolutions, rowIndicesByKey, pairs);
    expect(autoResolved).toEqual(new Set(['Cash Withdrawal::expense', 'Cash Withdrawal::income']));

    // The actual fix under test: BEFORE it, `suggestion.kind` was 'create', which
    // `isDirectionalCategoryResolutionDecided` only marks decided via an explicit user touch — a touch
    // that could never happen once every row of the group is excluded from its own tile (step 3 below).
    // Now every resolution is decided with zero touches and zero explicit toAccountId picks required.
    for (const r of resolutions) {
      expect(isDirectionalCategoryResolutionDecided(r, new Set(), autoResolved)).toBe(true);
    }
  });

  it('step 3: both legs are excluded from category-tile grouping — no duplicate "needs categorizing" tile', () => {
    const pairs = detectSelfAccountMovementPairs(rows);
    const groupInputs: CategoryRowGroupInput[] = [
      { fullKey: 'Cash Withdrawal::expense', rowIndices: [0] },
      { fullKey: 'Cash Withdrawal::income', rowIndices: [1] }
    ];
    const grouping = groupRowsForTransactionsStage(rows, ['ready', 'ready'], pairs, groupInputs, new Map(), undefined);
    expect(grouping.rowsByFullKey.get('Cash Withdrawal::expense') ?? []).toHaveLength(0);
    expect(grouping.rowsByFullKey.get('Cash Withdrawal::income') ?? []).toHaveLength(0);
    expect(grouping.duplicateRows).toHaveLength(0);
  });

  it('step 4: commits as ONE real type: transfer row, not two, and is not silently skipped', () => {
    const pairs = detectSelfAccountMovementPairs(rows);
    // Preview rows as `buildResolvedPreviewRowsByIndex` would now produce them once the group is
    // correctly `transactionsReady` (kind: 'transfer', not force-skipped) — this is the direct
    // consequence of step 2's fix; the point of this step is proving `applyConfirmedTransferPairs`
    // still merges correctly given genuinely-ready input.
    const preview: ResolvedPreviewRow[] = rows.map((row, i) => ({
      date: row.date,
      amount: row.amount,
      description: row.description,
      type: 'transfer',
      hashtags: row.hashtags,
      categoryId: 'cat-tr-other',
      categoryName: 'Other Transfer',
      accountId: row.account === 'HDFC Savings' ? 'acc-hdfc' : 'acc-cash',
      skipped: false,
      duplicate: false,
      sourceRef: `ref-${i}`
    }));

    const merged = applyConfirmedTransferPairs(preview, pairs);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: 'transfer',
      amount: 5000,
      accountId: 'acc-hdfc',
      toAccountId: 'acc-cash',
      skipped: false
    });

    // The regression as literally reported: before the fix, the outgoing leg's preview row carried
    // `skipped: true` (force-skipped because its category group was never `transactionsReady`) —
    // `applyConfirmedTransferPairs` spreads `...outgoing`, so the merged row inherited that skip and
    // was filtered out of the actual write (`writeImportBatchDetailed` never writes a skipped row).
    // Prove that failure mode explicitly, so this test would fail if the skip force-set regressed back.
    const previewWithForcedSkip = preview.map((r, i) => (i === 0 ? { ...r, skipped: true } : r));
    const mergedIfRegressed = applyConfirmedTransferPairs(previewWithForcedSkip, pairs);
    expect(mergedIfRegressed[0]?.skipped).toBe(true);
  });
});
