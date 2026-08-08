// Excel statement import (2026-08-05) — the second supported file format after CSV, per the
// original bank-import gap analysis (issue #4: "PDF/XLS/XLSX import support"). Scoped to Excel first,
// per explicit user decision ("XLSX first, then PDF" — PDF is a separate, larger effort: text-layer
// extraction only, no OCR/scanned-PDF, consistent with Penny's zero-server privacy model).
//
// Converts a workbook's first sheet into the exact same `string[][]` grid `tokenizeCsv()` produces
// for a CSV file — every downstream function (`extractHeaderRow`, `parseStatementRows`,
// `detectDateFormat`, the whole column-mapping UI) already operates on that shape and needs no
// awareness of which file format produced it.
//
// Password-protected workbooks (2026-08-08, found via real PPF statement import testing — many
// Indian banks/post offices issue password-protected statement exports, the same convention as their
// password-protected statement PDFs): SheetJS's free/Community `xlsx` package cannot decrypt OOXML at
// all (no `password` option exists in this edition, confirmed against the maintainers' own issue
// tracker) — decryption was explicitly considered (a pure-JS `officecrypto-tool` + `buffer` combo) and
// explicitly DECLINED as a feature: the user's own PPF statement can simply be re-exported/re-saved
// without a password, so the cost (a new dependency, a password-prompt UI, untested Metro-bundling
// risk) wasn't worth it for a problem the user can solve themselves in seconds. What IS worth doing:
// `read()` already throws a distinctly-worded error for a password-protected file on its own (no
// extra dependency needed for DETECTION, only decryption) — this file catches that specific wording
// and re-throws as `XlsxPasswordRequiredError` so the UI can show a clear, specific "this file is
// password-protected — remove the password and try again" message instead of a generic parse-failure
// banner.
import { read, utils } from 'xlsx';

export class XlsxParseError extends Error {}
/** The workbook is encrypted/password-protected — SheetJS's free edition can't read it at all.
 *  Distinct from `XlsxParseError` so the UI can show a specific, actionable message ("remove the
 *  password and try again") instead of a generic "couldn't read this file" one. */
export class XlsxPasswordRequiredError extends XlsxParseError {}

/** SheetJS's own `read()` throws this exact wording (case varies by version) when it recognizes an
 *  OOXML/CFB container as encrypted but unsupported — matched case-insensitively rather than as an
 *  exact string so a minor wording change in a future `xlsx` version doesn't silently stop matching. */
const PASSWORD_ERROR_PATTERN = /password/i;

export function parseXlsxToGrid(data: Uint8Array): string[][] {
  // A 0-byte read is a distinct, common upstream failure mode (the native file-read handed back
  // nothing) — worth a clearer message than whatever SheetJS's internal error for empty input would
  // otherwise say (something CFB/ZIP-header-shaped and non-obvious to a user).
  if (data.length === 0) {
    throw new XlsxParseError('This file appears to be empty (0 bytes read) — try picking it again.');
  }

  let workbook;
  try {
    workbook = read(data, { type: 'array', cellDates: false });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (PASSWORD_ERROR_PATTERN.test(detail)) {
      throw new XlsxPasswordRequiredError(
        "This file is password-protected. Remove the password (re-save/re-export it without one) and try again — Penny can't open protected Excel files yet."
      );
    }
    // Never swallow the real reason into one generic, indistinguishable message — a corrupted file
    // and an unsupported format both look identical otherwise, making the failure undiagnosable from
    // the UI alone.
    throw new XlsxParseError(`Could not read this file as an Excel workbook (${detail}).`);
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
