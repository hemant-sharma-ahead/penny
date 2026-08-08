// PPF statement import — parsing/classification layer (2026-08-08). See docs/features/portfolio/
// retirement.md for the feature writeup.
//
// Deliberately reuses `core/bank-import/`'s generic, bank-agnostic grid-tokenizing/column-mapping/
// date-parsing primitives directly (`tokenizeCsv`, `parseXlsxToGrid`, `extractHeaderRow`,
// `parseStatementRows`, `detectDateFormat`) rather than forking them — those functions have zero
// bank/Expense awareness (`string[][]` grid in, a generic date-token engine), so importing them here
// doesn't touch the one real isolation rule this repo has (`core/bank-import/` must never share code
// with `core/import/`, the OTHER generic importer used for Expenses — that rule is specifically about
// those two modules, not about a third consumer of bank-import's lowest-level utilities). What's
// genuinely new here is the one piece bank-import has no equivalent of: classifying a row's
// `PpfTransactionType` from its narration/credit-debit direction.
import { extractHeaderRow, parseStatementRows } from '../bank-import/csvParser';
import type { ColumnMapping, ParsedStatementRow, RejectedStatementRow } from '../bank-import/types';
import type { PpfTransactionType } from '@/core/db/types';

export interface ParsedPpfStatementRow {
  date: number; // epoch ms
  type: PpfTransactionType;
  amount: number;
  /** The statement row's own narration — kept separate from any user-authored note, same rationale
   *  as `PpfTransaction.sourceParticulars`. */
  narration: string;
  balance?: number | undefined;
  rowIndex: number;
}

export interface PpfStatementParseResult {
  rows: ParsedPpfStatementRow[];
  rejected: RejectedStatementRow[];
}

/** A credit row whose narration mentions interest is an interest credit, not a deposit — every real
 *  PPF statement/passbook export labels its one annual interest row this way ("Interest",
 *  "Int.Cr", "Interest Credited", etc.). Everything else is classified purely by debit/credit
 *  direction: credit → deposit, debit → withdrawal. Never infers from amount size/round-numberness —
 *  a large deposit and a large interest credit are only distinguishable by narration, and if the
 *  narration doesn't say "interest", it isn't classified as one. */
const INTEREST_NARRATION_PATTERN = /\binterest\b|\bint\.?\s*cr(?:edit(?:ed)?)?\b/i;

export function classifyPpfRow(row: ParsedStatementRow): PpfTransactionType {
  if (row.direction === 'credit' && INTEREST_NARRATION_PATTERN.test(row.rawNarration)) return 'interest';
  return row.direction === 'credit' ? 'deposit' : 'withdrawal';
}

const DATE_HEADER_CANDIDATES = ['date', 'transaction date', 'txn date', 'value date', 'posting date'];
const NARRATION_HEADER_CANDIDATES = ['particulars', 'narration', 'description', 'remarks', 'transaction remarks'];
const DEBIT_HEADER_CANDIDATES = ['withdrawal', 'debit', 'withdrawal amt.', 'withdrawal amount (inr)', 'dr'];
const CREDIT_HEADER_CANDIDATES = ['deposit', 'credit', 'deposit amt.', 'deposit amount (inr)', 'cr'];
const BALANCE_HEADER_CANDIDATES = ['balance', 'closing balance', 'balance (inr)', 'running balance'];

/** Scans a raw grid for the row that actually looks like the transaction table's header — needed
 *  because a real bank/post-office PPF statement export often carries several preamble rows first
 *  (account holder name, PPF account number, nominee, branch, IFSC, statement period) AND a summary/
 *  totals row (e.g. "Brought Forward", "Dr Count", "Total Debits", "Cr Count", "Total Credits",
 *  "Closing Balance") before the real Date/Particulars/Withdrawal/Deposit/Balance table begins,
 *  unlike a clean CSV where row 0 is always the header.
 *
 *  Requires the row to have BOTH a date-like column AND a narration-like column — not just "any 2
 *  cells matching any candidate from any category." An earlier version scored any row with ≥2 total
 *  matches across all 5 candidate categories, which false-positived on exactly the summary row above:
 *  "Dr Count" and "Cr Count" both contain the bare `dr`/`cr` debit/credit candidates, and "Closing
 *  Balance" contains `balance` — 3 matches, comfortably over the old threshold, despite the row having
 *  no date or narration column at all (found via real statement import testing, 2026-08-08). A
 *  genuine transaction table header always has both a date column and a narration/particulars-like
 *  column; a summary/totals row structurally never does — this is a far more specific signal than
 *  "contains debit/credit/balance-ish words," which totals rows are FULL of by definition. Falls back
 *  to row 0 when nothing qualifies, so a clean file with no preamble is unaffected either way. */
