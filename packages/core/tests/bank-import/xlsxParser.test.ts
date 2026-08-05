import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { parseXlsxToGrid, XlsxParseError } from '@/core/bank-import/xlsxParser';

function buildWorkbookBytes(rows: (string | number)[][]): Uint8Array {
  const sheet = utils.aoa_to_sheet(rows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'Statement');
  return write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

describe('parseXlsxToGrid', () => {
  it('reads a simple sheet back into the same string[][] grid shape tokenizeCsv() produces', () => {
    const bytes = buildWorkbookBytes([
      ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
      ['14/06/2026', 'UPI-SWIGGY-123', '450', '', '10000']
    ]);
    const grid = parseXlsxToGrid(bytes);
    expect(grid[0]).toEqual(['Date', 'Narration', 'Debit', 'Credit', 'Balance']);
    expect(grid[1]).toEqual(['14/06/2026', 'UPI-SWIGGY-123', '450', '', '10000']);
  });

  it('formats a real Excel date-serial cell as a plain date string, not a raw number', () => {
    // A genuine Excel date cell — aoa_to_sheet infers a date type from a JS Date value, same as a
    // real user's spreadsheet would contain (as opposed to a bank's own CSV/text export, which never
    // has this problem since everything is already a string).
    const sheet = utils.aoa_to_sheet([
      ['Date', 'Amount'],
      [new Date(2026, 5, 14), 450]
    ]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, 'Statement');
    const bytes = write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
    const grid = parseXlsxToGrid(bytes);
    // Formatted as a real date string (not the underlying serial number like "46187").
    expect(grid[1]?.[0]).not.toMatch(/^\d+$/);
    expect(grid[1]?.[1]).toBe('450');
  });

  it('fills a genuinely blank cell so every row stays the same width as the header row', () => {
    const bytes = buildWorkbookBytes([
      ['Date', 'Narration', 'Debit', 'Credit'],
      ['14/06/2026', 'ATM WDL', '500']
    ]);
    const grid = parseXlsxToGrid(bytes);
    expect(grid[1]).toHaveLength(4);
    expect(grid[1]?.[3]).toBe('');
  });

  it('throws XlsxParseError for a corrupted/truncated workbook', () => {
    // A genuine ZIP signature ("PK") followed by garbage — SheetJS is otherwise very lenient about
    // unrecognized bytes (it falls back to treating them as plain text/CSV content rather than
    // erroring), so this is the realistic shape of a file that actually fails to parse.
    const corrupted = new Uint8Array(Buffer.concat([Buffer.from('PK'), Buffer.alloc(100, 0)]));
    expect(() => parseXlsxToGrid(corrupted)).toThrow(XlsxParseError);
  });
});
