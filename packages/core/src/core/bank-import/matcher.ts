import type { Account, BankNarrationOverride, BankStatementImportRecord, Expense } from '@/core/db/types';
import { DAY_MS, toDateKey } from '@/lib/date';
import { normalizeNarration } from './normalization';
import type { ParsedStatementRow, StatementLineDirection } from './types';

/** ±3 days, per docs/plans/bank-statement-import.md §5. */
const CANDIDATE_WINDOW_MS = 3 * DAY_MS;

/** How close a non-exact amount can be for `suggestPossibleTransfer`'s much softer "might be an
 *  unrecorded transfer leg" heuristic — NOT used by `matchStatementRows`' own "possible match"
 *  bucket any more (removed 2026-08-06, per explicit user decision: a "possible match" against an
 *  existing expense must have the EXACT statement amount — only the ±3-day date window is a
 *  tolerance here. The prior amount tolerance, even after being tightened once already that same day,
 *  was still surfacing genuinely distinct transactions as "possible matches" purely because they fell
 *  within a percentage band of an unrelated recorded expense's amount). Kept here only for
 *  `suggestPossibleTransfer`'s own, separately-scoped, dismissible-suggestion-only heuristic. */
function isCloseAmount(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff < 0.01) return false; // exact — handled separately, not "close"
  const tolerance = Math.max(2, b * 0.005);
  return diff <= tolerance;
}

/** Exported (docs/plans/bank-balance-sync.md §5/§8) — `core/bank-import/checkpoint.ts`'s commit-time
 *  date/amount-correction logic reuses this exact tolerance rather than redefining its own. */
