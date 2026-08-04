// Bank Statement Import — deliberately a separate module from core/import/ (the multi-app CSV
// importer). See docs/plans/bank-statement-import.md for the full feature spec this implements.

export type BankPresetId = 'hdfc' | 'icici' | 'kotak' | 'sbi' | 'indusind' | 'hsbc' | 'bob' | 'custom';

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
}

export interface BankPreset {
  id: BankPresetId;
  label: string;
  delimiter: string;
  /** Display hint only — date parsing itself (`parseStatementDate`) is format-tolerant. */
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
