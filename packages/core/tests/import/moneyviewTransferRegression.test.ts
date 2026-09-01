// Proof-of-coverage regression for item 73 (8th batch, real-device testing pass): the self-account-
// movement transfer-pairing/collapse mechanism (`detectSelfAccountMovementPairs` in
// importTransferPairing.ts → `applyConfirmedTransferPairs` in importPipeline.ts) is already generic,
// format-agnostic infrastructure — already proven for Cashew via `cashewTransferRegression.test.ts`. This
// file proves the exact same chain holds for a genuine MoneyView-shaped export (bank-name/account-type
// columns, a debit/credit split rather than a single signed amount), starting from the REAL
// `parseByFormat(text, 'moneyview')` parser (not hand-built `ParsedRow` objects) so the column-mapping
// layer itself is exercised too, not just the downstream pairing logic. Synthetic data only — shape
// matches the existing `packages/core/tests/fixtures/moneyview-may-synthetic.csv` fixture, no real
// personal data.
import { describe, expect, it } from 'vitest';
import { parseByFormat } from '@/core/import/importParsers';
import { detectSelfAccountMovementPairs } from '@/core/import/importTransferPairing';
import {
  resolveCategoriesDirectional,
  isDirectionalCategoryResolutionDecided,
  type DirectionalCategoryResolution
} from '@/core/import/importCategoryResolution';
import { applyConfirmedTransferPairs, type ResolvedPreviewRow } from '@/core/import/importPipeline';
import type { ExpenseCategory } from '@/core/db/types';

const categories: ExpenseCategory[] = [];

// Same MoneyView export column shape as `moneyview-may-synthetic.csv` (Date, Type, SubType, Txn Type,
// Payment Type, Merchant/Receiver/Sender, Category, Bank Name, Account Id, Account Type, Credit, Debit,
// Balance, Outstanding, Available Limit, Notes) — a genuine two-leg self-account transfer: ₹7,000
// withdrawn from "HDFC Savings" (debit leg) becoming cash in the user's own "Cash" account (credit leg),
// both legs sharing the "Cash Withdrawal" category MoneyView itself uses for an ATM withdrawal.
const MONEYVIEW_SELF_TRANSFER_CSV = [
  'Date,Type,SubType,Txn Type, Payment Type,Merchant/Receiver/Sender,Category,Bank Name,Account Id,Account Type,Credit,Debit,Balance,Outstanding,Available Limit,Notes',
  '2026/May/03 10:00:00,debit-transaction,expense,regular,atm,SELF,Cash Withdrawal,HDFC,HDFC Savings,bank,0,7000,0,0,0,null',
  '2026/May/03 10:05:00,credit-transaction,income,regular,atm,SELF,Cash Withdrawal,Cash,Cash,cash,7000,0,0,0,0,null'
].join('\n');

/** Mirrors `useImport.ts`'s `fullyAutoResolvedTransferKeys` computation, scoped to just this test. */
function fullyAutoResolvedKeys(
  resolutions: DirectionalCategoryResolution[],
  rowIndicesByKey: Map<string, number[]>,
  pairedIndices: Set<number>
): Set<string> {
  const result = new Set<string>();
  for (const r of resolutions) {
    if (r.suggestion.kind !== 'transfer' || r.suggestion.toAccountId) continue;
    const indices = rowIndicesByKey.get(r.key) ?? [];
    if (indices.length === 0) continue;
    if (indices.every((i) => pairedIndices.has(i))) result.add(r.key);
  }
  return result;
}

describe('MoneyView linked-transfer import — end-to-end regression (item 73)', () => {
  it('step 1: a real MoneyView export parses the two legs into distinct-account rows', () => {
    const { rows, rejected } = parseByFormat(MONEYVIEW_SELF_TRANSFER_CSV, 'moneyview');
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      type: 'expense',
      amount: 7000,
      account: 'HDFC Savings',
      categoryName: 'Cash Withdrawal'
    });
    expect(rows[1]).toMatchObject({ type: 'income', amount: 7000, account: 'Cash', categoryName: 'Cash Withdrawal' });
  });

  it('step 2: the two legs are detected as a confident self-account-movement transfer pair', () => {
    const { rows } = parseByFormat(MONEYVIEW_SELF_TRANSFER_CSV, 'moneyview');
    const pairs = detectSelfAccountMovementPairs(rows);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      outgoingIndex: 0,
      incomingIndex: 1,
      fromAccount: 'HDFC Savings',
      toAccount: 'Cash',
      amount: 7000
    });
  });

  it('step 3: the "Cash Withdrawal" category-resolution group defaults to a decidable transfer, not a stuck create', () => {
    const { rows } = parseByFormat(MONEYVIEW_SELF_TRANSFER_CSV, 'moneyview');
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
    const pairedIndices = new Set<number>();
    for (const p of pairs) {
      pairedIndices.add(p.outgoingIndex);
      pairedIndices.add(p.incomingIndex);
    }
    const autoResolved = fullyAutoResolvedKeys(resolutions, rowIndicesByKey, pairedIndices);
    expect(autoResolved).toEqual(new Set(['Cash Withdrawal::expense', 'Cash Withdrawal::income']));
    for (const r of resolutions) {
      expect(isDirectionalCategoryResolutionDecided(r, new Set(), autoResolved)).toBe(true);
    }
  });

  it('step 4: commits as exactly ONE real type: transfer row, never two separate expense/income rows', () => {
    const { rows } = parseByFormat(MONEYVIEW_SELF_TRANSFER_CSV, 'moneyview');
    const pairs = detectSelfAccountMovementPairs(rows);

    // Preview rows as `buildResolvedPreviewRowsByIndex` would produce them once both legs are correctly
    // `transactionsReady` (kind: 'transfer', never force-skipped) — mirrors
    // `cashewTransferRegression.test.ts`'s identical step 4, proving `applyConfirmedTransferPairs` merges
    // correctly given genuinely-ready MoneyView-shaped input.
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
      amount: 7000,
      accountId: 'acc-hdfc',
      toAccountId: 'acc-cash',
      skipped: false
    });
  });
});
