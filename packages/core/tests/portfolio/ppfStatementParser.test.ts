import { describe, expect, it } from 'vitest';
import {
  classifyPpfRow,
  extractPpfHeaders,
  findPpfTableHeaderRowIndex,
  guessPpfColumnMapping,
  parsePpfStatementRows
} from '@/core/portfolio/ppfStatementParser';
import type { ColumnMapping, ParsedStatementRow } from '@/core/bank-import/types';

function row(overrides: Partial<ParsedStatementRow> = {}): ParsedStatementRow {
  return {
    rawNarration: 'Some narration',
    date: Date.now(),
    amount: 1000,
    direction: 'credit',
    rowIndex: 2,
    ...overrides
  };
}

describe('classifyPpfRow', () => {
  it('classifies a credit row mentioning "interest" as an interest credit', () => {
    expect(classifyPpfRow(row({ direction: 'credit', rawNarration: 'Interest Credited FY2023-24' }))).toBe('interest');
    expect(classifyPpfRow(row({ direction: 'credit', rawNarration: 'INT.CR' }))).toBe('interest');
  });

  it('classifies a plain credit row as a deposit', () => {
    expect(classifyPpfRow(row({ direction: 'credit', rawNarration: 'Cash Deposit' }))).toBe('deposit');
  });

  it('classifies a debit row as a withdrawal, even if the narration is unrelated', () => {
    expect(classifyPpfRow(row({ direction: 'debit', rawNarration: 'Partial Withdrawal' }))).toBe('withdrawal');
  });

  it('never classifies a debit row as interest, regardless of narration', () => {
    expect(classifyPpfRow(row({ direction: 'debit', rawNarration: 'Interest reversal adjustment' }))).toBe(
      'withdrawal'
    );
  });
});

describe('parsePpfStatementRows', () => {
  const mapping: ColumnMapping = {
    date: 'Date',
    narration: 'Particulars',
    debit: 'Withdrawal',
    credit: 'Deposit',
    balance: 'Balance',
    dateFormat: 'DD/MM/YYYY'
  };

  it('parses a well-formed grid into typed PPF rows', () => {
    const grid = [
      ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
      ['05/04/2023', 'Cash Deposit', '', '150000', '150000'],
      ['31/03/2024', 'Interest Credited', '', '10650', '160650'],
      ['15/06/2024', 'Partial Withdrawal', '50000', '', '110650']
    ];
    const result = parsePpfStatementRows(grid, mapping);
    expect(result.rejected).toHaveLength(0);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({ type: 'deposit', amount: 150000 });
    expect(result.rows[1]).toMatchObject({ type: 'interest', amount: 10650 });
    expect(result.rows[2]).toMatchObject({ type: 'withdrawal', amount: 50000 });
  });

  it('rounds a floating-point-residue amount to the nearest rupee (real bug: a formula-computed source cell produced 50000.00299999999...)', () => {
    const grid = [
      ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
      ['05/02/2022', 'Cash Deposit', '', '50000.00299999999', '50000.003']
    ];
    const result = parsePpfStatementRows(grid, mapping);
    expect(result.rows[0]?.amount).toBe(50000);
  });

  it('never silently drops an unparseable row — reports it as rejected', () => {
    const grid = [
      ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
      ['not-a-date', 'Cash Deposit', '', '150000', '150000']
    ];
    const result = parsePpfStatementRows(grid, mapping);
    expect(result.rows).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it('skips preamble rows (account holder, PPF account number, nominee) to find the real table', () => {
    const grid = [
      ['PPF ACCOUNT STATEMENT'],
      ['Account Holder', 'TEST SYNTHETIC USER'],
      ['PPF Account Number', 'TSTEST00000000'],
      ['Nominee', 'SYNTHETIC TEST NOMINEE'],
      ['Branch', 'SBI Test Branch'],
      [],
      ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
      ['05/04/2023', 'Cash Deposit', '', '150000', '150000'],
      ['31/03/2024', 'Interest Credited', '', '10650', '160650']
    ];
    const result = parsePpfStatementRows(grid, mapping);
    expect(result.rejected).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ type: 'deposit', amount: 150000 });
    // rowIndex should point at the REAL file line (row 8, 1-indexed), not row 2 relative to the
    // trimmed table.
    expect(result.rows[0]?.rowIndex).toBe(8);
  });
});

describe('findPpfTableHeaderRowIndex / extractPpfHeaders', () => {
  it('returns 0 for a clean grid with no preamble', () => {
    const grid = [
      ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
      ['05/04/2023', 'Cash Deposit', '', '150000', '150000']
    ];
    expect(findPpfTableHeaderRowIndex(grid)).toBe(0);
    expect(extractPpfHeaders(grid)).toEqual(['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance']);
  });

  it('finds the header row past a multi-row account/nominee preamble', () => {
    const grid = [
      ['Account Holder', 'TEST SYNTHETIC USER'],
      ['Nominee', 'SYNTHETIC TEST NOMINEE'],
      [],
      ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
      ['05/04/2023', 'Cash Deposit', '', '150000', '150000']
    ];
    expect(findPpfTableHeaderRowIndex(grid)).toBe(3);
    expect(extractPpfHeaders(grid)).toEqual(['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance']);
  });

  it('does not misfire on a single incidental keyword match in a preamble row', () => {
    const grid = [
      ['Statement Date', '08/08/2026'], // only "date"-ish, one match — not enough to be the header
      ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
      ['05/04/2023', 'Cash Deposit', '', '150000', '150000']
    ];
    expect(findPpfTableHeaderRowIndex(grid)).toBe(1);
  });

  it('falls back to row 0 when nothing scores well (e.g. an already-trimmed, headerless fixture)', () => {
    const grid = [['foo', 'bar', 'baz']];
    expect(findPpfTableHeaderRowIndex(grid)).toBe(0);
  });

  it('does not misfire on a summary/totals row (real bug, found via real statement import testing)', () => {
    // "Dr Count"/"Cr Count" contain the bare `dr`/`cr` candidates, and "Closing Balance" contains
    // `balance` — 3 matches under the old any-2-of-5-categories scoring, despite this row having no
    // date or narration column at all. The dual date+narration requirement must skip straight past it.
    const grid = [
      ['Brought Forward', 'Dr Count', '', 'Total Debits', 'Cr Count', 'Total Credits', 'Closing Balance', ''],
      ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
      ['05/04/2023', 'Cash Deposit', '', '150000', '150000']
    ];
    expect(findPpfTableHeaderRowIndex(grid)).toBe(1);
    expect(extractPpfHeaders(grid)).toEqual(['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance']);
  });
});

describe('guessPpfColumnMapping', () => {
  it('finds common header names case-insensitively', () => {
    const headers = ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'];
    const guess = guessPpfColumnMapping(headers);
    expect(guess).toEqual({
      date: 'Date',
      narration: 'Particulars',
      debit: 'Withdrawal',
      credit: 'Deposit',
      balance: 'Balance'
    });
  });

  it('leaves a field undefined rather than guessing when no candidate matches', () => {
    const headers = ['Txn Date', 'Details', 'Amount']; // no clean debit/credit/balance match
    const guess = guessPpfColumnMapping(headers);
    expect(guess.date).toBe('Txn Date');
    expect(guess.debit).toBeUndefined();
    expect(guess.credit).toBeUndefined();
    expect(guess.balance).toBeUndefined();
  });
});
