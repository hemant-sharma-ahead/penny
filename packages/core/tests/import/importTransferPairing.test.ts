import { describe, expect, it } from 'vitest';
import {
  detectTransferPairs,
  detectSelfAccountMovementPairs,
  isLikelySelfAccountMovement,
  isLikelyCashWithdrawal,
  transferPairKey
} from '@/core/import/importTransferPairing';
import type { ParsedRow } from '@/core/import/importParsers';

function row(overrides: Partial<ParsedRow>): ParsedRow {
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

describe('detectTransferPairs', () => {
  it('pairs a matching outgoing/incoming row across two accounts on the same day', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 140000, type: 'expense', categoryName: 'Balance Correction', date: 100 }),
      row({ account: 'Cash', amount: 140000, type: 'income', categoryName: 'Balance Correction', date: 100 })
    ];
    const pairs = detectTransferPairs(rows);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      outgoingIndex: 0,
      incomingIndex: 1,
      fromAccount: 'HDFC1234',
      toAccount: 'Cash',
      amount: 140000
    });
  });

  it('allows a 1-day date gap', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 5000, type: 'expense', categoryName: 'Balance Correction', date: 0 }),
      row({
        account: 'Cash',
        amount: 5000,
        type: 'income',
        categoryName: 'Balance Correction',
        date: 24 * 60 * 60 * 1000
      })
    ];
    expect(detectTransferPairs(rows)).toHaveLength(1);
  });

  it('allows a 2-day gap — real MoneyView export regression (2026-07-xx)', () => {
    // Confirmed via direct inspection of a real MoneyView sample file: a genuine ₹7,500 transfer with
    // the HDFC-x1234 debit on 2022/Oct/09 and the cash credit on 2022/Oct/11 — 2 days apart, well
    // within normal data-entry lag. The old 1-day window silently missed this real pair.
    const oct9 = new Date('2022-10-09').getTime();
    const oct11 = new Date('2022-10-11').getTime();
    const rows: ParsedRow[] = [
      row({ account: 'HDFC-x1234', amount: 7500, type: 'expense', categoryName: 'Balance Correction', date: oct9 }),
      row({ account: 'Cash', amount: 7500, type: 'income', categoryName: 'Balance Correction', date: oct11 })
    ];
    const pairs = detectTransferPairs(rows);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ fromAccount: 'HDFC-x1234', toAccount: 'Cash', amount: 7500 });
  });

  it('does not pair rows more than 3 days apart', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 5000, type: 'expense', categoryName: 'Balance Correction', date: 0 }),
      row({
        account: 'Cash',
        amount: 5000,
        type: 'income',
        categoryName: 'Balance Correction',
        date: 4 * 24 * 60 * 60 * 1000
      })
    ];
    expect(detectTransferPairs(rows)).toEqual([]);
  });

  it('does not pair rows in the same account', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 5000, type: 'expense', categoryName: 'Balance Correction' }),
      row({ account: 'HDFC1234', amount: 5000, type: 'income', categoryName: 'Balance Correction' })
    ];
    expect(detectTransferPairs(rows)).toEqual([]);
  });

  it('does not pair same-direction rows (not opposite expense/income)', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 5000, type: 'expense', categoryName: 'Balance Correction' }),
      row({ account: 'Cash', amount: 5000, type: 'expense', categoryName: 'Balance Correction' })
    ];
    expect(detectTransferPairs(rows)).toEqual([]);
  });

  it('does not pair when neither side looks like a transfer category', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 5000, type: 'expense', categoryName: 'Groceries' }),
      row({ account: 'Cash', amount: 5000, type: 'income', categoryName: 'Salary' })
    ];
    expect(detectTransferPairs(rows)).toEqual([]);
  });

  it('does not pair rows missing an account', () => {
    const rows: ParsedRow[] = [
      row({ amount: 5000, type: 'expense', categoryName: 'Balance Correction' }),
      row({ account: 'Cash', amount: 5000, type: 'income', categoryName: 'Balance Correction' })
    ];
    expect(detectTransferPairs(rows)).toEqual([]);
  });

  it('pairs amounts that differ only by floating-point noise from a real export (2026-07-29 regression)', () => {
    // A real Cashew export was found to write the "incoming" side of a transfer as
    // 139999.99999999997 instead of a clean 140000.0 — a binary floating-point artifact in Cashew's
    // own export (confirmed: 139999.99999999997 !== 140000 by ~2.9e-11). An exact `===` amount
    // comparison silently missed every transfer pair in that file; this must still pair.
    const rows: ParsedRow[] = [
      row({
        account: 'Cash',
        amount: 139999.99999999997,
        type: 'income',
        categoryName: 'Balance Correction',
        date: 100
      }),
      row({ account: 'HDFC XX8112', amount: 140000.0, type: 'expense', categoryName: 'Balance Correction', date: 100 })
    ];
    const pairs = detectTransferPairs(rows);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ fromAccount: 'HDFC XX8112', toAccount: 'Cash' });
  });

  it('pairs on matching title+note alone, even when neither category name looks transfer-like', () => {
    // Real Cashew rows write BOTH sides of a genuine transfer with the exact same title and note text
    // (e.g. "Cash withdrawal for papaji" / "Transferred Balance\nHDFC XX8112 → Cash") — this must be
    // enough confidence to pair even if the export's own category name (here deliberately "Others",
    // not one of our TRANSFER_KEYWORDS) gives no hint at all.
    const rows: ParsedRow[] = [
      row({
        account: 'Cash',
        amount: 5000,
        type: 'income',
        categoryName: 'Others',
        description: 'Cash withdrawal for papaji',
        notes: 'Transferred Balance\nHDFC XX8112 → Cash',
        date: 100
      }),
      row({
        account: 'HDFC XX8112',
        amount: 5000,
        type: 'expense',
        categoryName: 'Others',
        description: 'Cash withdrawal for papaji',
        notes: 'Transferred Balance\nHDFC XX8112 → Cash',
        date: 100
      })
    ];
    expect(detectTransferPairs(rows)).toHaveLength(1);
  });

  it('never reuses a row already paired', () => {
    const rows: ParsedRow[] = [
      row({ account: 'A', amount: 100, type: 'expense', categoryName: 'Balance Correction' }),
      row({ account: 'B', amount: 100, type: 'income', categoryName: 'Balance Correction' }),
      row({ account: 'C', amount: 100, type: 'income', categoryName: 'Balance Correction' })
    ];
    const pairs = detectTransferPairs(rows);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.incomingIndex).toBe(1);
  });
});

