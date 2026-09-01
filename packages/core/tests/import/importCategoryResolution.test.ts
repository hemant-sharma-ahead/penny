import { describe, expect, it } from 'vitest';
import {
  isLikelyTransfer,
  isLikelyCarryForward,
  isLikelyIouSuspect,
  isLikelyInvestmentMovement,
  isLikelySelfAccountMovement,
  suggestIntentGroup,
  resolveCategories,
  resolveCategoriesDirectional,
  isCategoryResolutionDecided,
  isDirectionalCategoryResolutionDecided,
  draftCategoryKey,
  type CategoryResolution
} from '@/core/import/importCategoryResolution';
import type { ExpenseCategory } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';

describe('isLikelyTransfer', () => {
  it('flags real inter-account bookkeeping category names from the sample exports', () => {
    expect(isLikelyTransfer('Balance Correction')).toBe(true);
    expect(isLikelyTransfer('A/c to A/c')).toBe(true);
    expect(isLikelyTransfer('Cash In Hand')).toBe(true);
  });

  it('does not flag genuine spending categories', () => {
    expect(isLikelyTransfer('Groceries')).toBe(false);
    expect(isLikelyTransfer('Dining & Café')).toBe(false);
  });

  it('no longer flags "Cash Forward" — it is a carry-forward marker, not a two-sided transfer (2026-07-29 fix)', () => {
    expect(isLikelyTransfer('Cash Forward')).toBe(false);
  });
});

describe('isLikelyCarryForward', () => {
  it('flags carry-forward/continuity markers from real MoneyView exports', () => {
    expect(isLikelyCarryForward('Cash Forward')).toBe(true);
    expect(isLikelyCarryForward('Brought Forward')).toBe(true);
    expect(isLikelyCarryForward('Balance Brought Forward')).toBe(true);
    expect(isLikelyCarryForward('B/F')).toBe(true);
  });

  it('does not flag genuine spending categories or real transfers', () => {
    expect(isLikelyCarryForward('Groceries')).toBe(false);
    expect(isLikelyCarryForward('Balance Correction')).toBe(false);
  });
});

describe('suggestIntentGroup', () => {
  it('suggests a sensible group from keywords in real sample category names', () => {
    expect(suggestIntentGroup('Mutual fund investment')).toBe('financial');
    expect(suggestIntentGroup('Parents Medical Expenses')).toBe('health');
    expect(suggestIntentGroup('Jaipur Travel')).toBe('travel');
  });

  it('falls back to other for a name matching no keyword', () => {
    expect(suggestIntentGroup('Xyzzy')).toBe('other');
  });
});

const categories: ExpenseCategory[] = [
  { id: 'cat-food', name: 'Dining & Café', icon: 'ti-food', color: '#fff', isDefault: true, createdAt: 0 },
  { id: 'cat-other', name: 'Other', icon: 'ti-dots', color: '#fff', isDefault: true, createdAt: 0 }
];

function row(categoryName: string): ParsedRow {
  return { date: 0, amount: 1, description: 'x', categoryName, type: 'expense', hashtags: [] };
}

describe('resolveCategories', () => {
  it('groups by distinct source category name, most frequent first', () => {
    const rows = [row('Dining'), row('Dining'), row('Travel')];
    const result = resolveCategories(rows, categories);
    expect(result[0]?.sourceName).toBe('Dining');
    expect(result[0]?.count).toBe(2);
    expect(result[1]?.sourceName).toBe('Travel');
    expect(result[1]?.count).toBe(1);
  });

  it('suggests "existing" when the migration map resolves the name', () => {
    const result = resolveCategories([row('dining & cafe')], categories);
    expect(result[0]?.suggestion).toMatchObject({ kind: 'existing', categoryId: 'cat-food' });
  });

  it('suggests "transfer" for a transfer-like source category, never a silent cat-other match', () => {
    const result = resolveCategories([row('Balance Correction')], categories);
    expect(result[0]?.suggestion.kind).toBe('transfer');
  });

  it('no longer suggests "transfer" for "Cash Forward" — falls through to the normal "create" suggestion instead', () => {
    const result = resolveCategories([row('Cash Forward')], categories);
    expect(result[0]?.suggestion).toMatchObject({ kind: 'create', suggestedName: 'Cash Forward' });
  });

  it('suggests "create" (never a silent fallback) for a genuinely unrecognised category', () => {
    const result = resolveCategories([row('Some Random App-Specific Label')], categories);
    expect(result[0]?.suggestion).toMatchObject({ kind: 'create', suggestedName: 'Some Random App-Specific Label' });
  });
});

