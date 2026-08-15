// The single, platform-agnostic implementation of "what happens when one raw SMS
// (sender/body/receivedAt) needs to become a `SmsTransactionRecord`" (docs/plans/sms-transaction-
// tracking.md §3/§4/§6) — consumed identically by:
//   - `apps/mobile/src/features/sms-tracking/useSmsTracking.ts`'s `processRawSms` (the foreground
//     manual-scan path — `~/lib/smsCapture.ts`'s `scanSmsInbox` calls it once per historical message).
//   - `apps/mobile/src/lib/smsHeadlessTask.ts` (the native live-capture path's Headless JS task, and
//     its documented on-next-foreground-drain fallback — see that file's own doc comment for why both
//     exist).
//
// Extracted here — rather than living only inside the React hook, where it originally lived —
// specifically because a Headless JS task has no React tree to call a hook from. This is the "exactly
// one implementation" the native capture layer's own build note requires: the hook wraps this
// function (and re-exposes `deriveStatusForAccount` for its own resolution actions), it never
// reimplements it.
//
// Deliberately takes every dependency as a plain argument (arrays, no `EncryptedRepository` calls of
// its own) rather than reading storage directly — the caller already has (or can freshly fetch)
// whichever snapshot of accounts/mappings/expenses/records is right for its own context (a live,
// memoized snapshot for the hook; a fresh `getAll()` for the headless task), and this function has no
// need to care which, or to decide how the resulting record gets persisted.
import type { Account, Expense, SmsAccountMapping, SmsTransactionRecord } from '@/core/db/types';
import { inferPaymentMode } from '@/core/expenses/paymentModeInference';
import { getSmsPatternBundle } from './smsPatterns';
import { parseSms, type ParsedSmsCandidate } from './smsParser';
import { resolveSmsAccount } from './smsAccountMatch';
import { matchSmsAgainstExpenses, findPossibleDuplicateSms } from './smsTransactionMatch';
import { computeSmsContentHash, otherSmsCandidates } from './smsRecordHelpers';

export interface ProcessRawSmsContext {
  accounts: Account[];
  mappings: SmsAccountMapping[];
  expenses: Expense[];
  /** Every other still-live `SmsTransactionRecord` (any status) — used for Tier-1 `contentHash`
   *  dedup and the SMS-vs-SMS duplicate check (plan §4b). Must include records from every prior
   *  scan/capture, not just ones from the current run, or dedup/duplicate-detection would miss
   *  cross-run duplicates. */
  records: SmsTransactionRecord[];
}

/**
 * Derives the correct status/reviewReason for a resolved account against its candidate (plan §4) —
 * shared by `processRawSmsCore` (a brand-new record) and `useSmsTracking.ts`'s
 * `resolveAmbiguousAccount` (re-run after the user maps a previously-unmapped sender), so both paths
 * apply the exact same match → duplicate-check derivation. `base` must not already carry a stale
 * `reviewReason`/`possibleMatchExpenseIds`/`possibleDuplicateSmsIds` — callers strip those first.
 */
export function deriveStatusForAccount(
  candidate: ParsedSmsCandidate,
  accountId: string,
  base: SmsTransactionRecord,
  ctx: Pick<ProcessRawSmsContext, 'expenses' | 'records'>
): SmsTransactionRecord {
  const now = Date.now();
  const accountExpenses = ctx.expenses.filter((e) => e.accountId === accountId || e.toAccountId === accountId);
  const matchResult = matchSmsAgainstExpenses(candidate, accountId, accountExpenses);

  if (matchResult.kind === 'matched') {
    const { rawBody: _rawBody, ...rest } = base;
    void _rawBody;
    return { ...rest, accountId, status: 'linked', linkedTxnId: matchResult.expenseId, updatedAt: now };
  }
  if (matchResult.kind === 'reconciled_conflict') {
    return {
      ...base,
      accountId,
      status: 'needs_review',
      reviewReason: 'reconciled_date_conflict',
      possibleMatchExpenseIds: [matchResult.expenseId],
      updatedAt: now
    };
  }
  if (matchResult.kind === 'possible') {
    return {
      ...base,
      accountId,
      status: 'needs_review',
      reviewReason: 'possible_match',
      possibleMatchExpenseIds: matchResult.expenseIds,
      updatedAt: now
    };
  }
  // 'none' — check for a possible-duplicate SMS against every other still-live record for this same
  // account before settling on 'ready' (plan §4b: this check runs for every account-resolved record
  // with no Expense match, not just brand-new ones).
  const others = otherSmsCandidates(ctx.records, base.id);
  const dupIds = findPossibleDuplicateSms(candidate, accountId, others);
  if (dupIds.length > 0) {
    return {
      ...base,
      accountId,
      status: 'needs_review',
      reviewReason: 'possible_duplicate_sms',
      possibleDuplicateSmsIds: dupIds,
      updatedAt: now
    };
  }
  return { ...base, accountId, status: 'ready', updatedAt: now };
}

