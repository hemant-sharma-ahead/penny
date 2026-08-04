// Local, UI-only types for the bank-statement-import wizard (docs/plans/bank-statement-import.md).
// Everything that's genuinely business logic (parsing, matching, normalization, merchant memory,
// balance-check) lives in packages/core/src/core/bank-import/ and is only ever imported here, never
// duplicated — see this feature's own useBankImport.ts doc comment for the full architecture note.
import type { Expense } from '@/core/db/types';
import type { ParsedStatementRow } from '@/core/bank-import/types';

/** `setup` covers bank selection, file upload, and column-mapping review in one screen (merged
 *  2026-08-03, per explicit user feedback — was 3 separate steps). */
export type BankImportStep = 'setup' | 'review' | 'done';

/** One statement line the user has resolved (bulk-categorized, or recorded individually via the
 *  statementPreset `ExpenseForm`) into a brand-new `Expense` — staged, not yet written to the vault.
 *  `expense` is already fully formed (id, source: 'bank_sync', etc.) so commit only needs to `.put()`
 *  it and then link a `BankStatementImportRecord` back to `statementRow`. */
export interface StagedNewTxn {
  expense: Expense;
  statementRow: ParsedStatementRow;
  /** The Set Aside choice made inline for any brand-new tag on this transaction (mirrors
   *  `ExpenseForm`'s own `newTagSetAside` save argument) — ignored for tags that already exist as a
   *  `Hashtag` row. Carried through to commit time since hashtag bookkeeping (usage count / creation)
   *  only happens in `commitAndImport()`, not at staging time. */
  newTagSetAside?: Record<string, boolean>;
  /** Bulk-shared "Lent to" / "Borrowed from" person name, set by `BulkCategorizeModal`'s IOU panel.
   *  Kind (lent vs borrowed) is derived from `expense.type` at commit time, never stored separately,
   *  so it always tracks the resolved transaction direction rather than risking drift. */
  iouPersonName?: string;
}

/** A "possible match" bucket item (docs §5/§6 bucket 2), still awaiting a decision. Once the user
 *  picks a candidate via `PossibleMatchPickerModal` (`resolvePossibleMatch`), the item is removed
 *  from this list entirely and folded into `MatchedItem`s instead — there is no "resolved but still
 *  listed here" intermediate state. */
export interface PossibleItem {
  statementRow: ParsedStatementRow;
  candidates: Expense[];
}

/** A confirmed "Matched" pairing (bucket 1) — starts as the matcher's own confident auto-pairs, and can
 *  be reassigned via the same picker modal (docs §5's "trust the user" cascade). */
export interface MatchedItem {
  statementRow: ParsedStatementRow;
  expense: Expense;
}
