import type { BankStatementImportRecord, Expense, ImportBatchSummary } from '@/core/db/types';
import { delta } from '@/core/accounts/balanceCalculator';
import { toDateKey } from '@/lib/date';
import { normalizeNarration } from './normalization';
import { mergeCoveredRanges, type DateRange } from './coverage';

/**
 * The Full Ledger view (`docs/plans/bank-reconciliation-ledger.md`, Phase 1 — read-only) — a dense,
 * row-by-row Statement ⟷ Expense reconciliation, one row per transaction the statement OR the app's
 * own records contain, in statement order, for a chosen date window. This is a second, deeper zoom
 * level on top of `checkpointDiagnostics.ts`'s sparse checkpoint-only table, not a replacement for
 * it — that file, and everything it feeds (the account badge, the anchor-boundary divider), is
 * untouched by this module.
 */

export type LedgerRowKind = 'matched' | 'skipped-unresolved' | 'anomaly' | 'not-covered';

export interface LedgerStatementSide {
  rawNarration: string;
  /** Signed relative to the account this ledger is for — positive credit, negative debit. Mirrors
   *  `delta()`'s own sign convention on the expense side so the two are directly comparable. */
  amount: number;
}

export interface LedgerExpenseSide {
  expenseId: string;
  description: string;
  /** Signed relative to the account this ledger is for, via `delta()` — correct regardless of which
   *  side of a transfer this account is on. */
  amount: number;
  isTransfer: boolean;
  /** The other account's own id, only for a transfer — the UI resolves this to a name; this module
   *  has no account-name lookup of its own. */
  otherAccountId?: string;
}

export interface LedgerRow {
  kind: LedgerRowKind;
  date: number;
  statement?: LedgerStatementSide;
  expense?: LedgerExpenseSide;
  /** Penny's own running balance immediately after this row, when the row corresponds to a real
   *  `Expense` (`'matched'`/`'anomaly'`/`'not-covered'`) — a `'skipped-unresolved'` row has no
   *  `Expense`, so nothing to accumulate, and is `undefined` here. */
  computedBalance?: number;
  /** Reserved for a future per-line statement-balance addition — `BankStatementImportRecord` doesn't
   *  persist the statement's own running balance for a matched row today (only
   *  `Expense.statementBalance`, on the sparse checkpoint subset), so there's nothing to diff against
   *  for most rows here. Always `undefined` in this Phase 1 version. */
  diff?: number;
  /** Present only for `'skipped-unresolved'` rows — the stable fingerprint the "not mine, stop
   *  flagging this" dismiss action writes to `Account.dismissedSkippedRows`. */
  dismissKey?: string;
}

/**
 * A skipped-row snapshot's own stable identity, used both to check `Account.dismissedSkippedRows`
 * and to detect whether a later import already resolved it (see {@link buildLedgerRows}). Built from
 * facts that never change once a batch commits (`batchId`, the row's own date/amount, its normalized
 * narration) — never the raw narration verbatim, so two statements' own minor punctuation/whitespace
 * differences for what's really the same merchant don't produce two different fingerprints.
 */
function skippedRowFingerprint(batchId: string, date: number, amount: number, normalizedKey: string): string {
  return `${batchId}|${toDateKey(date)}|${amount}|${normalizedKey}`;
}

/**
 * Checks whether a skipped-row snapshot has since been resolved by ANY of the account's import
 * records (not just the batch it was originally skipped from) — a corrective re-import commonly
 * covers an overlapping range and can pick up a row a previous import left unresolved.
 * `normalizeNarration()` is applied live here, never persisted on the snapshot itself, so this needs
 * no schema backfill and stays correct even against import records written before this check
 * existed. Day-granularity date match (statements never carry time-of-day) + ±₹1 tolerance on amount,
 * matching this whole feature's existing tolerance convention.
 */
function isSkippedRowResolved(
  entry: { rawNarration: string; date: number; amount: number },
  importRecords: BankStatementImportRecord[]
): boolean {
  const key = normalizeNarration(entry.rawNarration);
  return importRecords.some(
    (r) =>
      r.normalizedKey === key && toDateKey(r.date) === toDateKey(entry.date) && Math.abs(r.amount - entry.amount) <= 1
  );
}

interface BuildLedgerRowsParams {
  accountId: string;
  openingBalance: number;
  openingBalanceAsOfDate?: number;
  /** Every `Expense` touching this account (as either `accountId` or `toAccountId`) — same
   *  "not pre-filtered" requirement as `checkpointDiagnostics.ts`'s `buildComparisons`. */
  accountTxns: Expense[];
  /** This account's own `BankStatementImportRecord`s only (pre-scoped by the caller) — a transfer's
   *  OTHER leg's own import record belongs to the other account's ledger, not this one. */
  importRecords: BankStatementImportRecord[];
  /** This account's own `Account.coveredStatementRanges` — source for both the skipped-row sweep and
   *  the anomaly/not-covered classification. */
  batches: ImportBatchSummary[];
  dismissedFingerprints: Set<string>;
  windowStart: number;
  windowEnd: number;
}

