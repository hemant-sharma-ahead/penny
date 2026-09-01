// Resolves a parsed SMS candidate to one of the user's configured `Account`s.
// docs/plans/sms-transaction-tracking.md §3.
import type { Account, BankPresetId, SmsAccountMapping } from '@/core/db/types';
import { normalize } from '@/core/import/importAccountResolution';
import type { ParsedSmsCandidate } from './smsParser';

export type SmsAccountMatch =
  | { kind: 'resolved'; accountId: string }
  /** No confident resolution — surfaced as a one-time "which account is this for?" prompt (plan §3).
   *  `candidateAccountIds` is the (possibly empty) shortlist worth offering first, e.g. every
   *  non-archived account at the same bank when there's more than one. */
  | { kind: 'ambiguous'; candidateAccountIds: string[] };

/** Display labels for the fuzzy Account.name match tier below only — NOT the same list as
 *  `core/bank-import/presets.ts`'s `BANK_PRESETS` (those exist for CSV column-mapping guesses, a
 *  different purpose, and don't cover every `BankPresetId` this module needs). Deliberately a small,
 *  separate map rather than forcing bank-import to add CSV presets for banks it has no import-format
 *  guess for. */
const BANK_LABELS: Record<BankPresetId, string> = {
  hdfc: 'HDFC Bank',
  icici: 'ICICI Bank',
  kotak: 'Kotak Bank',
  sbi: 'SBI',
  indusind: 'IndusInd Bank',
  hsbc: 'HSBC',
  bob: 'Bank of Baroda',
  axis: 'Axis Bank',
  yesbank: 'Yes Bank',
  pnb: 'PNB',
  canara: 'Canara Bank',
  idfcfirst: 'IDFC FIRST Bank',
  custom: 'Bank'
};

/** Stable mapping key for the `'bank_string'` tier — `bankId` + `accountLast4` (when known) rather
 *  than free text, so the same bank+tail combination always resolves the same way once a user has
 *  confirmed it, independent of exactly how any one message happens to word things. */
function bankStringKey(candidate: ParsedSmsCandidate): string {
  return `${candidate.bankId}:${candidate.accountLast4 ?? 'unknown'}`;
}

/** Builds the mapping key a caller should persist once the user resolves an `'ambiguous'` result for
 *  this candidate — exported so the review-queue UI writes the SAME key shape this function reads,
 *  never a hand-rolled duplicate. */
export function buildSmsAccountMappingKey(candidate: ParsedSmsCandidate): {
  kind: SmsAccountMapping['kind'];
  mappingKey: string;
} {
  if (candidate.cardLast4) return { kind: 'card_last4', mappingKey: candidate.cardLast4 };
  return { kind: 'bank_string', mappingKey: bankStringKey(candidate) };
}

/**
 * Matching order (plan §3, full rationale there):
 * 1. Card-last4 → account mapping (a card's own last 4 digits differ from its underlying account's —
 *    Penny doesn't track cards as separate accounts, so this tier exists specifically for that case).
 * 2. Bank-string → account mapping (bankId+accountLast4, previously user-confirmed) — wins over a
 *    fresh guess below since the user may have deliberately corrected an earlier resolution.
 * 3. Exact `Account.last4` match, sanity-checked against `bankId` when the account has one set.
 * 4. `bankId` match with exactly one non-archived account at that bank.
 * 5. Fuzzy match: `normalize()` (reused as-is from `core/import/importAccountResolution.ts` — the
 *    exact "HDFC-x8112 vs HDFC Bank XX8112" case) comparing this bank's own display label against
 *    every account name, when it narrows to exactly one account. This is what catches an account
 *    that has neither `last4` nor `bankId` ever set (most accounts created before this feature
 *    shipped) but whose name still clearly names the same bank.
 * 6. Otherwise ambiguous/unmapped — never silently auto-creates or auto-picks (same rule the
 *    CSV-import redesign already established for account resolution generally).
 */
export function resolveSmsAccount(
  candidate: ParsedSmsCandidate,
  accounts: Account[],
  mappings: SmsAccountMapping[]
): SmsAccountMatch {
  const nonArchived = accounts.filter((a) => !a.isArchived);

  if (candidate.cardLast4) {
    const cardMapping = mappings.find((m) => m.kind === 'card_last4' && m.mappingKey === candidate.cardLast4);
    if (cardMapping) return { kind: 'resolved', accountId: cardMapping.accountId };
  }

  const bsKey = bankStringKey(candidate);
  const bankStringMapping = mappings.find((m) => m.kind === 'bank_string' && m.mappingKey === bsKey);
  if (bankStringMapping) return { kind: 'resolved', accountId: bankStringMapping.accountId };

  if (candidate.accountLast4) {
    const last4Matches = nonArchived.filter(
      (a) => a.last4 === candidate.accountLast4 && (!a.bankId || a.bankId === candidate.bankId)
    );
    if (last4Matches.length === 1 && last4Matches[0]) return { kind: 'resolved', accountId: last4Matches[0].id };
    if (last4Matches.length > 1) return { kind: 'ambiguous', candidateAccountIds: last4Matches.map((a) => a.id) };
  }

  const bankIdMatches = nonArchived.filter((a) => a.bankId === candidate.bankId);
  if (bankIdMatches.length === 1 && bankIdMatches[0]) return { kind: 'resolved', accountId: bankIdMatches[0].id };
  if (bankIdMatches.length > 1) return { kind: 'ambiguous', candidateAccountIds: bankIdMatches.map((a) => a.id) };

  // Containment, not exact equality: real account names are usually the bank's name PLUS extra
  // words the user added ("HDFC Bank Savings", "My HDFC Salary A/c") — `normalize()` was built for
  // near-identical strings differing only in formatting/masking (CSV-import's own "HDFC XX1234" vs
  // "HDFC1234" case), which is too strict a comparison here. Either direction containing the other
  // still only narrows, never widens, the match — an account named just "HDFC" is exactly as valid
  // a hit as one named "HDFC Bank Premium Savings Account".
  const label = normalize(BANK_LABELS[candidate.bankId]);
  if (label) {
    const fuzzyMatches = nonArchived.filter((a) => {
      const name = normalize(a.name);
      return !!name && (name.includes(label) || label.includes(name));
    });
    if (fuzzyMatches.length === 1 && fuzzyMatches[0]) return { kind: 'resolved', accountId: fuzzyMatches[0].id };
    if (fuzzyMatches.length > 1) return { kind: 'ambiguous', candidateAccountIds: fuzzyMatches.map((a) => a.id) };
  }

  return { kind: 'ambiguous', candidateAccountIds: [] };
}
