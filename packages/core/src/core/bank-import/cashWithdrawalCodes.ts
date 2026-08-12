import type { Expense } from '@/core/db/types';
import type { BankPresetId } from './types';

export interface CashWithdrawalCodeSeed {
  /** Stable, deterministic id (not a random UUID) — same convention as `DEFAULT_PAYMENT_MODES`, so
   *  re-seeding is idempotent by content, not just gated behind the once-per-version AsyncStorage
   *  flag (a defensive second layer, same reasoning as `usePaymentModes.ts`). */
  id: string;
  bankId: BankPresetId | 'any';
  code: string;
  label: string;
}

/**
 * Researched defaults for auto-classifying a bank statement line as a cash withdrawal — narration
 * codes that mean "this debit is you pulling your own cash out," which should land as a Transfer to
 * the user's cash account instead of a plain expense (2026-08-05, see `docs/plans/bank-statement-
 * import.md`'s transfer-marking work). This is the second, more thorough pass — the first version
 * (7 codes, one per bank) was replaced 2026-08-05 with a per-bank table the user sourced directly
 * (own-ATM / other-bank-ATM / branch-withdrawal, across all 7 supported banks), consolidated here so
 * a code used by several banks under the same name (ATW, NWD, NFS, EAW, ATM, WDL, ...) lives once in
 * the bank-agnostic `'any'` group instead of being duplicated per bank. Treat this as a well-
 * researched starting point, not a guarantee — the management screen (Settings → Bank cash-
 * withdrawal codes, `BankCashWithdrawalCodesPage.tsx`) exists specifically so a wrong/missing code
 * can be corrected or added the moment a real statement doesn't match, without needing an app update.
 *
 * Confidence notes:
 * - `kotak`'s `ATL` (other-bank ATM) is the one first-party-sourced entry (Kotak Mahindra's own
 *   official help-center page, fetched directly) — kept bank-specific since Kotak's own naming for
 *   the other-bank case genuinely differs from every other bank's.
 * - Everything else comes from the user's own aggregated research across the 7 supported banks, not
 *   an official per-bank document for each one — a reasonable, sourced starting point, still not a
 *   guarantee for any single bank's exact current statement format.
 * - `'ATM'` bare (own-bank code for SBI/ICICI/BOB/HSBC per the table) is the single riskiest entry
 *   for false positives — it's a real word that could appear in an unrelated narration (an ATM annual
 *   fee, an ATM card replacement charge, ...). `isCashWithdrawalNarration`'s exclusion list (REV/POS/
 *   AQB/AMB) guards the most likely of those; if it still over-fires on a specific statement, this is
 *   exactly the entry to delete from the settings screen for that bank.
 */
