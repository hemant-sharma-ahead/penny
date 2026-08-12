import type { BankNarrationOverride } from '@/core/db/types';

/** Generic connector keywords that never identify a merchant — dropped before deriving the key.
 *  `ACH`/`INW`/`OUT`/`REV` added 2026-08-03 after running real sample statements (7 banks) through
 *  this heuristic and finding them leak into the key as noise — e.g. `ACH CR/DIVIDEND INCOME/TCS
 *  LTD` produced `ACH DIVIDEND INCOME TCS LTD` instead of `DIVIDEND INCOME TCS LTD`, and `IMPS
 *  INW/.../GPAY REWARD CASHBACK` produced `INW GPAY REWARD CASHBACK`. `SENT`/`RECEIVED` were
 *  deliberately NOT added despite the same leaking pattern (`SENT TO X`/`RECEIVED FROM X` → `SENT
 *  X`/`RECEIVED X`) — explicit user decision to keep `SENT`/`RECEIVED` transactions grouped
 *  separately by direction, since bulk-categorize's Lent/Borrowed panel relies on that split (sent =
 *  lent, received = borrowed). */
const CONNECTOR_KEYWORDS = new Set([
  'UPI',
  'NEFT',
  'IMPS',
  'RTGS',
  'ACH',
  'POS',
  'ATM',
  'TXN',
  'TRANSACTION',
  'REF',
  'VPA',
  'PAYMENT',
  'TO',
  'FROM',
  'THE',
  'AND',
  'DR',
  'CR',
  'BY',
  'CLG',
  'CHQ',
  'CHEQUE',
  'ECS',
  'NACH',
  'MANDATE',
  'INW',
  'OUT',
  'REV',
  // Added 2026-08-05, from the same user-sourced universal-codes research as
  // `cashWithdrawalCodes.ts`'s per-bank cash-withdrawal table. `SI`, bare `I`/`W` (from "I/W CLG"),
  // and `INT` were deliberately left out — too short/generic (1-3 letters), real risk of stripping an
  // actual merchant's initials/name instead of noise.
  'INFT',
  'TPT',
  'ONL',
  'ECOM',
  'EMI',
  'RET',
  'CHG',
  'TAX',
  'AMB',
  'AQB',
  'VPS',
  'IPS'
]);

/** Read-only, alphabetically-sorted view of the same keywords — for display on the "Merchant
 *  recognition" screen (docs/features/bank-import.md), so the fixed heuristic isn't invisible next to
 *  the user's own editable overrides list. Not user-editable itself; a code change, not a settings
 *  change, is what updates this. */
export const CONNECTOR_KEYWORDS_LIST: readonly string[] = Array.from(CONNECTOR_KEYWORDS).sort();

function isMostlyNumeric(token: string): boolean {
  const digits = (token.match(/\d/g) ?? []).length;
  return digits >= token.length / 2;
}

export const UNKNOWN_MERCHANT_KEY = 'UNKNOWN';

/**
 * Raw narration → normalized merchant key (docs/plans/bank-statement-import.md §9a): split on
 * common delimiters, drop numeric-ish reference tokens and generic connector keywords, uppercase
 * and join whatever alphabetic token(s) remain. Deterministic and does not self-learn — `overrides`
 * (a manual keyword/substring → key mapping, always wins) is how this improves without a code
 * change, once real statements expose a gap the heuristic gets wrong.
 */
export function normalizeNarration(rawNarration: string, overrides: BankNarrationOverride[] = []): string {
  const upper = rawNarration.toUpperCase();
  for (const o of overrides) {
    if (upper.includes(o.keyword.toUpperCase())) return o.normalizedKey;
  }

  const tokens = rawNarration
    .split(/[-/\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !isMostlyNumeric(t))
    .filter((t) => !CONNECTOR_KEYWORDS.has(t.toUpperCase()))
    .filter((t) => /[A-Za-z]/.test(t));

  if (tokens.length === 0) return UNKNOWN_MERCHANT_KEY;
  return tokens.map((t) => t.toUpperCase()).join(' ');
}

/**
 * A normalized merchant key (all-caps, e.g. "ACH DIVIDEND INCOME TCS LTD") → a generalized default
 * description for the bulk-categorize modal's Description field, so a merchant seen for the first
 * time (no `MerchantSuggestion` yet) doesn't start blank. Short tokens (≤3 letters) are kept upper-
 * case since they're overwhelmingly acronyms/suffixes in Indian bank narrations (ACH, TCS, LTD, UPI),
 * longer ones are title-cased. Always editable — never silently relied on as the final description.
 */
export function prettifyMerchantKey(key: string): string {
  return key
    .split(' ')
    .map((t) => (t.length <= 3 ? t : t.charAt(0) + t.slice(1).toLowerCase()))
    .join(' ');
}
