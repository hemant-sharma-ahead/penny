import { describe, expect, it } from 'vitest';
import { extractHeaderRow, parseStatementDate, parseStatementRows, tokenizeCsv } from '@/core/bank-import/csvParser';
import type { ColumnMapping } from '@/core/bank-import/types';

const HDFC_MAPPING: ColumnMapping = {
  date: 'Date',
  narration: 'Narration',
  debit: 'Withdrawal Amt.',
  credit: 'Deposit Amt.',
  balance: 'Closing Balance'
};

const HDFC_CSV = [
  'Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '14/06/26,UPI-SWIGGY-411223344-YBL,450.00,,12550.00',
  '15/06/26,NEFT CR-SALARY-ACME CORP,,95000.00,107550.00',
  '16/06/26,"ATM WDL, MAIN ST",2000.00,,105550.00'
].join('\n');

describe('tokenizeCsv', () => {
  it('handles quoted fields containing the delimiter', () => {
    const rows = tokenizeCsv(HDFC_CSV);
    expect(rows[3]).toEqual(['16/06/26', 'ATM WDL, MAIN ST', '2000.00', '', '105550.00']);
  });

  it('skips blank lines', () => {
    const rows = tokenizeCsv('a,b\n\nc,d\n');
    expect(rows).toHaveLength(2);
  });
});

describe('parseStatementDate', () => {
  it('parses DD/MM/YY', () => {
    const ms = parseStatementDate('14/06/26');
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).getFullYear()).toBe(2026);
    expect(new Date(ms as number).getMonth()).toBe(5);
    expect(new Date(ms as number).getDate()).toBe(14);
  });

  it('parses DD MMM YYYY', () => {
    const ms = parseStatementDate('05 Jul 2026');
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).getMonth()).toBe(6);
  });

  it('parses ISO YYYY-MM-DD', () => {
    const ms = parseStatementDate('2026-07-05');
    expect(ms).not.toBeNull();
  });

  it('returns null for garbage', () => {
    expect(parseStatementDate('not a date')).toBeNull();
    expect(parseStatementDate(undefined)).toBeNull();
  });
});

describe('parseStatementRows', () => {
  it('parses debit/credit HDFC-shaped rows, never dropping a line silently', () => {
    const rows = tokenizeCsv(HDFC_CSV);
    const headers = extractHeaderRow(rows);
    const { rows: parsed, rejected } = parseStatementRows(rows, headers, HDFC_MAPPING);

    expect(rejected).toHaveLength(0);
    expect(parsed).toHaveLength(3);

    expect(parsed[0]).toMatchObject({ rawNarration: 'UPI-SWIGGY-411223344-YBL', amount: 450, direction: 'debit' });
    expect(parsed[1]).toMatchObject({ rawNarration: 'NEFT CR-SALARY-ACME CORP', amount: 95000, direction: 'credit' });
    expect(parsed[2]).toMatchObject({ amount: 2000, direction: 'debit', balance: 105550 });
  });

  it('rejects a row with an unparseable date instead of dropping it', () => {
    const csv = ['Date,Narration,Withdrawal Amt.,Deposit Amt.', 'not-a-date,SOMETHING,100,'].join('\n');
    const rows = tokenizeCsv(csv);
    const headers = extractHeaderRow(rows);
    const { rows: parsed, rejected } = parseStatementRows(rows, headers, HDFC_MAPPING);
    expect(parsed).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatch(/date/i);
  });

  it('rejects a row with neither debit nor credit amount', () => {
    const csv = ['Date,Narration,Withdrawal Amt.,Deposit Amt.', '14/06/26,SOMETHING,,'].join('\n');
    const rows = tokenizeCsv(csv);
    const headers = extractHeaderRow(rows);
    const { rows: parsed, rejected } = parseStatementRows(rows, headers, HDFC_MAPPING);
    expect(parsed).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/debit or credit/i);
  });
});
