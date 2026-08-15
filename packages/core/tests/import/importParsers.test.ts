import { describe, expect, it } from 'vitest';
import {
  parseByFormat,
  guessMappingForFormat,
  readHeader,
  parseWithMapping,
  validateMappingForFormat
} from '@/core/import/importParsers';

const PENNY_CSV = [
  'Date,Amount,Description,Category,Type,PaymentMode,Tags,Notes',
  '14/06/2026,450,Groceries from DMart,Groceries,expense,UPI,#groceries,Weekly shop',
  '12/06/2026,95000,Salary credit,Salary,income,NetBanking,,'
].join('\n');

const YNAB_CSV = [
  'Date,Payee,Category,Memo,Outflow,Inflow',
  '06/14/2026,DMart,Groceries,Weekly shop,450.00,0.00',
  '06/12/2026,Employer,Salary,,0.00,95000.00'
].join('\n');

// Excerpted rows from the real Cashew export provided as a reference file.
const CASHEW_CSV = [
  'account,amount,amount unpaid,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective,extra',
  'HSBC1234,-240.0,,INR,Chai snacks,,2026-06-30 20:34:35.000,FALSE,default,Others,,0xFF3F51B5,,ð,,,repeat every 1 month',
  'HDFC1234,140000.00000000000,,INR,Cash withdrawal for abc,"Transferred Balance HDFC1234 to Cash",2026-06-30 13:34:31.000,TRUE,default,Balance Correction,,0xFF607D8B,charts,,,,'
].join('\n');

// Excerpted rows from the real MoneyView export provided as a reference file — note the split
// Credit/Debit columns (no single "amount" column) and the "Merchant/Receiver/Sender" description
// header, both of which the original parser (before the 2026-07-28 rewrite) failed to detect at all.
const MONEYVIEW_CSV = [
  'Date,Type,SubType,Txn Type, Payment Type,Merchant/Receiver/Sender,Category,Bank Name,Account Id,Account Type,Credit,Debit,Balance,Outstanding,Available Limit,Notes',
  '2022/Oct/02 13:27:16,debit-transaction,expense,regular,upi,sdf,Food & Drinks,HDFC,HDFC-x1234,bank,0,30,0,0,0,2.27577E+11',
  '2022/Oct/21 16:42:48,credit-transaction,income,regular,netbanking,f,Salary,HDFC,HDFC-x1234,bank,191752,0,273655.51,0,0,CITIN22353939241'
].join('\n');

describe('parseByFormat — penny', () => {
  it('parses the fixed Penny template shape', () => {
    const { rows, rejected } = parseByFormat(PENNY_CSV, 'penny');
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amount: 450, description: 'Groceries from DMart', type: 'expense' });
    expect(rows[1]).toMatchObject({ amount: 95000, type: 'income' });
  });
});

describe('parseByFormat — ynab', () => {
  it('parses the Outflow/Inflow split-amount pattern', () => {
    const { rows, rejected } = parseByFormat(YNAB_CSV, 'ynab');
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({ amount: 450, type: 'expense', description: 'DMart' });
    expect(rows[1]).toMatchObject({ amount: 95000, type: 'income' });
  });
});

describe('parseByFormat — cashew (real sample data)', () => {
  it('parses account + income flag correctly, including a "Balance Correction" transfer-like row', () => {
    const { rows, rejected } = parseByFormat(CASHEW_CSV, 'cashew');
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({ amount: 240, type: 'expense', account: 'HSBC1234', categoryName: 'Others' });
    expect(rows[1]).toMatchObject({
      amount: 140000,
      type: 'income',
      account: 'HDFC1234',
      categoryName: 'Balance Correction'
    });
  });
});

describe('parseByFormat — moneyview (real sample data)', () => {
  it('parses split Credit/Debit columns and the Merchant/Receiver/Sender description column', () => {
    // Before the rewrite, this exact file shape parsed 0 rows: the old parser looked for a single
    // "amount" column (none exists — it's Credit/Debit) and a "desc|narration|detail|particulars"
    // header (none matches "Merchant/Receiver/Sender" either).
    const { rows, rejected } = parseByFormat(MONEYVIEW_CSV, 'moneyview');
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amount: 30, type: 'expense', description: 'sdf', categoryName: 'Food & Drinks' });
    expect(rows[1]).toMatchObject({ amount: 191752, type: 'income', description: 'f' });
  });
});

// A quoted `note` field with a literal embedded newline — the shape that fragmented into bogus extra
// rows before the 2026-07-28 tokenizer rewrite (confirmed against a real Cashew file: 75 rows read
// instead of the actual 69), because the old parser split the whole file into lines before any
// quote-awareness existed.
const CASHEW_MULTILINE_NOTE_CSV = [
  'account,amount,amount unpaid,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective,extra',
  'HSBC1234,-240.0,,INR,Chai snacks,"Met friend at cafe\nDiscussed the trip budget",2026-06-30 20:34:35.000,FALSE,default,Others,,0xFF3F51B5,,,,,repeat every 1 month',
  'HDFC1234,140000.00000000000,,INR,Cash withdrawal for abc,"Transferred Balance HDFC1234 to Cash",2026-06-30 13:34:31.000,TRUE,default,Balance Correction,,0xFF607D8B,charts,,,,'
].join('\n');

