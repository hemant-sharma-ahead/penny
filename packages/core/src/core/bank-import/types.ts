// Bank Statement Import — deliberately a separate module from core/import/ (the multi-app CSV
// importer). See docs/plans/bank-statement-import.md for the full feature spec this implements.

// `BankPresetId` itself now lives in `core/db/types` — promoted 2026-08-15 once `Account.bankId`
// and `core/sms-import/` needed the same identifier set (see that file's own doc comment on
// `BankPresetId`). Imported (for local use below) AND re-exported here (so every existing
// `from './types'` import in this module keeps resolving it unchanged).
import type { BankPresetId } from '@/core/db/types';
export type { BankPresetId } from '@/core/db/types';

/** Column-mapping for one bank statement export: either separate debit/credit columns (most
 *  Indian bank exports), or a single signed amount column. `balance`, if present, powers the
 *  post-import balance-mismatch nudge (docs/plans/bank-statement-import.md §11). */
export interface ColumnMapping {
  date: string;
  narration: string;
  debit?: string;
  credit?: string;
  amount?: string;
  balance?: string;
  /** A token format string — `DD`, `MM`, `YYYY`, `YY`, `MMM` (3+ letter month name), with any other
   *  character taken as a literal separator (`/`, `-`, `.`, a space, or none at all for a
   *  concatenated form like `DDMMMYYYY`). Compiled by `csvParser.ts`'s `parseStatementDate` —
   *  replaces the narrower `NumericDateOrder` (`'day-first' | 'month-first'`) this session started
   *  with, which only covered one numeric shape and couldn't express e.g. `DD-MM-YY` or a
   *  no-separator `DDMMMYYYY` (found 2026-08-05, via direct user feedback after the first version
   *  shipped). Defaults to `DEFAULT_DATE_FORMAT` ('DD/MM/YYYY') in `parseStatementDate` when omitted. */
  dateFormat?: string;
}

export interface BankPreset {
  id: BankPresetId;
  label: string;
  delimiter: string;
  /** A token format string (`DD`, `MM`, `YYYY`, `YY`, `MMM`) — both the human-readable label shown
   *  in the UI and the actual parsing directive `csvParser.ts` consumes directly (e.g. `'DD/MM/YY'`,
   *  `'DD MMM YYYY'`). No longer just a display hint (2026-08-05) — every preset's format string was
   *  already written in this exact token grammar, so once the parser could read it directly, the
   *  separate `dateOrder` field this session briefly added became redundant and was removed. */
  dateFormat: string;
  mapping: ColumnMapping;
}

export type StatementLineDirection = 'debit' | 'credit';

export interface ParsedStatementRow {
  rawNarration: string;
  date: number; // epoch ms, local midnight — most statements carry no time-of-day
  amount: number; // always positive; direction carries the sign
  direction: StatementLineDirection;
  balance?: number | undefined; // running balance from the statement, if the column was mapped
  rowIndex: number; // 1-based line number in the source file, for the rejected-rows report
}

export interface RejectedStatementRow {
  rowIndex: number;
  rawLine: string;
  reason: string;
}

export interface StatementParseResult {
  rows: ParsedStatementRow[];
  rejected: RejectedStatementRow[];
}
