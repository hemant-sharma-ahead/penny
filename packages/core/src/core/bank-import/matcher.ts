import type { Expense } from '@/core/db/types';
import { DAY_MS, toDateKey } from '@/lib/date';
import type { ParsedStatementRow } from './types';

/** ±3 days, per docs/plans/bank-statement-import.md §5. */
const CANDIDATE_WINDOW_MS = 3 * DAY_MS;

/** How close a non-exact amount can be to still surface as a "possible match" rather than being
 *  treated as unrelated — a placeholder tolerance (₹10 or 2%, whichever is larger) pending real
 *  statement samples to tune against; never used for an auto/confident match regardless of value. */
function isCloseAmount(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff < 0.01) return false; // exact — handled separately, not "close"
  const tolerance = Math.max(10, b * 0.02);
  return diff <= tolerance;
}

function isExactAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function isSameDay(a: number, b: number): boolean {
  return toDateKey(a) === toDateKey(b);
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

/** Loose, token-level overlap (0–1) — bank narration vocabulary and the user's own logged
 *  description rarely match verbatim, so this is a ranking/tie-break signal only, never a
 *  standalone match criterion (§5). */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

/** Whether a recorded transaction's own money-movement direction matches a statement line's
 *  debit/credit — a transfer counts from whichever side touches this account. */
function matchesDirection(e: Expense, row: ParsedStatementRow, accountId: string): boolean {
  const type = e.type ?? 'expense';
  if (row.direction === 'debit') {
    if (type === 'expense') return e.accountId === accountId;
    if (type === 'transfer') return e.accountId === accountId;
    return false;
  }
  if (type === 'income') return e.accountId === accountId;
  if (type === 'transfer') return e.toAccountId === accountId;
  return false;
}

export interface MatchedPair {
  statementRow: ParsedStatementRow;
  expense: Expense;
}

export interface PossibleMatch {
  statementRow: ParsedStatementRow;
  candidates: Expense[];
}

export interface LoneWolf {
  expense: Expense;
  /** Within a few days of the statement's own start/end boundary — may genuinely belong to an
   *  adjacent statement (settlement lag) rather than being truly missing/erroneous. Flagged softly,
   *  never as a confident duplicate. */
  nearEdge: boolean;
}

export interface MatchResult {
  matched: MatchedPair[];
  possible: PossibleMatch[];
  unmatched: ParsedStatementRow[];
  loneWolves: LoneWolf[];
}

/**
 * Given the account's candidate pool, which expense ids are currently claimed or still
 * provisionally referenced (so they must NOT surface as a lone wolf), and the statement's own date
 * range, returns every pool expense that's genuinely unaccounted-for. Extracted as its own exported
 * pure function — not just inlined in `matchStatementRows` below — so a caller can recompute this
 * *reactively* as review state changes, without re-running the whole one-shot matching pass.
 *
 * This matters because `matchStatementRows` itself is explicitly documented as a one-shot pass
 * (manual overrides/reassignment happen afterward, in the UI layer's own staged state) — but
 * docs/plans/bank-statement-import.md §6's own principle ("never silently hide or silently decide
 * something uncertain") means an expense that becomes unclaimed *during* review — bumped by a
 * reassignment's "trust the user" cascade (§5), or freed up when a possible-match item resolves to a
 * different candidate or is dismissed as new — must still be able to resurface as a lone wolf, not
 * vanish from the review entirely. The UI layer (`features/bank-import/useBankImport.ts`) calls this
 * again on every relevant state change with its own live `referencedIds` set, instead of trusting the
 * one frozen `MatchResult.loneWolves` computed below at parse time.
 */
export function deriveLoneWolves(
  pool: Expense[],
  referencedIds: ReadonlySet<string>,
  statementRows: ParsedStatementRow[]
): LoneWolf[] {
  if (statementRows.length === 0) return [];
  const statementStart = Math.min(...statementRows.map((r) => r.date));
  const statementEnd = Math.max(...statementRows.map((r) => r.date));
  return pool
    .filter((e) => !referencedIds.has(e.id) && e.date >= statementStart && e.date <= statementEnd)
    .map((e) => ({
      expense: e,
      nearEdge: e.date - statementStart <= CANDIDATE_WINDOW_MS || statementEnd - e.date <= CANDIDATE_WINDOW_MS
    }));
}

/**
 * Initial automatic matching pass for one statement import (docs/plans/bank-statement-import.md
 * §5) — a pure function; manual overrides/reassignment of any pairing (including confident
 * "Matched" ones) are applied afterward by the UI layer's own staged-review state, not here.
 *
 * @param allExpenses every recorded transaction (any account) — filtered internally to this
 *   account's own expense/income legs plus any transfer touching it either way.
 * @param reconciliationDescription `RECONCILIATION_DESCRIPTION` from `core/expenses/cashFlowSummary.ts`
 *   — synthetic reconcile-adjustment entries are excluded from matching/lone-wolf candidacy entirely.
 */
export function matchStatementRows(
  statementRows: ParsedStatementRow[],
  accountId: string,
  allExpenses: Expense[],
  reconciliationDescription: string
): MatchResult {
  if (statementRows.length === 0) {
    return { matched: [], possible: [], unmatched: [], loneWolves: [] };
  }

  const pool = allExpenses.filter(
    (e) => e.description !== reconciliationDescription && (e.accountId === accountId || e.toAccountId === accountId)
  );

  const claimed = new Set<string>();
  const referenced = new Set<string>();
  const matched: MatchedPair[] = [];
  const possible: PossibleMatch[] = [];
  const unmatched: ParsedStatementRow[] = [];

  for (const row of statementRows) {
    const available = pool.filter(
      (e) =>
        !claimed.has(e.id) && matchesDirection(e, row, accountId) && Math.abs(e.date - row.date) <= CANDIDATE_WINDOW_MS
    );

    const exact = available.filter((e) => isExactAmount(e.amount, row.amount));

    if (exact.length > 0) {
      const sameDay = exact.filter((e) => isSameDay(e.date, row.date));
      const shortlist = sameDay.length > 0 ? sameDay : exact;
      const [only] = shortlist;

      if (shortlist.length === 1 && only) {
        matched.push({ statementRow: row, expense: only });
        claimed.add(only.id);
        referenced.add(only.id);
        continue;
      }

      const scored = shortlist
        .map((e) => ({ e, score: descriptionSimilarity(row.rawNarration, e.description) }))
        .sort((a, b) => b.score - a.score);
      const [top, runnerUp] = scored;

      if (top && top.score > 0 && top.score > (runnerUp?.score ?? -1)) {
        matched.push({ statementRow: row, expense: top.e });
        claimed.add(top.e.id);
        referenced.add(top.e.id);
      } else {
        possible.push({ statementRow: row, candidates: shortlist });
        for (const e of shortlist) referenced.add(e.id);
      }
      continue;
    }

    const close = available.filter((e) => isCloseAmount(e.amount, row.amount));
    if (close.length > 0) {
      possible.push({ statementRow: row, candidates: close });
      for (const e of close) referenced.add(e.id);
      continue;
    }

    unmatched.push(row);
  }

  const loneWolves = deriveLoneWolves(pool, referenced, statementRows);

  return { matched, possible, unmatched, loneWolves };
}