export function isExactAmount(a: number, b: number): boolean {
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

/** Whether a recorded transaction's own money-movement direction matches an incoming signal's
 *  debit/credit — a transfer counts from whichever side touches this account. Takes a minimal
 *  structural `{ direction }` shape rather than the concrete `ParsedStatementRow` so
 *  `core/sms-import/smsTransactionMatch.ts`'s `ParsedSmsCandidate` (same `direction` field, entirely
 *  different other fields) can reuse this exact logic too (docs/plans/sms-transaction-tracking.md
 *  §4a) instead of duplicating it — exported 2026-08-15 for that reason; behavior is unchanged for
 *  every existing caller. */
export function matchesDirection(
  e: Expense,
  signal: { direction: StatementLineDirection },
  accountId: string
): boolean {
  const type = e.type ?? 'expense';
  if (signal.direction === 'debit') {
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
   *  adjacent statement (settlement lag) rather than being truly missing/erroneous. */
  nearEdge: boolean;
  /**
   * Deferred lone-wolf escalation (docs/plans/bank-balance-sync.md §12) — `'escalated'` means this is
   * a real, actionable flag right now; `'provisional'` means it's near this statement's own boundary
   * and no *other* already-completed import's own coverage (extended by the same ±3-day grace window)
   * has yet had a chance to explain it, so it's held back as a soft, non-urgent status instead of an
   * immediate flag. A lone wolf that isn't `nearEdge` at all is always `'escalated'` immediately — the
   * boundary-ambiguity reasoning only applies right at a statement's own edge.
   */
  status: 'provisional' | 'escalated';
}

export interface MatchResult {
  matched: MatchedPair[];
  possible: PossibleMatch[];
  unmatched: ParsedStatementRow[];
  loneWolves: LoneWolf[];
}

/**
 * Two-tier matching, Tier 1 (docs/plans/bank-balance-sync.md §5/§17) — "has this exact statement row
 * already been processed by a previous import?" Normalizes the incoming row's date+amount+narration
 * and checks the account's own import-history records for an identical one already recorded. A hit
 * means this exact line (or an exact reissue of it) was already committed — this is what makes
 * re-importing the same file a clean no-op (plan §15) even though the linked expense may by now
 * already carry a checkpoint (`statementBalance`) that would otherwise make it ineligible for Tier 2
 * (see `matchStatementRows` below — Tier 1 always runs first, and bypasses Tier 2's exclusion
 * entirely on a hit). A linear scan over `importRecords` — no index needed at the scale one account's
 * import history actually reaches; revisit only if that stops being true.
 *
 * KNOWN LIMITATION, not yet fixed (2026-08-28, real-device testing): two statement rows with
 * identical accountId/date/amount/narration (e.g. two same-day cash withdrawals of the same amount)
 * both resolve to the SAME stored import record via this plain `.find()` — the first row claims it
 * correctly, but the second gets the identical record back, sees its linked expense already claimed,
 * and falls through to Tier 2 — which excludes already-checkpointed expenses by design — landing in
 * "unmatched" even though its real counterpart is sitting right there, unclaimed. A fix (excluding
 * already-claimed records from this lookup, so `.find()` naturally advances to the next match for
 * each subsequent identical-looking row) was implemented and reverted the same day: on a real device,
 * the app crashed at startup (`TypeError: Cannot read property 'create' of undefined`) with that fix
 * present, and stopped crashing across 5 consecutive clean launches with it reverted — but the same
 * crash could NOT be reproduced with the fix present in an isolated debug-build+emulator test, leaving
 * genuine ambiguity about whether this function was really the cause or a stale release-build cache
 * was. Deferred rather than re-risked; revisit with a clean bisection before re-attempting.
 */
function findProvenanceMatch(
  row: ParsedStatementRow,
  accountId: string,
  importRecords: BankStatementImportRecord[],
  narrationOverrides: BankNarrationOverride[]
): BankStatementImportRecord | undefined {
  const normalizedKey = normalizeNarration(row.rawNarration, narrationOverrides);
  return importRecords.find(
    (r) =>
      r.accountId === accountId &&
      r.date === row.date &&
      isExactAmount(r.amount, row.amount) &&
      r.normalizedKey === normalizedKey
  );
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
  statementRows: ParsedStatementRow[],
  /** Every OTHER already-completed import batch's own covered range for this account (docs/plans/
   *  bank-balance-sync.md §11b/§12) — i.e. `Account.coveredStatementRanges`, which by construction
   *  never yet includes the current, still-uncommitted import. Defaults to `[]` (deferred escalation
   *  then degrades to "every near-edge lone wolf stays provisional," which is still correct — there's
   *  simply no other completed import on record yet to have already failed to explain it). */
  otherCoveredRanges: { start: number; end: number }[] = []
): LoneWolf[] {
  if (statementRows.length === 0) return [];
  const statementStart = Math.min(...statementRows.map((r) => r.date));
  const statementEnd = Math.max(...statementRows.map((r) => r.date));
  return pool
    .filter((e) => !referencedIds.has(e.id) && e.date >= statementStart && e.date <= statementEnd)
    .map((e) => {
      const nearEdge = e.date - statementStart <= CANDIDATE_WINDOW_MS || statementEnd - e.date <= CANDIDATE_WINDOW_MS;
      // Not near either boundary — this isn't a boundary-ambiguity case at all, so escalate immediately
      // regardless of any other import's history (§12's control case: "14-Mar, well within March's own
      // range, not boundary-adjacent" → escalated now, not deferred).
      const anAdjacentImportAlreadyFailedToExplainIt =
        nearEdge &&
        otherCoveredRanges.some(
          (r) => e.date >= r.start - CANDIDATE_WINDOW_MS && e.date <= r.end + CANDIDATE_WINDOW_MS
        );
      const status: LoneWolf['status'] =
        nearEdge && !anAdjacentImportAlreadyFailedToExplainIt ? 'provisional' : 'escalated';
      return { expense: e, nearEdge, status };
    });
}

/**
 * Initial automatic matching pass for one statement import (docs/plans/bank-statement-import.md
 * §5) — a pure function; manual overrides/reassignment of any pairing (including confident
 * "Matched" ones) are applied afterward by the UI layer's own staged-review state, not here.
 *
 * Two-tier matching (docs/plans/bank-balance-sync.md §5/§17), per row: Tier 1 is
 * `findProvenanceMatch()` above — an exact hit is treated as matched immediately, without running any
 * fuzzy logic, and regardless of whether the linked expense already carries a checkpoint. Tier 2 is
 * the original fuzzy date-window/amount/narration matching below, with one added filter: any expense
 * that already has a checkpoint (`statementBalance != null`) — necessarily from a *different* import,
 * since an identical row from the *same* already-checkpointed import would have hit Tier 1 — is
 * removed from the candidate pool entirely, for both the confident-auto-match and "possible match"
 * paths. This is what stops an unrelated, later statement's own coincidentally-same-amount row from
 * being silently absorbed into "confirming" a link to an already-reconciled transaction.
 *
 * @param allExpenses every recorded transaction (any account) — filtered internally to this
 *   account's own expense/income legs plus any transfer touching it either way.
 * @param reconciliationDescription `RECONCILIATION_DESCRIPTION` from `core/expenses/cashFlowSummary.ts`
 *   — synthetic reconcile-adjustment entries are excluded from matching/lone-wolf candidacy entirely.
 * @param importRecords this account's own prior `BankStatementImportRecord`s, for Tier 1's exact
 *   provenance lookup. Defaults to `[]` (Tier 1 is then simply a no-op) so every existing caller/test
 *   that doesn't yet pass this keeps working unchanged.
 * @param narrationOverrides fed straight through to Tier 1's own `normalizeNarration()` call — same
 *   overrides list the rest of this module already threads through elsewhere. Defaults to `[]`.
 * @param otherCoveredRanges this account's own other already-completed import batches' covered ranges
 *   (docs/plans/bank-balance-sync.md §12, plan §7 Stage 2) — fed straight through to
 *   `deriveLoneWolves()`'s own deferred-escalation logic. Defaults to `[]`.
 */
export function matchStatementRows(
  statementRows: ParsedStatementRow[],
  accountId: string,
  allExpenses: Expense[],
  reconciliationDescription: string,
  importRecords: BankStatementImportRecord[] = [],
  narrationOverrides: BankNarrationOverride[] = [],
  otherCoveredRanges: { start: number; end: number }[] = []
): MatchResult {
  if (statementRows.length === 0) {
    return { matched: [], possible: [], unmatched: [], loneWolves: [] };
  }

  const pool = allExpenses.filter(
    (e) => e.description !== reconciliationDescription && (e.accountId === accountId || e.toAccountId === accountId)
  );
  const expensesById = new Map(allExpenses.map((e) => [e.id, e]));

  const claimed = new Set<string>();
  const referenced = new Set<string>();
  const matched: MatchedPair[] = [];
  const possible: PossibleMatch[] = [];
  const unmatched: ParsedStatementRow[] = [];

  for (const row of statementRows) {
    // Tier 1 — exact provenance lookup. A hit is an already-processed row; matched immediately, no
    // fuzzy logic, and not subject to Tier 2's checkpoint exclusion below.
    const provenance = findProvenanceMatch(row, accountId, importRecords, narrationOverrides);
    const provenanceExpense = provenance ? expensesById.get(provenance.linkedTxnId) : undefined;
    if (provenanceExpense && !claimed.has(provenanceExpense.id)) {
      matched.push({ statementRow: row, expense: provenanceExpense });
      claimed.add(provenanceExpense.id);
      referenced.add(provenanceExpense.id);
      continue;
    }

    // Tier 2 — fuzzy matching, excluding any expense already checkpointed by a different import
    // (docs/plans/bank-balance-sync.md §17): `e.statementBalance == null` guards the candidate pool.
    const available = pool.filter(
      (e) =>
        !claimed.has(e.id) &&
        e.statementBalance == null &&
        matchesDirection(e, row, accountId) &&
        Math.abs(e.date - row.date) <= CANDIDATE_WINDOW_MS
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

    // No exact-amount candidate within the date window — per 2026-08-06 decision, a "possible match"
    // requires the exact statement amount (only the date window is a tolerance); a merely close amount
    // is no longer enough to surface an unrelated recorded expense as a candidate. The user can still
    // manually search/reassign any existing expense from the "no match" bucket's own picker.
    unmatched.push(row);
  }

  const loneWolves = deriveLoneWolves(pool, referenced, statementRows, otherCoveredRanges);

  return { matched, possible, unmatched, loneWolves };
}

export interface PossibleTransferSuggestion {
  /** The other account this row might be the counterpart leg of a transfer with — never the account
   *  currently being imported. */
  account: Account;
  /** The already-recorded plain expense/income on that other account this row's amount/date coincides
   *  with — shown to the user as the "why" (never auto-applied silently). */
  expense: Expense;
}

/**
 * Shared candidate-gathering logic for `suggestPossibleTransfer`/`suggestAmbiguousTransferCandidates`
 * below — a much softer, amount/date-only heuristic than `matchStatementRows` itself: for a statement
 * row, checks whether some OTHER account has an already-recorded plain expense/income (never a
 * transfer or an IOU-linked entry — see the doc comments below) with the opposite money direction, a
 * matching or close amount, within the same ±3-day window `matchStatementRows` uses. Returns every
 * qualifying candidate, in no particular order — callers decide what "0 / 1 / many" means for their
 * own purpose (a confident single suggestion vs. a genuinely ambiguous choice).
 */
function findTransferCandidates(
  row: ParsedStatementRow,
  currentAccountId: string,
  allExpenses: Expense[],
  accounts: Account[],
  reconciliationDescription: string
): PossibleTransferSuggestion[] {
  const wantType: 'income' | 'expense' = row.direction === 'debit' ? 'income' : 'expense';
  const candidates = allExpenses.filter(
    (e) =>
      e.description !== reconciliationDescription &&
      (e.type ?? 'expense') === wantType &&
      !!e.accountId &&
      e.accountId !== currentAccountId &&
      Math.abs(e.date - row.date) <= CANDIDATE_WINDOW_MS &&
      (isExactAmount(e.amount, row.amount) || isCloseAmount(e.amount, row.amount))
  );
  const out: PossibleTransferSuggestion[] = [];
  for (const e of candidates) {
    if (!e.accountId) continue;
    const account = accounts.find((a) => a.id === e.accountId);
    if (!account) continue;
    out.push({ account, expense: e });
  }
  return out;
}

/**
 * A much softer, amount/date-only heuristic than `matchStatementRows` itself — for a statement row
 * that has NO existing candidate at all (no recorded transfer already links it, no plain expense on
 * this same account), checks whether some OTHER account has an already-recorded plain expense/income
 * (never a transfer or an IOU-linked entry — see below) with the opposite money direction, a matching
 * or close amount, within the same ±3-day window `matchStatementRows` uses. A hit suggests "this might
 * be the other side of a transfer you haven't linked yet."
 *
 * Deliberately narrow, per 2026-08-05 discussion:
 * - Only ever returns a suggestion when exactly one candidate qualifies — a tie is left unresolved
 *   (never guesses which of several equally-plausible candidates is the right one, same principle
 *   `matchStatementRows` itself follows for its own "possible" bucket). See
 *   `suggestAmbiguousTransferCandidates` below (docs/plans/bank-balance-sync.md §13's "genuine
 *   ambiguity" case) for the sibling function a caller can use to surface that tie as a choice instead
 *   of silently dropping it.
 * - Never touches the candidate's own account/type — accepting this suggestion only marks *this* row
 *   as a transfer; the other leg stays whatever it already was. Retroactively converting an existing
 *   transaction's own type is the separate, explicitly-deferred "editable everywhere" feature — this
 *   function doesn't (and structurally can't, since it takes read-only `Expense[]`) reach into that.
 * - Cannot be confused with a Lent/Borrowed (IOU) entry: an IOU-linked transaction is still a plain
 *   `type: 'expense'` or `'income'` (never `'transfer'`), so it looks identical to a genuine one-off
 *   payment at this function's level — this is a real, inherent ambiguity (a payment to a friend can
 *   coincidentally match a payment to your own other account by amount/date), which is exactly why
 *   this only ever surfaces as a dismissible suggestion, never an auto-classification. The user's own
 *   judgment (do I recognize this as my own transfer, or was it actually to a person?) is the real
 *   disambiguator — no field in the data model distinguishes the two cases up front.
 */
export function suggestPossibleTransfer(
  row: ParsedStatementRow,
  currentAccountId: string,
  allExpenses: Expense[],
  accounts: Account[],
  reconciliationDescription: string
): PossibleTransferSuggestion | null {
  const candidates = findTransferCandidates(row, currentAccountId, allExpenses, accounts, reconciliationDescription);
  if (candidates.length !== 1) return null;
  const [only] = candidates;
  return only ?? null;
}

/**
 * Sibling to `suggestPossibleTransfer` above (docs/plans/bank-balance-sync.md §13, §7 Stage 6) —
 * exists purely to distinguish "no suggestion" from "a genuine ambiguity the user must resolve."
 * `suggestPossibleTransfer` already refuses to guess among 2+ equally-plausible candidates (returning
 * `null`, same as the 0-candidate case) — this function returns that full tied set instead, so a
 * caller can surface it as an explicit choice (mockup `bank-balance-sync-v2.html` §7's "Which
 * transaction is this transfer?" picker, including its "Neither — keep both separate" outcome) rather
 * than silently dropping it. Returns `null` for 0 or exactly 1 candidate — those aren't ambiguous, and
 * are already `suggestPossibleTransfer`'s own job.
 */
export function suggestAmbiguousTransferCandidates(
  row: ParsedStatementRow,
  currentAccountId: string,
  allExpenses: Expense[],
  accounts: Account[],
  reconciliationDescription: string
): PossibleTransferSuggestion[] | null {
  const candidates = findTransferCandidates(row, currentAccountId, allExpenses, accounts, reconciliationDescription);
  return candidates.length > 1 ? candidates : null;
}

/**
 * Converts an EXISTING candidate expense (found by `suggestPossibleTransfer`/
 * `suggestAmbiguousTransferCandidates`) into a proper cross-account transfer, absorbing it rather than
 * leaving it duplicated alongside a brand-new record (found + fixed 2026-08-09 — a real on-device bug:
 * two separate records both debiting the source account for the same real-world transfer, corrupting
 * that account's own already-verified checkpoint history). Mirrors `cashWithdrawalCodes.ts`'s
 * `applyCashTransferConversion()` in spirit, but must handle BOTH directions, since which side of the
 * candidate is "source" vs "destination" depends on its own recorded type:
 *
 * - `candidate.type === 'expense'` (or unset, which defaults to `'expense'` per this codebase's own
 *   convention — see `Expense.type`'s own doc comment) — money already left `candidate.accountId`;
 *   that's the transfer's SOURCE. `currentAccountId` (the account whose statement is being imported
 *   right now, receiving a credit row) is the DESTINATION. Same shape as `applyCashTransferConversion`:
 *   only `type`/`toAccountId` change, `accountId` is untouched.
 * - `candidate.type === 'income'` — money already arrived at `candidate.accountId`; that's the
 *   transfer's DESTINATION. `currentAccountId` (importing a debit row) is the SOURCE. `accountId` must
 *   be REASSIGNED to `currentAccountId`, and `toAccountId` set to the candidate's OWN original
 *   `accountId` — a genuinely different transformation, not just adding a field.
 *
 * Nothing else about the expense (amount, date, description, category, hashtags, `statementBalance` if
 * it already carries one from ITS OWN prior import) is touched — this must stay a pure type/account-field
 * conversion, exactly like `applyCashTransferConversion`.
 */
export function convertCandidateToTransfer(candidate: Expense, currentAccountId: string, now: number): Expense {
  const type = candidate.type ?? 'expense';
  if (type === 'expense') {
    return { ...candidate, type: 'transfer', toAccountId: currentAccountId, updatedAt: now };
  }
  // Destination branch — `candidate.accountId` is optional at the type level, but every real caller
  // (`suggestPossibleTransfer`/`suggestAmbiguousTransferCandidates`, via `findTransferCandidates`'s own
  // `!!e.accountId` filter) only ever produces a candidate with it set. Conditional spread (not a bare
  // property) per this package's `exactOptionalPropertyTypes` convention (see `checkpointDiagnostics.ts`'s
  // own doc comment) — omits `toAccountId` entirely rather than explicitly setting it to `undefined` in
  // the unreachable case a caller ever passes one without an `accountId`.
  return {
    ...candidate,
    type: 'transfer',
    accountId: currentAccountId,
    ...(candidate.accountId !== undefined && { toAccountId: candidate.accountId }),
    updatedAt: now
  };
}