/**
 * Parses and resolves one raw SMS into the `SmsTransactionRecord` it should become, or `undefined`
 * when nothing should be persisted at all (a Tier-1 dedup hit, an OTP-excluded message, or a sender
 * Penny doesn't recognize as any known bank — plan §5). Never throws on a recognized-but-unmatched
 * message; only a genuinely unexpected failure (e.g. `getSmsPatternBundle()` itself somehow
 * rejecting, which it's documented never to do) would propagate — callers are expected to catch
 * regardless, per CLAUDE.md's never-hard-crash rule.
 *
 * Callers persist the returned record themselves (via whichever repository access they have) — this
 * function never writes anything itself, so it stays usable from a context with no live
 * `EncryptedRepository`-backed state to update incrementally (the headless task).
 */
export async function processRawSmsCore(
  sender: string,
  body: string,
  receivedAt: number,
  ctx: ProcessRawSmsContext
): Promise<SmsTransactionRecord | undefined> {
  const contentHash = computeSmsContentHash(sender, receivedAt, body);
  if (ctx.records.some((r) => r.contentHash === contentHash)) return undefined; // Tier-1 dedup

  const bundle = await getSmsPatternBundle();
  const outcome = parseSms(sender, body, receivedAt, bundle);
  const now = Date.now();

  if (outcome.kind === 'excluded_otp' || outcome.kind === 'unrecognized_sender') return undefined;

  if (outcome.kind === 'unparsed_known_bank') {
    return {
      id: crypto.randomUUID(),
      contentHash,
      sender,
      rawBody: body,
      receivedAt,
      bankId: outcome.bankId,
      status: 'unparsed',
      createdAt: now,
      updatedAt: now
    };
  }

  const candidate = outcome.candidate;
  const base: SmsTransactionRecord = {
    id: crypto.randomUUID(),
    contentHash,
    sender,
    rawBody: body,
    receivedAt,
    date: candidate.date,
    amount: candidate.amount,
    direction: candidate.direction,
    transactionType: candidate.transactionType,
    bankId: candidate.bankId,
    paymentModeGuess: inferPaymentMode(candidate.counterparty ?? '').id,
    status: 'needs_review',
    createdAt: now,
    updatedAt: now,
    ...(candidate.counterparty !== undefined && { counterparty: candidate.counterparty }),
    ...(candidate.accountLast4 !== undefined && { accountLast4: candidate.accountLast4 }),
    ...(candidate.cardLast4 !== undefined && { cardLast4: candidate.cardLast4 }),
    ...(candidate.referenceNumber !== undefined && { referenceNumber: candidate.referenceNumber }),
    ...(candidate.balance !== undefined && { balance: candidate.balance })
  };

  const accountMatch = resolveSmsAccount(candidate, ctx.accounts, ctx.mappings);
  if (accountMatch.kind === 'ambiguous') {
    return { ...base, status: 'needs_review', reviewReason: 'ambiguous_account' };
  }
  return deriveStatusForAccount(candidate, accountMatch.accountId, base, ctx);
}