describe('isLikelySelfAccountMovement', () => {
  it('flags cash withdrawal and CC bill payment phrasing (redesign doc §7.1)', () => {
    expect(isLikelySelfAccountMovement('Cash Withdrawal')).toBe(true);
    expect(isLikelySelfAccountMovement('ATM Withdrawal')).toBe(true);
    expect(isLikelySelfAccountMovement('Credit Card Bill Payment')).toBe(true);
    expect(isLikelySelfAccountMovement('CC Payment')).toBe(true);
  });

  it('does not flag genuine spending categories', () => {
    expect(isLikelySelfAccountMovement('Groceries')).toBe(false);
  });
});

describe('isLikelyCashWithdrawal', () => {
  it('flags only the cash/ATM withdrawal subset, not the broader self-account-movement list', () => {
    expect(isLikelyCashWithdrawal('Cash Withdrawal')).toBe(true);
    expect(isLikelyCashWithdrawal('ATM Withdrawal')).toBe(true);
    expect(isLikelyCashWithdrawal('Cash Wdl')).toBe(true);
  });

  it('does not flag wallet top-up or credit-card-bill phrasing (isLikelySelfAccountMovement does)', () => {
    expect(isLikelyCashWithdrawal('Wallet Recharge')).toBe(false);
    expect(isLikelyCashWithdrawal('Credit Card Bill Payment')).toBe(false);
    expect(isLikelyCashWithdrawal('CC Payment')).toBe(false);
  });

  it('does not flag genuine spending categories', () => {
    expect(isLikelyCashWithdrawal('Groceries')).toBe(false);
  });
});

describe('detectSelfAccountMovementPairs', () => {
  it('pairs a cash-withdrawal category that detectTransferPairs itself would NOT pair (broader signal)', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 5000, type: 'expense', categoryName: 'Cash Withdrawal', date: 100 }),
      row({ account: 'Cash', amount: 5000, type: 'income', categoryName: 'Cash Withdrawal', date: 100 })
    ];
    // Baseline: detectTransferPairs itself doesn't know "Cash Withdrawal" — this is the whole point of
    // the new, broader detector, not a change to detectTransferPairs' own existing behavior.
    expect(detectTransferPairs(rows)).toEqual([]);
    const pairs = detectSelfAccountMovementPairs(rows);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ fromAccount: 'HDFC1234', toAccount: 'Cash', amount: 5000 });
  });

  it('also still pairs everything detectTransferPairs already pairs (isLikelyTransfer keywords)', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 140000, type: 'expense', categoryName: 'Balance Correction', date: 100 }),
      row({ account: 'Cash', amount: 140000, type: 'income', categoryName: 'Balance Correction', date: 100 })
    ];
    expect(detectSelfAccountMovementPairs(rows)).toHaveLength(1);
  });

  it('pairs a CC bill payment the same broader way', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 8000, type: 'expense', categoryName: 'Credit Card Bill Payment', date: 100 }),
      row({
        account: 'HDFC Credit Card',
        amount: 8000,
        type: 'income',
        categoryName: 'Credit Card Bill Payment',
        date: 100
      })
    ];
    expect(detectSelfAccountMovementPairs(rows)).toHaveLength(1);
  });

  it('still requires opposite direction / two different accounts / date+amount tolerance, same as detectTransferPairs', () => {
    const rows: ParsedRow[] = [
      row({ account: 'HDFC1234', amount: 5000, type: 'expense', categoryName: 'Cash Withdrawal', date: 0 }),
      row({
        account: 'Cash',
        amount: 5000,
        type: 'income',
        categoryName: 'Cash Withdrawal',
        date: 4 * 24 * 60 * 60 * 1000
      })
    ];
    expect(detectSelfAccountMovementPairs(rows)).toEqual([]);
  });
});

describe('transferPairKey', () => {
  it('is stable for the same indices and distinct otherwise', () => {
    expect(transferPairKey(0, 1)).toBe('0-1');
    expect(transferPairKey(0, 1)).toBe(transferPairKey(0, 1));
    expect(transferPairKey(1, 0)).not.toBe(transferPairKey(0, 1));
  });
});
