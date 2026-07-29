// Account resolution for import (packages/core/src/core/import/) — every imported transaction must end
// up with a real accountId; none may go account-less (an explicit product requirement, since Penny's
// net-worth/cash-flow views assume every transaction belongs to an account). Real exports vary: some
// (Cashew) carry a per-row account column; some formats have none at all, in which case the whole batch
// gets a single one-time account prompt instead of per-row resolution.
import type { Account, AccountType } from '@/core/db/types';
import type { ParsedRow } from './importParsers';

export type AccountAction =
  | { kind: 'existing'; accountId: string; accountName: string }
  | { kind: 'create'; suggestedName: string; suggestedType: AccountType };

export interface AccountResolution {
  sourceName: string;
  count: number;
  suggestion: AccountAction;
  /** Set when `suggestion` is 'create' (no EXACT match) but a normalized-fuzzy match was found against
   *  a real existing account (e.g. source name "HDFC XX1234" vs an existing account "HDFC1234"). Never
   *  auto-applied — the review UI surfaces this as an explicit "same account, written differently?"
   *  confirm/dismiss banner (mirroring the same-file merge-suggestion pattern); `suggestion.kind` only
   *  becomes 'existing' once the user accepts it. */
  fuzzyExistingMatch?: { accountId: string; accountName: string };
}

/** Normalizes an account name for fuzzy matching: strips punctuation/whitespace and the masking "x"
 *  banks put before the last few digits of an account number (e.g. "HDFC-x1234" -> "hdfc1234",
 *  matching "HDFC1234"). Deliberately simple — a false-negative here just means no suggestion is
 *  shown, never a wrong auto-merge. Shared by the same-file merge suggestion
 *  (apps/web-react/src/features/import/review/accountMergeSuggestion.ts) and the existing-account
 *  fuzzy match below — this used to be UI-only, but it's core matching logic used from two places, so
 *  it lives here instead of being duplicated (the prior restriction keeping it out of packages/core
 *  was scoped to a different, already-completed task and no longer applies). */
export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]/g, '')
    .replace(/x+(?=\d)/g, '');
}

function suggestAccountType(name: string): AccountType {
  const lower = name.toLowerCase();
  if (lower === 'cash' || lower.includes('cash')) return 'cash';
  if (lower.includes('credit') || /\bcc\b/.test(lower)) return 'credit_card';
  if (lower.includes('wallet') || lower.includes('paytm') || lower.includes('upi')) return 'wallet';
  return 'bank';
}

function suggestForAccountName(name: string, accounts: Account[]): AccountAction {
  const lower = name.toLowerCase().trim();
  const direct = accounts.find((a) => a.name.toLowerCase() === lower);
  if (direct) return { kind: 'existing', accountId: direct.id, accountName: direct.name };
  return { kind: 'create', suggestedName: name, suggestedType: suggestAccountType(name) };
}

/** Finds a normalized-fuzzy (not exact) match for `name` against real existing accounts — used only
 *  when no exact match was found (see suggestForAccountName above). */
function findFuzzyExistingMatch(
  name: string,
  accounts: Account[]
): { accountId: string; accountName: string } | undefined {
  const target = normalize(name);
  if (!target) return undefined;
  const match = accounts.find((a) => normalize(a.name) === target);
  return match ? { accountId: match.id, accountName: match.name } : undefined;
}

/** One suggested resolution per distinct raw account name found in the parsed rows. Returns an empty
 *  array when no row carries an account at all — the wizard interprets that as "no account column in
 *  this file" and shows a single whole-batch account picker instead of this per-value list. */
export function resolveAccounts(rows: ParsedRow[], accounts: Account[]): AccountResolution[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.account) continue;
    counts.set(row.account, (counts.get(row.account) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([sourceName, count]) => {
      const suggestion = suggestForAccountName(sourceName, accounts);
      const fuzzyExistingMatch =
        suggestion.kind === 'create' ? findFuzzyExistingMatch(sourceName, accounts) : undefined;
      return {
        sourceName,
        count,
        suggestion,
        ...(fuzzyExistingMatch && { fuzzyExistingMatch })
      };
    })
    .sort((a, b) => b.count - a.count);
}