export const BANK_CASH_WITHDRAWAL_CODE_SEEDS: CashWithdrawalCodeSeed[] = [
  // Bank-agnostic — used identically (or near-identically) across several/all of the 7 supported
  // banks, per the user's own research table.
  { id: 'cwc-any-atw', bankId: 'any', code: 'ATW', label: 'Own-bank ATM withdrawal (HDFC/Kotak/ICICI/IndusInd)' },
  { id: 'cwc-any-nwd', bankId: 'any', code: 'NWD', label: 'Other-bank ATM withdrawal (network)' },
  { id: 'cwc-any-nfs', bankId: 'any', code: 'NFS', label: 'Interbank ATM withdrawal (National Financial Switch)' },
  { id: 'cwc-any-eaw', bankId: 'any', code: 'EAW', label: 'Electronic Automated Withdrawal (other-bank/network)' },
  { id: 'cwc-any-self', bankId: 'any', code: 'SELF', label: 'Self-cheque / self-withdrawal at a branch counter' },
  { id: 'cwc-any-atmwdl', bankId: 'any', code: 'ATM WDL', label: 'ATM withdrawal (generic)' },
  {
    id: 'cwc-any-atm',
    bankId: 'any',
    code: 'ATM',
    label: 'Own-bank ATM withdrawal (SBI/ICICI/BOB/HSBC) — broad, watch for false positives'
  },
  { id: 'cwc-any-wdl', bankId: 'any', code: 'WDL', label: 'Withdrawal (generic)' },
  { id: 'cwc-any-cshw', bankId: 'any', code: 'CSHW', label: 'Cash withdrawal (generic)' },
  { id: 'cwc-any-cwdr', bankId: 'any', code: 'CWDR', label: 'Cash withdrawal at a branch counter' },
  { id: 'cwc-any-cashwdl', bankId: 'any', code: 'CASH WDL', label: 'Cash withdrawal (branch, generic phrase)' },
  { id: 'cwc-any-ccwd', bankId: 'any', code: 'CCWD', label: 'Cardless cash withdrawal' },
  // Per-bank — genuinely unique naming, not shared with any other supported bank.
  { id: 'cwc-kotak-atl', bankId: 'kotak', code: 'ATL', label: 'Other-bank ATM withdrawal' },
  { id: 'cwc-icici-mat', bankId: 'icici', code: 'MAT', label: 'Other-bank ATM withdrawal (Merchant ATM Transaction)' },
  { id: 'cwc-icici-vat', bankId: 'icici', code: 'VAT', label: 'Other-bank ATM withdrawal (Visa ATM Transaction)' },
  { id: 'cwc-sbi-ats', bankId: 'sbi', code: 'ATS', label: 'Own-bank ATM withdrawal (Automatic Transfer Service)' },
  { id: 'cwc-sbi-csw', bankId: 'sbi', code: 'CSW', label: 'Cash withdrawal' },
  {
    id: 'cwc-bob-nfswdl',
    bankId: 'bob',
    code: 'NFS_WDL',
    label: 'Other-bank ATM withdrawal (National Financial Switch)'
  },
  { id: 'cwc-bob-cashdebit', bankId: 'bob', code: 'CASH DEBIT', label: 'Branch cash withdrawal' },
  { id: 'cwc-hsbc-cwdl', bankId: 'hsbc', code: 'CWDL', label: 'ATM cash withdrawal' },
  { id: 'cwc-hsbc-branchcash', bankId: 'hsbc', code: 'BRANCH CASH', label: 'Branch cash withdrawal' }
];

/** Narration codes that mean the line is definitely *not* a cash withdrawal even if a withdrawal
 *  code also appears in it — checked before anything else in `isCashWithdrawalNarration`. Found
 *  2026-08-05: a bare `'ATM'` code (see the seed list above) would otherwise false-positive-match an
 *  ATM transaction *reversal* ("ATM REV" — a failed withdrawal being credited back, not a real one)
 *  or a fee narration mentioning ATM (AMB/AQB non-maintenance charges). POS (a card purchase) is
 *  included defensively even though it's unlikely to textually collide with a withdrawal code. */
const EXCLUDED_CODES = ['REV', 'POS', 'AQB', 'AMB'];

/** Builds a case-insensitive regex for one code: multi-word codes (e.g. "ATM WDL", "CASH DEBIT")
 *  tolerate *any* separator — a space, slash, dash, or nothing at all — between the words, rather
 *  than requiring the exact literal string. Found 2026-08-05: "ATM WDL" (space-separated, as typed
 *  into the settings screen) never matched a real statement's "ATM/WDL" (slash-separated) narration,
 *  since the old implementation matched the code as one fixed literal phrase.
 *
 *  The word-boundary check on both ends only blocks on an *adjacent letter* (`SELF` must not match
 *  inside `SELFRIDGES`), not a digit — a reference number is very often butted up directly against
 *  the code with no separator at all (`ATMWDL123456`), and that must still match. Using `[^A-Z]`/a
 *  negative lookahead rather than the original `[^A-Z0-9]` is what fixes that second case, found in
 *  the same pass as the separator bug above. */
function buildCodePattern(code: string): RegExp {
  const words = code
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const middle = words.join('[\\s/.\\-]*');
  return new RegExp(`(^|[^A-Z])${middle}(?![A-Z])`, 'i');
}

/**
 * Whole-word/whole-phrase, case-insensitive match against a raw statement narration — checks the
 * specific bank's own codes plus every bank-agnostic (`'any'`) one. Deliberately a word-boundary
 * match, not a plain substring test, so a short code like "SELF" doesn't false-positive match inside
 * an unrelated merchant name that happens to contain those letters (e.g. "SELFRIDGES"). Returns
 * `false` immediately if the narration contains any `EXCLUDED_CODES` entry, regardless of what
 * withdrawal code might also be present.
 */
