// Excel statement import (2026-08-05) — the second supported file format after CSV, per the
// original bank-import gap analysis (issue #4: "PDF/XLS/XLSX import support"). Scoped to Excel first,
// per explicit user decision ("XLSX first, then PDF" — PDF is a separate, larger effort: text-layer
// extraction only, no OCR/scanned-PDF, consistent with Penny's zero-server privacy model).
//
// Converts a workbook's first sheet into the exact same `string[][]` grid `tokenizeCsv()` produces
// for a CSV file — every downstream function (`extractHeaderRow`, `parseStatementRows`,
// `detectDateFormat`, the whole column-mapping UI) already operates on that shape and needs no
// awareness of which file format produced it.
import { read, utils } from 'xlsx';

export class XlsxParseError extends Error {}

/**
 * @param data Raw file bytes (from `expo-file-system`'s `File.bytes()` on native, or a browser
 *   File's `arrayBuffer()`/`bytes()` on web) — never a base64 string or file path, so this stays a
 *   pure function with no platform-specific I/O of its own (mirrors `tokenizeCsv`'s own shape,
 *   taking already-read text).
 */
export function parseXlsxToGrid(data: Uint8Array): string[][] {
  let workbook;
  try {
    workbook = read(data, { type: 'array', cellDates: false });
  } catch {
    throw new XlsxParseError('Could not read this file as an Excel workbook.');
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new XlsxParseError('This Excel file has no sheets.');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new XlsxParseError('This Excel file has no sheets.');
  // `header: 1` → array-of-arrays (matching the CSV grid shape) instead of the default
  // array-of-objects keyed by the first row. `raw: false` formats every cell the same way Excel
  // displays it (respecting each cell's own number/date format) into a plain string, so a date cell
  // becomes e.g. "14/06/2026" — the same kind of text `parseStatementDate`/`detectDateFormat` already
  // parse from a CSV export — rather than a raw serial number. `defval: ''` fills any genuinely blank
  // cell so every row stays the same width as the header row.
  const grid = utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
  return grid.map((row) => row.map((cell) => (cell ?? '').toString()));
}
