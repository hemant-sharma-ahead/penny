// Small pure helpers shared by every consumer that turns a raw SMS (or an already-stored
// `SmsTransactionRecord`) into the shapes `smsAccountMatch.ts`/`smsTransactionMatch.ts` operate on —
// promoted here from `apps/mobile/src/features/sms-tracking/` (2026-08-15) once a second, non-React
// consumer (the native-capture Headless JS task, via `processRawSms.ts` in this same directory) needed
// the exact same logic: no React/hook dependency here at all, so this always belonged in `packages/core`
// rather than a UI feature module — the hook now just wraps it.
import type { SmsTransactionRecord } from '@/core/db/types';
import type { ParsedSmsCandidate } from './smsParser';
import type { OtherSmsCandidate } from './smsTransactionMatch';

/**
 * Stable, non-cryptographic string hash (cyrb53-style — two 32-bit mixing lanes combined into one
 * ~53-bit value) — good enough for the Tier-1 exact-provenance dedup key
 * (docs/plans/sms-transaction-tracking.md §4a/§6) `SmsTransactionRecord.contentHash` needs: detecting
 * "have I already processed this literal message" across re-scans, never a cryptographic guarantee.
 */
function stableHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Tier-1 dedup key — hash of (sender, receivedAt, body). Same literal message re-scanned (a repeated
 *  historical backfill, an app restart mid-scan, or a re-drain of the native pending queue) always
 *  produces the same hash. */
export function computeSmsContentHash(sender: string, receivedAt: number, body: string): string {
  return stableHash(`${sender} ${receivedAt} ${body}`);
}

/** Reads a field this file's own invariant guarantees is present, failing loudly (never a silent `!`
 *  assertion — this repo's lint config forbids those outright) if that invariant is ever actually
 *  violated, rather than smuggling a `undefined` through as if it were real data. */
function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`SmsTransactionRecord missing '${field}' — expected on every non-'unparsed' record`);
  }
  return value;
}

/**
 * Reconstructs a `ParsedSmsCandidate` from an already-stored `SmsTransactionRecord`, for re-running
 * `resolveSmsAccount`/`matchSmsAgainstExpenses`/`findPossibleDuplicateSms` after the user resolves a
 * review-queue item (the account, possible-match, or duplicate-SMS actions all need the same candidate
 * shape the original ingestion computed, but only the record itself is at hand by then).
 *
 * The `required()` reads below hold by this file's own established invariant: every `SmsTransactionRecord`
 * reaching one of the resolution actions has `status !== 'unparsed'` (only an unparsed record lacks these
 * fields — see `SmsTransactionRecord`'s own doc comment, "Absent only when status === 'unparsed'"), and
 * every action below is only ever invoked for a `'needs_review'` or `'ready'` record.
 */
export function recordToCandidate(record: SmsTransactionRecord): ParsedSmsCandidate {
  return {
    bankId: required(record.bankId, 'bankId'),
    transactionType: required(record.transactionType, 'transactionType'),
    direction: required(record.direction, 'direction'),
    amount: required(record.amount, 'amount'),
    date: required(record.date, 'date'),
    ...(record.accountLast4 !== undefined && { accountLast4: record.accountLast4 }),
    ...(record.cardLast4 !== undefined && { cardLast4: record.cardLast4 }),
    ...(record.counterparty !== undefined && { counterparty: record.counterparty }),
    ...(record.referenceNumber !== undefined && { referenceNumber: record.referenceNumber }),
    ...(record.balance !== undefined && { balance: record.balance })
  };
}

/** Adapts every OTHER already-parsed SMS record (excluding `excludeId`) into `findPossibleDuplicateSms`'s
 *  minimal `OtherSmsCandidate` shape — only records with a resolved account and extracted date/amount/
 *  direction are eligible (i.e. `'ready'` or `'needs_review'`; `'unparsed'` records have none of these
 *  fields, `'linked'`/`'dismissed'` are no longer live candidates for a NEW duplicate flag). */
export function otherSmsCandidates(records: SmsTransactionRecord[], excludeId: string): OtherSmsCandidate[] {
  return records
    .filter(
      (
        r
      ): r is SmsTransactionRecord & {
        accountId: string;
        date: number;
        amount: number;
        direction: 'debit' | 'credit';
      } =>
        r.id !== excludeId &&
        (r.status === 'ready' || r.status === 'needs_review') &&
        r.accountId !== undefined &&
        r.date !== undefined &&
        r.amount !== undefined &&
        r.direction !== undefined
    )
    .map((r) => ({ id: r.id, accountId: r.accountId, date: r.date, amount: r.amount, direction: r.direction }));
}