describe('isCategoryResolutionDecided', () => {
  it('"existing"/"skip" are decided from the start, regardless of touched sources', () => {
    const existing: CategoryResolution = {
      sourceName: 'Groceries',
      count: 1,
      suggestion: { kind: 'existing', categoryId: 'cat-food', categoryName: 'Food' }
    };
    const skip: CategoryResolution = { sourceName: 'A/c to A/c', count: 1, suggestion: { kind: 'skip' } };
    expect(isCategoryResolutionDecided(existing, new Set())).toBe(true);
    expect(isCategoryResolutionDecided(skip, new Set())).toBe(true);
  });

  it('"create" is only decided once its source name has been touched', () => {
    const create: CategoryResolution = {
      sourceName: 'Zomato',
      count: 1,
      suggestion: { kind: 'create', suggestedName: 'Zomato', suggestedIntentGroup: 'daily_living' }
    };
    expect(isCategoryResolutionDecided(create, new Set())).toBe(false);
    expect(isCategoryResolutionDecided(create, new Set(['Zomato']))).toBe(true);
  });

  it('"transfer" is undecided while toAccountId is blank', () => {
    const transfer: CategoryResolution = {
      sourceName: 'Balance Correction',
      count: 2,
      suggestion: { kind: 'transfer', categoryId: 'cat-tr-other', categoryName: 'Other Transfer', toAccountId: '' }
    };
    expect(isCategoryResolutionDecided(transfer, new Set())).toBe(false);
  });

  it('"transfer" is decided once toAccountId is picked', () => {
    const transfer: CategoryResolution = {
      sourceName: 'Balance Correction',
      count: 2,
      suggestion: { kind: 'transfer', categoryId: 'cat-tr-other', categoryName: 'Other Transfer', toAccountId: 'acc-1' }
    };
    expect(isCategoryResolutionDecided(transfer, new Set())).toBe(true);
  });

  it('a blank-toAccountId "transfer" is ALSO decided when every one of its rows is already fully auto-resolved (2026-08-13 fix)', () => {
    const transfer: CategoryResolution = {
      sourceName: 'Self Transfer',
      count: 2,
      suggestion: { kind: 'transfer', categoryId: 'cat-tr-other', categoryName: 'Other Transfer', toAccountId: '' }
    };
    expect(isCategoryResolutionDecided(transfer, new Set(), new Set(['Self Transfer']))).toBe(true);
    // Without the source name in the auto-resolved set, still undecided — the set must be checked
    // by exact sourceName, not just "some set was passed".
    expect(isCategoryResolutionDecided(transfer, new Set(), new Set(['Some Other Category']))).toBe(false);
  });
});

// ─── Direction-aware resolution + IOU/investment keyword flags (2026-08-14, CSV-import redesign) ────

describe('isLikelyIouSuspect', () => {
  it('flags lend/borrow-style category names', () => {
    expect(isLikelyIouSuspect('Loan')).toBe(true);
    expect(isLikelyIouSuspect('Personal Loan Repayment')).toBe(true);
    expect(isLikelyIouSuspect('Money Lent')).toBe(true);
    expect(isLikelyIouSuspect('Amount Borrowed')).toBe(true);
  });

  it('does not flag genuine spending or plain transfer categories', () => {
    expect(isLikelyIouSuspect('Groceries')).toBe(false);
    expect(isLikelyIouSuspect('Balance Correction')).toBe(false);
  });
});