/**
 * Builds the Full Ledger's row list for one account, one date window (Phase 1 — read-only; Phase 2
 * layers relink/resolve actions on top of this same row model, `docs/plans/bank-reconciliation-
 * ledger.md`). Pure, no I/O.
 *
 * The running balance (`computedBalance`) is walked from the TRUE start (respecting
 * `openingBalanceAsOfDate`'s pre-anchor exclusion, exactly like `checkpointDiagnostics.ts`) through
 * every real transaction up to `windowEnd`, but only transactions dated at/after `windowStart` are
 * materialized into the returned rows — so a balance shown at the top of a window is always correct
 * even though earlier transactions never render.
 */
export function buildLedgerRows(params: BuildLedgerRowsParams): LedgerRow[] {
  const {
    accountId,
    openingBalance,
    openingBalanceAsOfDate,
    accountTxns,
    importRecords,
    batches,
    dismissedFingerprints,
    windowStart,
    windowEnd
  } = params;

  const recordByLinkedId = new Map(importRecords.map((r) => [r.linkedTxnId, r]));
  const coveredUnion: DateRange[] = mergeCoveredRanges(batches);

  // Same ordering convention as `checkpointDiagnostics.ts`'s `buildComparisons` — date, then
  // `reconciledSeq` when assigned, else stable insertion order — but never day-bucketed, since the
  // ledger always wants one row per transaction, not one combined end-of-day comparison.
  const relevant = accountTxns
    .map((txn, order) => ({ txn, order }))
    .filter(({ txn }) => txn.accountId === accountId || txn.toAccountId === accountId)
    .filter(({ txn }) => openingBalanceAsOfDate === undefined || txn.date >= openingBalanceAsOfDate)
    .sort((a, b) => {
      if (a.txn.date !== b.txn.date) return a.txn.date - b.txn.date;
      const aSeq = a.txn.reconciledSeq;
      const bSeq = b.txn.reconciledSeq;
      if (aSeq !== undefined && bSeq !== undefined && aSeq !== bSeq) return aSeq - bSeq;
      if (aSeq !== undefined && bSeq === undefined) return -1;
      if (aSeq === undefined && bSeq !== undefined) return 1;
      return a.order - b.order;
    });

  const rows: LedgerRow[] = [];
  let runningBalance = openingBalance;
  for (const { txn } of relevant) {
    runningBalance += delta(accountId, txn);
    if (txn.date < windowStart || txn.date > windowEnd) continue;

    const record = recordByLinkedId.get(txn.id);
    const isTransfer = (txn.type ?? 'expense') === 'transfer';
    const expenseSide: LedgerExpenseSide = {
      expenseId: txn.id,
      description: txn.description,
      amount: delta(accountId, txn),
      isTransfer,
      ...(isTransfer ? { otherAccountId: txn.accountId === accountId ? txn.toAccountId : txn.accountId } : {})
    };

    if (record) {
      rows.push({
        kind: 'matched',
        date: txn.date,
        statement: { rawNarration: record.rawNarration, amount: delta(accountId, txn) },
        expense: expenseSide,
        computedBalance: runningBalance
      });
      continue;
    }

    const isCovered = coveredUnion.some((r) => txn.date >= r.start && txn.date <= r.end);
    rows.push({
      kind: isCovered ? 'anomaly' : 'not-covered',
      date: txn.date,
      expense: expenseSide,
      computedBalance: runningBalance
    });
  }

  // Skipped rows never contributed to `runningBalance` above (no `Expense` exists for them) — swept
  // in separately, checked live against every import record for "already resolved by a later
  // import" and against `dismissedFingerprints` for "acknowledged, stop flagging."
  for (const batch of batches) {
    for (const entry of batch.skippedRows) {
      if (entry.date < windowStart || entry.date > windowEnd) continue;
      if (isSkippedRowResolved(entry, importRecords)) continue;
      const normalizedKey = normalizeNarration(entry.rawNarration);
      const fingerprint = skippedRowFingerprint(batch.batchId, entry.date, entry.amount, normalizedKey);
      if (dismissedFingerprints.has(fingerprint)) continue;
      const signedAmount = entry.direction === 'debit' ? -entry.amount : entry.amount;
      rows.push({
        kind: 'skipped-unresolved',
        date: entry.date,
        statement: { rawNarration: entry.rawNarration, amount: signedAmount },
        dismissKey: fingerprint
      });
    }
  }

  // A skipped row has no `order`/`reconciledSeq` to break a same-date tie against a real
  // transaction's own row — `Array.prototype.sort` is stable, so pushing skipped rows after the
  // already-sorted expense-based rows above means a same-date tie always resolves expense-row-first.
  // Documented, deliberate simplification (`docs/plans/bank-reconciliation-ledger.md` — no
  // drag-to-reorder in v1).
  return rows.sort((a, b) => a.date - b.date);
}

/**
 * The fingerprint an "not mine, stop flagging this" dismiss action should write to
 * `Account.dismissedSkippedRows` — exported so the mobile layer never has to reconstruct
 * {@link skippedRowFingerprint}'s exact formula itself.
 */
export function buildSkippedRowFingerprint(batchId: string, rawNarration: string, date: number, amount: number) {
  return skippedRowFingerprint(batchId, date, amount, normalizeNarration(rawNarration));
}
