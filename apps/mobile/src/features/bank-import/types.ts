// Local, UI-only types for the bank-statement-import wizard (docs/plans/bank-statement-import.md).
// Everything that's genuinely business logic (parsing, matching, normalization, merchant memory,
// balance-check) lives in packages/core/src/core/bank-import/ and is only ever imported here, never
// duplicated — see this feature's own useBankImport.ts doc comment for the full architecture note.
import type { Expense } from '@/core/db/types';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import type { AnchorReference } from '@/core/bank-import/openingBalanceAnchor';

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
  /** Set when `expense` was locally mutated in place (`convertMatchedPairToTransfer`'s cash-transfer
   *  conversion, or `linkAsCrossAccountTransfer`'s cross-account absorption) rather than being an
   *  untouched DB record — found + fixed 2026-08-09, a real bug: `reconcileMatchedExpense()` at commit
   *  time only ever compares `expense` against the STATEMENT ROW's own date/amount/balance, never
   *  against what the database actually still has stored for this id, so a pure type/account-field
   *  conversion with unchanged date/amount produces no detectable "change" and silently never gets
   *  written — the DB keeps the OLD, unconverted record forever, even though the review screen showed
   *  the conversion as accepted. This flag forces `commitAndImport()` to write `expense` regardless of
   *  what `reconcileMatchedExpense()` itself concludes. */
  alreadyConverted?: boolean;
}

/** The staged `Account` write the opening-balance-confirm / anchor-shift flow's screen implies
 *  (docs/plans/bank-balance-sync.md §3 decision #10/§10a/§14, §7 Stage 3, redesigned 2026-08-09 to fix
 *  two bugs found via on-device testing — see `useBankImport.ts`'s own doc comments on
 *  `flagAnchorDisagreement`/`deferAnchorDecision` for the "anchor date never moved on Keep/Review"
 *  double-count bug this closes) — applied at commit time alongside the batch's own
 *  `coveredStatementRanges` update, never before.
 *
 * There is no more `'move'`/`'pin'` distinction — EVERY branch (first-ever-import confirm, §14a clean
 * shift, and all three §14b choices: Accept / Keep+flag / Review rows first) now always moves BOTH the
 * anchor DATE and the anchor VALUE to the new, earlier date; only the VALUE differs by choice (the
 * backfill's own derived figure when trusted, or `backDerivedOpeningBalance()`'s back-derived figure
 * when the old anchor is still trusted instead). Leaving the date pinned at the OLD, later date while
 * committing transactions dated before it (the pre-fix `'pin'` behavior) silently let
 * `computeBalance()` double-count the entire backfilled period on top of the kept opening balance. */
export interface PendingOpeningBalanceUpdate {
  openingBalance: number;
  openingBalanceAsOfDate: number;
  /** Set only when this shift is being flagged as disagreeing with a still-independently-trusted older
   *  anchor (the "Keep"/"Review rows first" branches) — the immutable fact a later live recheck compares
   *  against (see `openingBalanceAnchor.ts`'s `recomputeAnchorAgreement`). Absent for a first-ever-import
   *  confirm or a clean/accepted anchor-shift, where there is nothing left to disagree with. */
  reference?: AnchorReference;
}