describe('isLikelyInvestmentMovement', () => {
  it('flags investment-movement category names from the real sample file (redesign doc §9.d)', () => {
    expect(isLikelyInvestmentMovement('Investments')).toBe(true);
    expect(isLikelyInvestmentMovement('Mutual Funds')).toBe(true);
    expect(isLikelyInvestmentMovement('Stocks')).toBe(true);
  });

  it('does not flag genuine spending categories', () => {
    expect(isLikelyInvestmentMovement('Groceries')).toBe(false);
  });
});

function directionalRow(categoryName: string, type: ParsedRow['type'] = 'expense'): ParsedRow {
  return { date: 0, amount: 1, description: 'x', categoryName, type, hashtags: [] };
}

describe('resolveCategoriesDirectional', () => {
  it('produces two INDEPENDENT resolution objects for the same source name split by direction (Issue #5 regression)', () => {
    const rows = [
      directionalRow('A/c to A/c', 'expense'),
      directionalRow('A/c to A/c', 'expense'),
      directionalRow('A/c to A/c', 'income')
    ];
    const result = resolveCategoriesDirectional(rows, categories);
    const expenseSide = result.find((r) => r.key === 'A/c to A/c::expense');
    const incomeSide = result.find((r) => r.key === 'A/c to A/c::income');
    expect(expenseSide).toBeDefined();
    expect(incomeSide).toBeDefined();
    expect(expenseSide?.count).toBe(2);
    expect(incomeSide?.count).toBe(1);

    // The real regression: mutating one direction's resolution object must NEVER affect the other —
    // they must be genuinely distinct object references, not one shared resolution read by both tiles.
    expect(expenseSide).not.toBe(incomeSide);
    if (!expenseSide) throw new Error('expenseSide must be defined');
    const mutated = { ...expenseSide, suggestion: { kind: 'skip' as const } };
    expect(mutated.suggestion.kind).toBe('skip');
    expect(incomeSide?.suggestion.kind).not.toBe('skip');
  });

  it('keys by `${sourceName}::${type}` and flags transfer/IOU/investment suspects', () => {
    const result = resolveCategoriesDirectional(
      [directionalRow('Loan', 'expense'), directionalRow('Mutual Funds', 'expense'), directionalRow('Groceries')],
      categories
    );
    const loan = result.find((r) => r.sourceName === 'Loan');
    const mf = result.find((r) => r.sourceName === 'Mutual Funds');
    const groceries = result.find((r) => r.sourceName === 'Groceries');
    expect(loan?.isIouSuspect).toBe(true);
    expect(loan?.suggestion.kind).toBe('transfer');
    expect(mf?.isInvestmentMovement).toBe(true);
    expect(mf?.suggestion.kind).toBe('transfer');
    expect(groceries?.isTransferSuspect).toBe(false);
    expect(groceries?.isIouSuspect).toBe(false);
    expect(groceries?.isInvestmentMovement).toBe(false);
  });

  it('defaults a self-account-movement category (e.g. Cashew "Cash Withdrawal") to kind: transfer, not create (2026-08-22 regression fix)', () => {
    // Real root-cause bug: `isLikelySelfAccountMovement` (used by `detectSelfAccountMovementPairs` to
    // PAIR a cash-withdrawal/wallet-recharge/CC-bill-payment row) was never wired into this function's
    // own default-suggestion logic, so a source category made ENTIRELY of confidently-paired rows could
    // default to `kind: 'create'` and then never become `transactionsReady` (its tile has zero rows to
    // show once every row is excluded for being part of a pair — nothing left to "touch"), silently
    // force-skipping both legs of every pair at commit. `kind: 'transfer'` here is what lets
    // `fullyAutoResolvedTransferKeys`/`isDirectionalCategoryResolutionDecided` mark the group decided
    // once every row is confirmed-paired, exactly like a `TRANSFER_KEYWORDS` category already could.
    const result = resolveCategoriesDirectional(
      [
        directionalRow('Cash Withdrawal', 'expense'),
        directionalRow('Credit Card Bill Payment', 'expense'),
        directionalRow('Wallet Recharge', 'expense')
      ],
      categories
    );
    const cashWithdrawal = result.find((r) => r.sourceName === 'Cash Withdrawal');
    const ccBill = result.find((r) => r.sourceName === 'Credit Card Bill Payment');
    const walletRecharge = result.find((r) => r.sourceName === 'Wallet Recharge');
    expect(cashWithdrawal?.suggestion.kind).toBe('transfer');
    expect(ccBill?.suggestion.kind).toBe('transfer');
    expect(walletRecharge?.suggestion.kind).toBe('transfer');
    // Never flagged as `isTransferSuspect`/`isIouSuspect` — those flags gate the person-to-person
    // counterparty UI (`CategoryTile`'s `showCounterparty`), which a self-account movement is not.
    expect(cashWithdrawal?.isTransferSuspect).toBe(false);
    expect(cashWithdrawal?.isIouSuspect).toBe(false);
  });

  it('still suggests "create" for a genuine spending category that merely shares a substring with a keyword', () => {
    const result = resolveCategoriesDirectional([directionalRow('Card Payment Reminder Fee', 'expense')], categories);
    // Deliberately NOT asserting a specific kind here beyond confirming self-account-movement keyword
    // matching doesn't accidentally widen — "card bill payment"/"cc bill" are substring matches, so this
    // guards against a keyword list broad enough to misfire on unrelated categories in future edits.
    expect(isLikelySelfAccountMovement('Card Payment Reminder Fee')).toBe(false);
    expect(result[0]?.suggestion.kind).toBe('create');
  });
});