describe('parseByFormat — cashew (embedded newline in a quoted field)', () => {
  it('treats a quoted, literal embedded newline as content within the field, not a row break', () => {
    const { rows, rejected, totalDataRows } = parseByFormat(CASHEW_MULTILINE_NOTE_CSV, 'cashew');
    expect(totalDataRows).toBe(2);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amount: 240, type: 'expense', description: 'Chai snacks' });
    expect(rows[0]?.notes).toBe('Met friend at cafe\nDiscussed the trip budget');
    expect(rows[1]).toMatchObject({ amount: 140000, type: 'income' });
  });
});

describe('validateMappingForFormat', () => {
  it('flags the real MoneyView header as invalid under the Cashew synonym set', () => {
    // Cashew has no outflow/inflow synonyms, and its "amount" synonym matches nothing in this
    // split-Credit/Debit header, so `amount` never resolves — this is the field that actually makes the
    // mapping invalid. (Cashew's `description` synonym "name" happens to substring-match MoneyView's
    // "Bank Name" column, so description is NOT the field that fails here, unlike a naive guess might
    // suggest — the wrong-column match is real, but it's amount that trips the validation.)
    const mapping = guessMappingForFormat(MONEYVIEW_CSV, 'cashew')!;
    expect(mapping.amount).toBe(-1);
    expect(mapping.outflow).toBe(-1);
    expect(mapping.inflow).toBe(-1);
    expect(mapping.description).toBeGreaterThanOrEqual(0);

    const error = validateMappingForFormat(mapping, 'cashew');
    expect(error).not.toBeNull();
    expect(error).toMatch(/doesn't look like a Cashew export/);
  });

  it('passes for the real Cashew header against Cashew synonyms', () => {
    const mapping = guessMappingForFormat(CASHEW_CSV, 'cashew')!;
    expect(validateMappingForFormat(mapping, 'cashew')).toBeNull();
  });
});

describe('custom format (guessed mapping + parseWithMapping)', () => {
  it('pre-fills a non-blank mapping guess for an arbitrary header', () => {
    const mapping = guessMappingForFormat(MONEYVIEW_CSV, 'custom');
    expect(mapping).not.toBeNull();
    expect(mapping!.date).toBeGreaterThanOrEqual(0);
    expect(mapping!.outflow).toBeGreaterThanOrEqual(0);
    expect(mapping!.inflow).toBeGreaterThanOrEqual(0);
  });

  it('parses correctly once the user confirms (or accepts) the guessed mapping', () => {
    const mapping = guessMappingForFormat(CASHEW_CSV, 'custom')!;
    const { rows } = parseWithMapping(CASHEW_CSV, mapping, 'auto');
    expect(rows.length).toBeGreaterThan(0);
  });
});

// A row shaped like the real MoneyView rows found 2026-08-14 with a literal "null" string (not a
// genuinely blank cell) in Merchant/Receiver/Sender and Notes, plus a populated " Payment Type" column.
const MONEYVIEW_NULL_LITERAL_CSV = [
  'Date,Type,SubType,Txn Type, Payment Type,Merchant/Receiver/Sender,Category,Bank Name,Account Id,Account Type,Credit,Debit,Balance,Outstanding,Available Limit,Notes',
  '2022/Nov/05 10:00:00,debit-transaction,expense,regular,upi,null,Groceries,HDFC,HDFC-x1234,bank,0,120,0,0,0,null'
].join('\n');

describe('parseByFormat — moneyview null-like literals and payment mode (2026-08-14 fixes)', () => {
  it('falls back to the category instead of showing the literal "null" as the description', () => {
    const { rows, rejected } = parseByFormat(MONEYVIEW_NULL_LITERAL_CSV, 'moneyview');
    expect(rejected).toHaveLength(0);
    expect(rows[0]?.description).toBe('Groceries');
  });

  it('omits notes entirely rather than storing the literal "null" string', () => {
    const { rows } = parseByFormat(MONEYVIEW_NULL_LITERAL_CSV, 'moneyview');
    expect(rows[0]?.notes).toBeUndefined();
  });

  it('maps the " Payment Type" column to paymentMode (previously entirely unmapped for this format)', () => {
    const { rows } = parseByFormat(MONEYVIEW_NULL_LITERAL_CSV, 'moneyview');
    expect(rows[0]?.paymentMode).toBe('upi');
  });
});

describe('rejected rows are surfaced, not silently dropped', () => {
  it('reports a reason for a row missing a required field', () => {
    const csv = [
      'Date,Amount,Description,Category,Type,PaymentMode,Tags,Notes',
      '14/06/2026,,,Groceries,expense,,,'
    ].join('\n');
    const { rows, rejected } = parseByFormat(csv, 'penny');
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatch(/description|amount/i);
  });
});

describe('readHeader', () => {
  it('returns the header row without parsing the whole file', () => {
    expect(readHeader(PENNY_CSV)).toEqual([
      'Date',
      'Amount',
      'Description',
      'Category',
      'Type',
      'PaymentMode',
      'Tags',
      'Notes'
    ]);
  });

  it('returns null for empty text', () => {
    expect(readHeader('')).toBeNull();
  });
});
