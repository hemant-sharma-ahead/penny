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

// ─── apps/mobile-only "skip this account" widening (2026-08-14, manual-testing gap #1) ────────────────
// A user importing a file spanning several accounts may only want some of them — there was no way to
// exclude an account (and every row belonging to it) rather than importing all of them. Deliberately
// NEW, additive types here — NOT a `'skip'` member added to `AccountAction`/`AccountResolution`
// themselves — because `apps/web-react`'s frozen `useImport.ts` narrows over `AccountAction`'s exact
// existing 2-member union in a couple of places (`kind === 'existing' ? ... : suggestion.suggestedName`
// -style ternaries); widening the shared type breaks that narrowing's compilation even though web never
// actually produces or reads a 'skip' value at runtime. `resolveAccounts()` itself is untouched — it
// never returns 'skip' either way, exclusively a user-initiated state apps/mobile's own Accounts stage
// introduces on top of a resolution `resolveAccounts()` already produced.
export type AccountActionOrSkip =
  | AccountAction
  /** Excludes this source account — and every row that belongs to it — from the import entirely.
   *  Mirrors `CategoryAction`'s existing `'skip'` kind. Always immediately "decided" — same treatment
   *  `'existing'` already gets — since there's nothing further to configure once skipped. */
  | { kind: 'skip' };

/** `AccountResolution`, widened to allow `AccountActionOrSkip` instead of the narrower `AccountAction`
 *  — see the file-header comment above for why this is a separate type. `resolveAccounts()`'s own
 *  return type (`AccountResolution[]`) is structurally assignable to `AccountResolutionOrSkip[]`
 *  (widening a union is always a safe assignment), so apps/mobile can store `resolveAccounts()`'s
 *  output directly in state typed this way without any cast. */
export interface AccountResolutionOrSkip extends Omit<AccountResolution, 'suggestion'> {
  suggestion: AccountActionOrSkip;
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

// ─── Card→account merge suggestion (2026-08-14, CSV-import redesign §9.7, Issue #9) ──────────────────
// Additive — a NEW function alongside `findFuzzyExistingMatch`/`resolveAccounts` above, for
// apps/mobile's new Accounts wizard stage only. `resolveAccounts()` itself is untouched, so
// `apps/web-react`'s frozen direct call to it keeps its exact existing behavior.

export interface CardAccountMergeSuggestion {
  /** Source name of the card-type resolution (e.g. `"HDFC Bank •• 4471"`). */
  cardSourceName: string;
  /** Source name of the resolution to merge into — shares the same (normalized) Bank Name and isn't
   *  itself a card row. Named by its RAW source name, regardless of that resolution's own kind
   *  (existing/create) — the suggestion still shows and can be accepted "regardless of the bank row's
   *  own resolution state" (confirmed 2026-08-14, post-mockup-review). */
  targetSourceName: string;
  /** Payment mode to apply to the card's rows once merged, derived from its own Account Type. */
  paymentMode: 'Debit Card' | 'Credit Card';
}

function normalizeCardAccountType(raw: string): 'debit-card' | 'credit-card' | null {
  const lower = raw.toLowerCase().replace(/[-_\s]/g, '');
  if (lower.includes('creditcard')) return 'credit-card';
  if (lower.includes('debitcard')) return 'debit-card';
  return null;
}

/** One suggestion per distinct source account name whose rows carry a card-type `Account Type`
 *  (`debit-card`/`credit-card`) AND share a normalized `Bank Name` with another resolution's rows — e.g.
 *  a real MoneyView export's "Account Id"-keyed card row sharing "HDFC Bank" with the underlying bank
 *  account's own resolution. Independent suggestion per card (confirmed 2026-08-14, post-mockup-review —
 *  no bulk "merge all cards on this bank" shortcut); never auto-applied, same as the existing same-file
 *  (`suggestAccountMerges`, apps/mobile's own review/accountMergeSuggestion.ts) and fuzzy-vs-existing
 *  (`findFuzzyExistingMatch` above) suggestion types this is visually/behaviorally parallel to. */
export function suggestCardAccountMerges(
  rows: ParsedRow[],
  // Deliberately the narrowest shape this function actually reads (only `sourceName`) rather than the
  // full `AccountResolution[]` — so a caller storing a WIDER per-row type (e.g. apps/mobile's own
  // `AccountResolutionOrSkip[]`, once "skip this account" exists) can pass it straight through with no
  // cast. This function never reads `.suggestion` at all.
  resolutions: Pick<AccountResolution, 'sourceName'>[]
): CardAccountMergeSuggestion[] {
  const bankNameBySource = new Map<string, string>();
  const cardTypeBySource = new Map<string, 'debit-card' | 'credit-card' | null>();

  for (const row of rows) {
    if (!row.account) continue;
    if (!bankNameBySource.has(row.account) && row.bankName) bankNameBySource.set(row.account, row.bankName);
    if (!cardTypeBySource.has(row.account)) {
      cardTypeBySource.set(row.account, row.accountType ? normalizeCardAccountType(row.accountType) : null);
    }
  }

  const suggestions: CardAccountMergeSuggestion[] = [];
  for (const res of resolutions) {
    const cardType = cardTypeBySource.get(res.sourceName);
    if (!cardType) continue;
    const bank = bankNameBySource.get(res.sourceName);
    if (!bank) continue;
    const bankKey = normalize(bank);
    if (!bankKey) continue;

    const target = resolutions.find((other) => {
      if (other.sourceName === res.sourceName) return false;
      const otherBank = bankNameBySource.get(other.sourceName);
      if (!otherBank || normalize(otherBank) !== bankKey) return false;
      // Never suggest merging a card INTO another card row — the target must be the underlying
      // (non-card) bank account itself.
      return !cardTypeBySource.get(other.sourceName);
    });
    if (!target) continue;

    suggestions.push({
      cardSourceName: res.sourceName,
      targetSourceName: target.sourceName,
      paymentMode: cardType === 'credit-card' ? 'Credit Card' : 'Debit Card'
    });
  }

  return suggestions;
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
