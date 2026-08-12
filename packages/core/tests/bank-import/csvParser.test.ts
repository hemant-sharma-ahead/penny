import { describe, expect, it } from 'vitest';
import {
  detectDateFormat,
  extractHeaderRow,
  parseStatementDate,
  parseStatementRows,
  tokenizeCsv
} from '@/core/bank-import/csvParser';
import type { ColumnMapping } from '@/core/bank-import/types';

const HDFC_MAPPING: ColumnMapping = {
  date: 'Date',
  narration: 'Narration',
  debit: 'Withdrawal Amt.',
  credit: 'Deposit Amt.',
  balance: 'Closing Balance',
  dateFormat: 'DD/MM/YY'
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
    const ms = parseStatementDate('14/06/26', 'DD/MM/YY');
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).getFullYear()).toBe(2026);
    expect(new Date(ms as number).getMonth()).toBe(5);
    expect(new Date(ms as number).getDate()).toBe(14);
  });

  it('parses DD MMM YYYY', () => {
    const ms = parseStatementDate('05 Jul 2026', 'DD MMM YYYY');
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).getMonth()).toBe(6);
  });

  it('parses ISO YYYY-MM-DD', () => {
    const ms = parseStatementDate('2026-07-05', 'YYYY-MM-DD');
    expect(ms).not.toBeNull();
  });

  it('returns null for garbage', () => {
    expect(parseStatementDate('not a date')).toBeNull();
    expect(parseStatementDate(undefined)).toBeNull();
  });

  it('defaults numeric slash dates to day-first (DD/MM/YYYY)', () => {
    // 14 can't be a month, so this is unambiguous even without an explicit format — but the default
    // itself (no format argument at all) must still be day-first, matching every existing bank preset.
    const ms = parseStatementDate('05/06/2026');
    expect(new Date(ms as number).getMonth()).toBe(5); // June, not May
    expect(new Date(ms as number).getDate()).toBe(5);
  });

  it('parses month-first when explicitly told to', () => {
    const ms = parseStatementDate('05/06/2026', 'MM/DD/YYYY');
    expect(new Date(ms as number).getMonth()).toBe(4); // May, not June
    expect(new Date(ms as number).getDate()).toBe(6);
  });

  it('rejects a date that is impossible under the given format, instead of silently rolling over', () => {
    // 25/13/2026 under MM/DD/YYYY would mean month 25 — out of range, must reject, not roll into a
    // later year the way JS Date's own overflow normalization would.
    expect(parseStatementDate('25/13/2026', 'MM/DD/YYYY')).toBeNull();
  });

  it('parses a dash-separated 2-digit year format', () => {
    const ms = parseStatementDate('14-02-26', 'DD-MM-YY');
    expect(new Date(ms as number).getFullYear()).toBe(2026);
    expect(new Date(ms as number).getMonth()).toBe(1); // February
    expect(new Date(ms as number).getDate()).toBe(14);
  });

  it('parses a fully concatenated no-separator format', () => {
    const ms = parseStatementDate('22Feb2026', 'DDMMMYYYY');
    expect(new Date(ms as number).getMonth()).toBe(1); // February
    expect(new Date(ms as number).getDate()).toBe(22);
    expect(new Date(ms as number).getFullYear()).toBe(2026);
  });

  it('rejects a value that does not match the given format shape at all', () => {
    expect(parseStatementDate('14/06/2026', 'YYYY-MM-DD')).toBeNull();
  });
});

describe('detectDateFormat', () => {
  it('is confident about DD/MM/YYYY when a value over 12 appears in the day slot only', () => {
    const result = detectDateFormat(['25/12/2026', '03/01/2026']);
    expect(result).toEqual({ format: 'DD/MM/YYYY', confident: true });
  });

  it('is confident about MM/DD/YYYY when a value over 12 appears in the second slot only', () => {
    const result = detectDateFormat(['12/25/2026', '01/03/2026']);
    expect(result).toEqual({ format: 'MM/DD/YYYY', confident: true });
  });

  it('is not confident when every value is ambiguous (both slots always ≤ 12), defaulting day-first', () => {
    const result = detectDateFormat(['05/06/2026', '01/02/2026']);
    expect(result.format).toBe('DD/MM/YYYY');
    expect(result.confident).toBe(false);
  });

  it('detects a dash-separated 2-digit year format', () => {
    const result = detectDateFormat(['14-06-26', '25-12-26']);
    expect(result).toEqual({ format: 'DD-MM-YY', confident: true });
  });

  it('detects a concatenated named-month format', () => {
    const result = detectDateFormat(['22Feb2026', '05Jul2026']);
    expect(result).toEqual({ format: 'DDMMMYYYY', confident: true });
  });

  it('detects an ISO format', () => {
    const result = detectDateFormat(['2026-07-05', '2026-12-25']);
    expect(result).toEqual({ format: 'YYYY-MM-DD', confident: true });
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
