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
  /** Present only for `'skipped-unresolved'` rows (Phase 2, `docs/plans/bank-reconciliation-ledger.md`)
   *  — the ORIGINAL batch this row came from, so a "resolve" action's new `BankStatementImportRecord`
   *  can reuse it (`buildResolvedImportRecord`) rather than inventing a synthetic marker. A `'matched'`
   *  row needs no equivalent field — its own `expense.expenseId` is enough for a caller to look up its
   *  linking `BankStatementImportRecord` directly. */
  batchId?: string;
  /** Present only for `'skipped-unresolved'` rows with a `rowIndex`-tracked source entry (added
   *  2026-08-11) — the original statement file's own 1-based line number, carried forward so a
   *  "resolve"/"relink" action's new `BankStatementImportRecord` can set `sourceRowIndex`, keeping two
   *  genuinely separate but identical-looking transactions distinguishable end-to-end. Absent for
   *  legacy entries that predate this field. */
  rowIndex?: number;
}

/**
 * A skipped-row snapshot's own stable identity, used both to check `Account.dismissedSkippedRows`
 * and to detect whether a later import already resolved it (see {@link buildLedgerRows}). When
 * `rowIndex` is known, it alone identifies the entry — precise, and immune to two genuinely separate
 * transactions colliding on identical narration/date/amount. Falls back to the original
 * value-based formula (`batchId` + date + amount + normalized narration — never the raw narration
 * verbatim, so minor punctuation/whitespace differences for the same merchant don't produce different
 * fingerprints) only for legacy entries that predate `rowIndex` tracking.
 */
function skippedRowFingerprint(
  batchId: string,
  date: number,
  amount: number,
  normalizedKey: string,
  rowIndex?: number
): string {
  return rowIndex !== undefined
    ? `${batchId}|row:${rowIndex}`
    : `${batchId}|${toDateKey(date)}|${amount}|${normalizedKey}`;
}

function valueMatches(
  record: BankStatementImportRecord,
  entry: { rawNarration: string; date: number; amount: number }
): boolean {
  const key = normalizeNarration(entry.rawNarration);
  return (
    record.normalizedKey === key &&
    toDateKey(record.date) === toDateKey(entry.date) &&
    Math.abs(record.amount - entry.amount) <= 1
  );
}

/**
 * Checks whether a skipped-row snapshot has since been resolved. Two distinct mechanisms, per
 * `docs/plans/bank-reconciliation-ledger.md`'s 2026-08-11 entry:
 *
 * - **Same batch, `rowIndex` known on both sides** — precise, exact-row match only. Two entries in the
 *   SAME batch that share identical narration/date/amount but different `rowIndex` must never
 *   value-match each other here — that's exactly the bug this guards against (resolving row 7 must
 *   never also mark rows 8/9 "resolved" just because they look the same).
 * - **Different batch, OR `rowIndex` missing on either side (legacy)** — value-based, as originally
 *   designed: a corrective re-import commonly covers an overlapping range and can pick up a row a
 *   previous import left unresolved, and a different import's own row numbering starts over from 1
 *   with no relationship to this one, so there's nothing precise to compare there anyway.
 */
function isSkippedRowResolved(
  entry: { rawNarration: string; date: number; amount: number; rowIndex?: number },
  batchId: string,
  importRecords: BankStatementImportRecord[]
): boolean {
  for (const record of importRecords) {
    if (record.batchId === batchId && entry.rowIndex !== undefined && record.sourceRowIndex !== undefined) {
      if (record.sourceRowIndex === entry.rowIndex) return true;
      continue; // same batch, both sides tracked precisely, but a different row — never fall through
    }
    if (valueMatches(record, entry)) return true;
  }
  return false;
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
  // in separately, checked live against every import record for "already resolved" and against
  // `dismissedFingerprints` for "acknowledged, stop flagging."
  //
  // `rowIndex`-tracked entries (2026-08-11) are never deduped against each other here — each is
  // already guaranteed to represent a genuinely distinct statement line (`isSkippedRowResolved`'s own
  // same-batch `rowIndex` check above never lets two different rows collide), so two entries that
  // happen to look identical (same narration/date/amount, different `rowIndex`) both correctly render
  // as separate rows, exactly as they should. The `seenLegacyFingerprints` safety net below applies
  // ONLY to entries that predate `rowIndex` tracking — a batch's own `skippedRows` could, before
  // `unmatchLedgerRow`'s own idempotency fix, contain more than one entry for what was really the same
  // statement line (a repeated match/unmatch cycle); those legacy entries have no `rowIndex` to prove
  // otherwise, so collapsing them to one row is the safer assumption for data that can no longer be
  // disambiguated. Never applied to a `rowIndex`-tracked entry.
  const seenLegacyFingerprints = new Set<string>();
  for (const batch of batches) {
    for (const entry of batch.skippedRows) {
      if (entry.date < windowStart || entry.date > windowEnd) continue;
      if (isSkippedRowResolved(entry, batch.batchId, importRecords)) continue;
      const normalizedKey = normalizeNarration(entry.rawNarration);
      const fingerprint = skippedRowFingerprint(batch.batchId, entry.date, entry.amount, normalizedKey, entry.rowIndex);
      if (dismissedFingerprints.has(fingerprint)) continue;
      if (entry.rowIndex === undefined) {
        if (seenLegacyFingerprints.has(fingerprint)) continue;
        seenLegacyFingerprints.add(fingerprint);
      }
      const signedAmount = entry.direction === 'debit' ? -entry.amount : entry.amount;
      rows.push({
        kind: 'skipped-unresolved',
        date: entry.date,
        statement: { rawNarration: entry.rawNarration, amount: signedAmount },
        dismissKey: fingerprint,
        batchId: batch.batchId,
        ...(entry.rowIndex !== undefined ? { rowIndex: entry.rowIndex } : {})
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
export function buildSkippedRowFingerprint(
  batchId: string,
  rawNarration: string,
  date: number,
  amount: number,
  rowIndex?: number
) {
  return skippedRowFingerprint(batchId, date, amount, normalizeNarration(rawNarration), rowIndex);
}
