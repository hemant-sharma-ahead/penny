// Cash-withdrawal → transfer suggestion GROUPING (packages/core/src/core/import/) — extracted out of
// apps/mobile's useImport.ts (2026-08-23, item 71 follow-up, real-device report) so this partitioning
// logic is unit-testable without a React hook harness (apps/mobile has no test infra of its own; every
// other pure import-pipeline concern already lives here for the same reason).
//
// Real-device finding: a single cash-withdrawal-suspect category (e.g. "Cash Withdrawal") can span every
// bank account the user ever pulled cash from — a real report showed one 217-row group spanning multiple
// accounts, which the FIRST version of item 71's fix collapsed into one suggestion with a vague
// "Multiple accounts" aggregate label instead of anything actionable. Fixed by partitioning each
// category group's ELIGIBLE rows (not already claimed by a confirmed transfer pair) by their own raw CSV
// source account BEFORE producing a suggestion — one suggestion per (category, source account) pair,
// each independently acceptable/dismissable/undoable, instead of one suggestion per category.
import { isLikelyCashWithdrawal } from './importCategoryResolution';
import type { ParsedRow } from './importParsers';

/** Sentinel partition key for a cash-withdrawal-suspect row that carries NO CSV account value at all (a
 *  format with no account column, or a blank cell) — grouped together as their own candidate rather than
 *  folded in with any real account's rows. The only genuinely unresolvable case left once every OTHER
 *  candidate always shares exactly one real raw source account by construction. */
export const CASH_WITHDRAWAL_NO_ACCOUNT_KEY = '__no_account__';

/** The minimal shape this function actually reads from a category-resolution row-group — deliberately
 *  narrower than apps/mobile's own `CategoryRowGroup` (which lives in useImport.ts, not here) so this
 *  function has no dependency on that app-specific type. */
export interface CashWithdrawalGroupInput {
  fullKey: string;
  label: string;
  type: 'expense' | 'income' | 'transfer';
  /** The source category name itself — `isLikelyCashWithdrawal` is checked against this. */
  parentSourceName: string;
  rowIndices: number[];
}

/** One (category, source-account) candidate — the unit `useImport.ts` turns into a real
 *  `CashWithdrawalSuggestion` by additionally resolving `accountKey` to a real Penny `Account` (needs
 *  live account-resolution state this function has no access to, and isn't given here on purpose). */
export interface CashWithdrawalCandidate {
  /** Unique identity — `${fullKey}::${accountKey}` — since one category group can now produce 2+
   *  candidates (one per source account). */
  key: string;
  fullKey: string;
  label: string;
  count: number;
  /** Indices into `rows` for exactly this candidate's own rows — one source account's worth, not already
   *  claimed by a confirmed transfer pair. */
  rowIndices: number[];
  /** The raw CSV account name every row in this candidate shares, or `CASH_WITHDRAWAL_NO_ACCOUNT_KEY`. */
  accountKey: string;
}

/** Partitions every cash-withdrawal-suspect category group's ELIGIBLE rows (not already claimed by a
 *  confirmed `transferPairs` pairing) by their own raw CSV source account, producing one
 *  `CashWithdrawalCandidate` per (category, source account) pair — never one aggregate candidate per
 *  category regardless of how many distinct accounts its rows actually span. A candidate whose `key` is
 *  in `dismissedKeys` is omitted entirely (mirrors the pre-2026-08-23 behavior of a dismissed whole-
 *  category suggestion never reappearing, just scoped to one source account now instead of the whole
 *  category). */
export function groupCashWithdrawalCandidates(
  rows: ParsedRow[],
  categoryGroups: CashWithdrawalGroupInput[],
  transferPairs: { outgoingIndex: number; incomingIndex: number }[],
  dismissedKeys: Set<string>
): CashWithdrawalCandidate[] {
  const pairedIndices = new Set<number>();
  for (const p of transferPairs) {
    pairedIndices.add(p.outgoingIndex);
    pairedIndices.add(p.incomingIndex);
  }

  const candidates: CashWithdrawalCandidate[] = [];
  for (const g of categoryGroups) {
    if (g.type !== 'expense' || !isLikelyCashWithdrawal(g.parentSourceName)) continue;
    const eligibleIndices = g.rowIndices.filter((i) => !pairedIndices.has(i));
    if (eligibleIndices.length === 0) continue;

    const bySourceAccount = new Map<string, number[]>();
    for (const i of eligibleIndices) {
      const accountKey = rows[i]?.account ?? CASH_WITHDRAWAL_NO_ACCOUNT_KEY;
      const list = bySourceAccount.get(accountKey);
      if (list) list.push(i);
      else bySourceAccount.set(accountKey, [i]);
    }

    for (const [accountKey, rowIndices] of bySourceAccount) {
      const key = `${g.fullKey}::${accountKey}`;
      if (dismissedKeys.has(key)) continue;
      candidates.push({ key, fullKey: g.fullKey, label: g.label, count: rowIndices.length, rowIndices, accountKey });
    }
  }
  return candidates;
}