describe('isDirectionalCategoryResolutionDecided', () => {
  it('tracks touched state by the full key, not by sourceName alone', () => {
    const result = resolveCategoriesDirectional(
      [directionalRow('Zomato Guess', 'expense'), directionalRow('Zomato Guess', 'income')],
      categories
    );
    const expenseSide = result.find((r) => r.key === 'Zomato Guess::expense');
    const incomeSide = result.find((r) => r.key === 'Zomato Guess::income');
    if (!expenseSide || !incomeSide) throw new Error('both directions must be present');
    const touched = new Set([expenseSide.key]);
    expect(isDirectionalCategoryResolutionDecided(expenseSide, touched)).toBe(true);
    // Touching the expense-direction key must NOT mark the income-direction sibling decided too.
    expect(isDirectionalCategoryResolutionDecided(incomeSide, touched)).toBe(false);
  });
});

describe('draftCategoryKey', () => {
  it('collapses two "create" suggestions with the same name+group into one key', () => {
    const a = draftCategoryKey({ kind: 'create', suggestedName: 'Lending', suggestedIntentGroup: 'family_giving' });
    const b = draftCategoryKey({ kind: 'create', suggestedName: '  lending  ', suggestedIntentGroup: 'family_giving' });
    expect(a).toBe(b);
  });

  it('treats a different suggested name or group as a distinct key', () => {
    const lending = draftCategoryKey({
      kind: 'create',
      suggestedName: 'Lending',
      suggestedIntentGroup: 'family_giving'
    });
    const otherName = draftCategoryKey({
      kind: 'create',
      suggestedName: 'Borrowing',
      suggestedIntentGroup: 'family_giving'
    });
    const otherGroup = draftCategoryKey({ kind: 'create', suggestedName: 'Lending', suggestedIntentGroup: 'other' });
    expect(lending).not.toBe(otherName);
    expect(lending).not.toBe(otherGroup);
  });
});