export function isCashWithdrawalNarration(
  narration: string,
  bankId: BankPresetId | 'any',
  codes: { bankId: string; code: string }[]
): boolean {
  const upper = narration.toUpperCase();
  if (EXCLUDED_CODES.some((code) => buildCodePattern(code).test(upper))) return false;
  const relevant = codes.filter((c) => c.bankId === bankId || c.bankId === 'any');
  return relevant.some((c) => buildCodePattern(c.code).test(upper));
}

export interface CashTransferSuggestion {
  suggestedType: 'transfer';
  /** Only set when exactly one cash account exists — left `undefined` when there are none or
   *  several, so the caller's UI can prompt the user to choose rather than guess which one. */
  toAccountId?: string;
}

/** Combines `isCashWithdrawalNarration` with cash-account resolution: a confident match with exactly
 * one `'cash'`-type account produces a fully-resolved suggestion (pre-fill and done); a match with
 * zero or several cash accounts still suggests Transfer (the narration evidence doesn't change) but
 * leaves `toAccountId` for the caller to resolve — e.g. `PossibleBucket.tsx`/`UnmatchedBucket.tsx`
 * prompt with a cash-accounts-only picker in that case. Returns `null` when the narration doesn't
 * match any cash-withdrawal code at all. */
export function suggestCashTransfer(
  rawNarration: string,
  bankId: BankPresetId | 'any',
  codes: { bankId: string; code: string }[],
  cashAccounts: { id: string }[]
): CashTransferSuggestion | null {
  if (!isCashWithdrawalNarration(rawNarration, bankId, codes)) return null;
  return {
    suggestedType: 'transfer',
    ...(cashAccounts.length === 1 && cashAccounts[0] ? { toAccountId: cashAccounts[0].id } : {})
  };
}

/**
 * Retroactive sibling to `suggestCashTransfer` above (docs/plans/bank-balance-sync.md §3 decision #2,
 * §17 Finding 1, §7 Stage 7) — for a statement row that *matched an already-existing plain `Expense`*
 * rather than building a brand-new one. The narration-matching logic is identical (delegates straight
 * to `suggestCashTransfer`, no separate detection rule); the only addition is the one guard that's
 * meaningless for a brand-new row but essential here: never re-suggest a conversion for an expense
 * that's already a `'transfer'` (nothing to retroactively fix — this is the exact "matched row that
 * already resolved to an existing type: 'transfer' expense" regression case). Returns `null` either
 * way there's nothing to suggest — same "no guess, just evidence" contract as `suggestCashTransfer`.
 */
export function suggestRetroactiveCashTransfer(
  matchedExpense: Pick<Expense, 'type'>,
  rawNarration: string,
  bankId: BankPresetId | 'any',
  codes: { bankId: string; code: string }[],
  cashAccounts: { id: string }[]
): CashTransferSuggestion | null {
  if (matchedExpense.type === 'transfer') return null;
  return suggestCashTransfer(rawNarration, bankId, codes, cashAccounts);
}

/**
 * Applies an accepted cash-transfer suggestion to an already-existing `Expense` (the retroactive path,
 * §17 Finding 1) — mirrors exactly what accepting the identical suggestion already does for a
 * brand-new row (`suggestedType`/`toAccountId` pre-filled straight into the new transaction at
 * creation time, see `PossibleBucket.tsx`/`UnmatchedBucket.tsx`'s `addingNew`/transfer-branch
 * handling): the expense's own `type` becomes `'transfer'` and `toAccountId` becomes the chosen cash
 * account. Deliberately touches nothing else (`description`/`categoryId`/etc. stay exactly as the user
 * already recorded them) — unlike a brand-new row, this expense already has real, user-entered content
 * worth preserving; only the mis-typed direction is being corrected.
 */
export function applyCashTransferConversion(expense: Expense, toAccountId: string, now: number): Expense {
  return { ...expense, type: 'transfer', toAccountId, updatedAt: now };
}