export function findPpfTableHeaderRowIndex(grid: string[][]): number {
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const lower = row.map((c) => c.toLowerCase().trim());
    const hasDate = lower.some((cell) => cell !== '' && DATE_HEADER_CANDIDATES.some((tok) => cell.includes(tok)));
    const hasNarration = lower.some(
      (cell) => cell !== '' && NARRATION_HEADER_CANDIDATES.some((tok) => cell.includes(tok))
    );
    if (hasDate && hasNarration) return i;
  }
  return 0;
}

/** The real transaction table's header row, skipping any preamble — see
 *  `findPpfTableHeaderRowIndex`. Use this instead of a bare `extractHeaderRow(grid)` wherever the
 *  grid might carry account/nominee details before the table (i.e. any real-world statement export,
 *  as opposed to a hand-built test fixture that's already just the table). */
export function extractPpfHeaders(grid: string[][]): string[] {
  return extractHeaderRow(grid.slice(findPpfTableHeaderRowIndex(grid)));
}

/** Parses a tokenized statement grid (from `tokenizeCsv`/`parseXlsxToGrid` — this function is
 *  file-format-agnostic, taking the same `string[][]` grid shape both produce) against a confirmed
 *  column mapping. Automatically skips past any preamble rows to find the real table (see
 *  `findPpfTableHeaderRowIndex`) — the caller never needs to pre-trim the grid itself. Never silently
 *  drops a line — anything `parseStatementRows` couldn't parse becomes a `RejectedStatementRow`
 *  (with `rowIndex` adjusted back to the ORIGINAL file's line numbers, not the trimmed grid's,
 *  so a "couldn't parse row 14" message actually points at row 14 of the real file). */
export function parsePpfStatementRows(grid: string[][], mapping: ColumnMapping): PpfStatementParseResult {
  const headerRowIndex = findPpfTableHeaderRowIndex(grid);
  const tableGrid = grid.slice(headerRowIndex);
  const headers = extractHeaderRow(tableGrid);
  const { rows: parsedRows, rejected } = parseStatementRows(tableGrid, headers, mapping);

  const rows: ParsedPpfStatementRow[] = parsedRows.map((r) => ({
    date: r.date,
    type: classifyPpfRow(r),
    // Rounded to the nearest rupee — PPF amounts are always whole rupees in practice, but a
    // formula-computed cell in the SOURCE spreadsheet can carry genuine IEEE-754 floating-point
    // residue (e.g. 50000.00299999999...) that survives Excel's own display formatting and
    // SheetJS's `raw:false` conversion. Found via real statement import testing, 2026-08-08 — a
    // stored transaction showed "₹50,000.003". Rounding here (not in the shared `parseAmount()` in
    // `bank-import/csvParser.ts`, which bank-import also relies on and may see genuine paise) keeps
    // this a PPF-specific assumption, not a change to shared statement-parsing behavior.
    amount: Math.round(r.amount),
    narration: r.rawNarration,
    balance: r.balance,
    rowIndex: r.rowIndex + headerRowIndex
  }));
  const rejectedAdjusted = rejected.map((r) => ({ ...r, rowIndex: r.rowIndex + headerRowIndex }));

  return { rows, rejected: rejectedAdjusted };
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h === candidate || h.includes(candidate));
    if (idx >= 0) return headers[idx];
  }
  return undefined;
}

/** Best-effort column-mapping guess from a statement's real header row — a pre-fill SUGGESTION for a
 *  mapping-confirmation step, never used to parse without the user reviewing/confirming it first
 *  (matching bank-import's own explicit, user-confirmed philosophy: "exact preset-or-custom mapping,
 *  not fuzzy column detection" — this guess is the "preset" half of that, auto-generated instead of
 *  hand-curated per-bank since PPF exports don't have bank-import's established per-institution
 *  preset list yet). Any field this can't confidently find is left `undefined` — the mapping UI must
 *  require the user to fill it in, never guess silently. */
export function guessPpfColumnMapping(headers: string[]): Partial<ColumnMapping> {
  // Built via conditional spreads, not literal `field: possiblyUndefined` — under
  // `exactOptionalPropertyTypes`, an optional property that's actually present in the object must
  // hold a real value, never `undefined` itself; a field with no confident guess must be OMITTED
  // entirely, not set to `undefined`.
  const date = findHeader(headers, DATE_HEADER_CANDIDATES);
  const narration = findHeader(headers, NARRATION_HEADER_CANDIDATES);
  const debit = findHeader(headers, DEBIT_HEADER_CANDIDATES);
  const credit = findHeader(headers, CREDIT_HEADER_CANDIDATES);
  const balance = findHeader(headers, BALANCE_HEADER_CANDIDATES);
  return {
    ...(date && { date }),
    ...(narration && { narration }),
    ...(debit && { debit }),
    ...(credit && { credit }),
    ...(balance && { balance })
  };
}
