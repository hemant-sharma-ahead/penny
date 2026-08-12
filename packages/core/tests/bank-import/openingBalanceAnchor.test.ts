import { describe, expect, it } from 'vitest';
import {
  backDerivedOpeningBalance,
  computeAnchorShiftCheck,
  currentAnchorDate,
  deriveOpeningBalanceSuggestion,
  isAnchorShiftImport,
  isFirstEverImport,
  recomputeAnchorAgreement,
  rowsAsCandidateTxns,
  type AnchorReference
} from '@/core/bank-import/openingBalanceAnchor';
import type { CandidateTxn } from '@/core/accounts/balanceCalculator';
import type { Account, Expense } from '@/core/db/types';
import type { ParsedStatementRow } from '@/core/bank-import/types';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();
const ACCOUNT = 'acc-1';

function row(overrides: Partial<ParsedStatementRow> = {}): ParsedStatementRow {
  return {
    rawNarration: 'UPI-SWIGGY-123',
    date: d(2026, 4, 1),
    amount: 450,
    direction: 'debit',
    rowIndex: 1,
    ...overrides
  };
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: ACCOUNT,
    name: 'HDFC Savings',
    type: 'bank',
    openingBalance: 50_000,
    color: '#000',
    icon: 'ti-building-bank',
    includeInNetWorth: true,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

// ── isFirstEverImport ────────────────────────────────────────────────────────

describe('isFirstEverImport (§10a)', () => {
  it('is true when coveredStatementRanges is empty or absent', () => {
    expect(isFirstEverImport(undefined)).toBe(true);
    expect(isFirstEverImport([])).toBe(true);
  });

  it('is false once at least one batch has ever completed', () => {
    expect(isFirstEverImport([{ start: d(2026, 1, 1), end: d(2026, 1, 31) }])).toBe(false);
  });
});

// ── currentAnchorDate ────────────────────────────────────────────────────────

describe('currentAnchorDate (§3 decision #10/§14)', () => {
  it('prefers the explicit openingBalanceAsOfDate when set', () => {
    const acc = account({
      openingBalanceAsOfDate: d(2024, 1, 1),
      coveredStatementRanges: [{ start: d(2024, 4, 1), end: d(2024, 4, 30) }]
    });
    expect(currentAnchorDate(acc)).toBe(d(2024, 1, 1));
  });

  it('falls back to the earliest covered range start when unset (implicit anchor)', () => {
    const acc = account({
      coveredStatementRanges: [
        { start: d(2024, 4, 1), end: d(2024, 4, 30) },
        { start: d(2024, 2, 1), end: d(2024, 2, 29) }
      ]
    });
    expect(currentAnchorDate(acc)).toBe(d(2024, 2, 1));
  });

  it('is undefined for a first-ever-import account (nothing to anchor to yet)', () => {
    expect(currentAnchorDate(account())).toBeUndefined();
  });
});

// ── isAnchorShiftImport ──────────────────────────────────────────────────────

describe('isAnchorShiftImport (§14 trigger)', () => {
  it('triggers when the new range starts before an explicit openingBalanceAsOfDate', () => {
    const acc = account({
      openingBalanceAsOfDate: d(2024, 1, 1),
      coveredStatementRanges: [{ start: d(2024, 1, 1), end: d(2024, 12, 31) }]
    });
    expect(isAnchorShiftImport(d(2022, 1, 1), acc)).toBe(true);
  });

  it('triggers using the earliest covered range start when openingBalanceAsOfDate is unset', () => {
    const acc = account({ coveredStatementRanges: [{ start: d(2024, 1, 1), end: d(2024, 12, 31) }] });
    expect(isAnchorShiftImport(d(2022, 1, 1), acc)).toBe(true);
  });

  it('does not trigger when the new range starts at or after the current anchor', () => {
    const acc = account({
      openingBalanceAsOfDate: d(2024, 1, 1),
      coveredStatementRanges: [{ start: d(2024, 1, 1), end: d(2024, 12, 31) }]
    });
    expect(isAnchorShiftImport(d(2024, 1, 1), acc)).toBe(false);
    expect(isAnchorShiftImport(d(2024, 6, 1), acc)).toBe(false);
  });

  it('never triggers for a first-ever-import account (mutually exclusive with isFirstEverImport)', () => {
    expect(isAnchorShiftImport(d(2020, 1, 1), account())).toBe(false);
  });
});

// ── deriveOpeningBalanceSuggestion ───────────────────────────────────────────

describe('deriveOpeningBalanceSuggestion (§5 opening-balance capture)', () => {
  it('derives the implied opening balance from the chronologically-first row with a balance value', () => {
    const rows = [
      row({ rowIndex: 2, date: d(2026, 4, 2), amount: 100, direction: 'credit', balance: 51_100 }),
      row({ rowIndex: 1, date: d(2026, 4, 1), amount: 1_000, direction: 'debit', balance: 49_000 })
    ];
    const suggestion = deriveOpeningBalanceSuggestion(rows);
    // balance-after (49,000) = openingBefore - 1,000 (debit) => openingBefore = 50,000
    expect(suggestion).toEqual({ suggestedOpeningBalance: 50_000, asOfDate: d(2026, 4, 1) });
  });

  it('derives correctly for a credit first row too', () => {
    const rows = [row({ amount: 2_000, direction: 'credit', balance: 52_000 })];
    // balance-after (52,000) = openingBefore + 2,000 (credit) => openingBefore = 50,000
    expect(deriveOpeningBalanceSuggestion(rows)?.suggestedOpeningBalance).toBe(50_000);
  });

  it("breaks ties on the same calendar day by the file's own row order (rowIndex)", () => {
    const rows = [
      row({ rowIndex: 5, date: d(2026, 4, 1), amount: 100, direction: 'debit', balance: 9_900 }),
      row({ rowIndex: 2, date: d(2026, 4, 1), amount: 500, direction: 'debit', balance: 9_500 })
    ];
    // The rowIndex-2 row is treated as first: openingBefore = 9,500 + 500 = 10,000
    expect(deriveOpeningBalanceSuggestion(rows)?.suggestedOpeningBalance).toBe(10_000);
  });

  it('returns undefined when no balance column was mapped (no row carries a value)', () => {
    const rows = [row({ balance: undefined }), row({ rowIndex: 2, balance: undefined })];
    expect(deriveOpeningBalanceSuggestion(rows)).toBeUndefined();
  });

  it('returns undefined for an empty row set', () => {
    expect(deriveOpeningBalanceSuggestion([])).toBeUndefined();
  });
});

// ── rowsAsCandidateTxns ──────────────────────────────────────────────────────

describe('rowsAsCandidateTxns', () => {
  it('maps debit rows to expense and credit rows to income, on the given account', () => {
    const rows = [row({ direction: 'debit', amount: 100 }), row({ direction: 'credit', amount: 200 })];
    const candidates: CandidateTxn[] = rowsAsCandidateTxns(rows, ACCOUNT);
    expect(candidates).toEqual([
      { accountId: ACCOUNT, amount: 100, type: 'expense' },
      { accountId: ACCOUNT, amount: 200, type: 'income' }
    ]);
  });
});

// ── computeAnchorShiftCheck — the exact §14a/§14b simulation numbers ────────

describe('computeAnchorShiftCheck (§14a clean case, §14b disagreement)', () => {
  it('§14a: agrees when the new anchor + in-between activity lands exactly back on the old anchor', () => {
    // Old anchor: ₹50,000 as of 1-Jan-2024 (never itself statement-verified).
    // New anchor: ₹20,000 as of 1-Jan-2022, with 2022-2023 activity netting +30,000.
    const txns: CandidateTxn[] = [
      { accountId: ACCOUNT, amount: 40_000, type: 'income' },
      { accountId: ACCOUNT, amount: 10_000, type: 'expense' }
    ];
    const result = computeAnchorShiftCheck(ACCOUNT, 20_000, d(2022, 1, 1), 50_000, d(2024, 1, 1), txns);
    expect(result.impliedOldBalance).toBe(50_000);
    expect(result.diff).toBe(0);
    expect(result.agrees).toBe(true);
  });

  it('§14b: disagrees by exactly ₹2,000 when the backfill implies a different old-anchor balance', () => {
    // Same shape, but 2022-2023 activity nets +32,000 instead of +30,000 — implies old anchor should
    // have been ₹52,000, not the ₹50,000 it was set up with.
    const txns: CandidateTxn[] = [
      { accountId: ACCOUNT, amount: 42_000, type: 'income' },
      { accountId: ACCOUNT, amount: 10_000, type: 'expense' }
    ];
    const result = computeAnchorShiftCheck(ACCOUNT, 20_000, d(2022, 1, 1), 50_000, d(2024, 1, 1), txns);
    expect(result.impliedOldBalance).toBe(52_000);
    expect(result.diff).toBe(2_000);
    expect(result.agrees).toBe(false);
  });

  it('treats a sub-₹1 rounding difference as agreeing (tolerance convention matches balanceCheck.ts)', () => {
    const txns: CandidateTxn[] = [{ accountId: ACCOUNT, amount: 30_000.5, type: 'income' }];
    const result = computeAnchorShiftCheck(ACCOUNT, 20_000, d(2022, 1, 1), 50_000.5, d(2024, 1, 1), txns);
    expect(result.agrees).toBe(true);
  });

  it("ignores transactions on unrelated accounts, via delta()'s own accountId filter", () => {
    const txns: CandidateTxn[] = [
      { accountId: ACCOUNT, amount: 30_000, type: 'income' },
      { accountId: 'other-account', amount: 999_999, type: 'income' }
    ];
    const result = computeAnchorShiftCheck(ACCOUNT, 20_000, d(2022, 1, 1), 50_000, d(2024, 1, 1), txns);
    expect(result.agrees).toBe(true);
  });
});

// ── backDerivedOpeningBalance ────────────────────────────────────────────────

describe('backDerivedOpeningBalance (§14b "Keep the original, flag for later")', () => {
  it('back-derives the new-anchor value that reproduces the OLD, still-trusted anchor exactly', () => {
    // Same §14b fixture as above: backfill nets +32,000, implying the old 1-Jan-2024 anchor should have
    // been ₹52,000 (not the ₹50,000 it was set up with) — a ₹2,000 disagreement. Trusting the OLD anchor
    // instead of the backfill means using 20,000 - 2,000 = 18,000 as the account's real new-anchor value,
    // so projecting forward through the SAME window reproduces exactly ₹50,000 at 1-Jan-2024.
    const check = computeAnchorShiftCheck(ACCOUNT, 20_000, d(2022, 1, 1), 50_000, d(2024, 1, 1), [
      { accountId: ACCOUNT, amount: 42_000, type: 'income' },
      { accountId: ACCOUNT, amount: 10_000, type: 'expense' }
    ]);
    expect(backDerivedOpeningBalance(check)).toBe(18_000);
  });

  it("is a no-op (returns the backfill's own newOpeningBalance unchanged) when there was no disagreement to begin with", () => {
    const check = computeAnchorShiftCheck(ACCOUNT, 20_000, d(2022, 1, 1), 50_000, d(2024, 1, 1), [
      { accountId: ACCOUNT, amount: 40_000, type: 'income' },
      { accountId: ACCOUNT, amount: 10_000, type: 'expense' }
    ]);
    expect(backDerivedOpeningBalance(check)).toBe(20_000);
  });
});

// ── recomputeAnchorAgreement ─────────────────────────────────────────────────

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e',
    amount: 0,
    categoryId: 'cat',
    description: '',
    date: d(2022, 6, 1),
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    accountId: ACCOUNT,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe('recomputeAnchorAgreement (the LIVE re-check, 2026-08-09 — fixes the "frozen forever" bug)', () => {
  const NEW_ANCHOR_DATE = d(2022, 1, 1);
  // `newOpeningBalance` lives on `REFERENCE` (not passed separately) since the second bug fix,
  // 2026-08-09 — see `recomputeAnchorAgreement`'s own doc comment: it must be the backfill's OWN
  // un-back-derived claim, never the account's own (back-derived) `openingBalance`, or the check becomes
  // tautologically always-agreeing.
  const REFERENCE: AnchorReference = {
    oldOpeningBalance: 50_000,
    oldAnchorDate: d(2024, 1, 1),
    newOpeningBalance: 20_000,
    detectedAt: d(2024, 1, 2)
  };

  it('reproduces the exact §14b disagreement numbers, windowing real Expense[] by date the same way computeAnchorShiftCheck expects', () => {
    const accountTxns: Expense[] = [
      expense({ id: 'a', type: 'income', amount: 42_000, date: d(2022, 6, 1) }),
      expense({ id: 'b', type: 'expense', amount: 10_000, date: d(2023, 6, 1) })
    ];
    const result = recomputeAnchorAgreement(ACCOUNT, NEW_ANCHOR_DATE, REFERENCE, accountTxns);
    expect(result.impliedOldBalance).toBe(52_000);
    expect(result.diff).toBe(2_000);
    expect(result.agrees).toBe(false);
  });

  it('excludes transactions outside [newAnchorDate, oldAnchorDate) — new-anchor-date inclusive, old-anchor-date exclusive', () => {
    const accountTxns: Expense[] = [
      expense({ id: 'too-early', type: 'income', amount: 999_999, date: d(2021, 1, 1) }),
      expense({ id: 'in-window', type: 'income', amount: 30_000, date: d(2022, 6, 1) }),
      expense({ id: 'exactly-on-old-anchor', type: 'income', amount: 999_999, date: d(2024, 1, 1) }),
      expense({ id: 'too-late', type: 'income', amount: 999_999, date: d(2024, 6, 1) })
    ];
    const result = recomputeAnchorAgreement(ACCOUNT, NEW_ANCHOR_DATE, REFERENCE, accountTxns);
    expect(result.impliedOldBalance).toBe(50_000); // 20,000 + 30,000 only
    expect(result.agrees).toBe(true);
  });

  it('ignores transactions on unrelated accounts', () => {
    const accountTxns: Expense[] = [
      expense({ id: 'a', type: 'income', amount: 30_000, date: d(2022, 6, 1) }),
      expense({ id: 'other', type: 'income', amount: 999_999, date: d(2022, 6, 1), accountId: 'other-account' })
    ];
    const result = recomputeAnchorAgreement(ACCOUNT, NEW_ANCHOR_DATE, REFERENCE, accountTxns);
    expect(result.agrees).toBe(true);
  });

  it('returns agrees: true once a corrective transaction fixes the ledger — the exact on-device bug this closes (a frozen, pre-fix `anchorDisagreement` would never notice this)', () => {
    const accountTxns: Expense[] = [
      expense({ id: 'a', type: 'income', amount: 42_000, date: d(2022, 6, 1) }),
      expense({ id: 'b', type: 'expense', amount: 10_000, date: d(2023, 6, 1) }),
      // A later corrective import/edit fixing the exact ₹2,000 overstatement.
      expense({ id: 'correction', type: 'expense', amount: 2_000, date: d(2023, 7, 1) })
    ];
    const result = recomputeAnchorAgreement(ACCOUNT, NEW_ANCHOR_DATE, REFERENCE, accountTxns);
    expect(result.impliedOldBalance).toBe(50_000);
    expect(result.agrees).toBe(true);
  });

  it('does NOT tautologically agree when fed the account\'s own back-derived openingBalance instead of the reference\'s newOpeningBalance — the exact second bug, found on-device 2026-08-09: "Keep, flag" showed verified immediately, every time, regardless of the real disagreement size', () => {
    // Mirrors the real repro: back-derive what `useBankImport.ts` would have written as `Account.
    // openingBalance` (18,000 — calibrated to reproduce the OLD anchor exactly through THIS SAME window),
    // and confirm that feeding IT ANYWHERE as the reference's own claim (as the pre-fix signature
    // effectively did) would wrongly agree — proving the fix's `newOpeningBalance` (20,000, the
    // backfill's real, un-back-derived claim) is what makes this correctly disagree instead.
    const accountTxns: Expense[] = [
      expense({ id: 'a', type: 'income', amount: 42_000, date: d(2022, 6, 1) }),
      expense({ id: 'b', type: 'expense', amount: 10_000, date: d(2023, 6, 1) })
    ];
    const backDerived = backDerivedOpeningBalance(
      computeAnchorShiftCheck(ACCOUNT, 20_000, NEW_ANCHOR_DATE, 50_000, d(2024, 1, 1), accountTxns)
    );
    expect(backDerived).toBe(18_000);
    const tautological = recomputeAnchorAgreement(
      ACCOUNT,
      NEW_ANCHOR_DATE,
      { ...REFERENCE, newOpeningBalance: backDerived },
      accountTxns
    );
    expect(tautological.agrees).toBe(true); // demonstrates why using the back-derived value here is wrong
    const correct = recomputeAnchorAgreement(ACCOUNT, NEW_ANCHOR_DATE, REFERENCE, accountTxns);
    expect(correct.agrees).toBe(false); // the actual fix: REFERENCE.newOpeningBalance is 20,000, not 18,000
  });
});
