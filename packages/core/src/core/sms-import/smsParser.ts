// Parses one raw SMS (sender + body + received timestamp) against a pattern bundle
// (`smsPatterns.ts`) into a structured transaction candidate, or a specific non-match reason.
// docs/plans/sms-transaction-tracking.md §5.
//
// Deliberately returns a discriminated outcome rather than `| null` — the caller (and the
// user-facing "N SMS from known banks couldn't be parsed" counter / unparsed-messages screen) needs
// to tell apart "this sender isn't a bank Penny recognizes at all" from "this IS a recognized bank
// sender, but no template matched its wording" — very different outcomes for the user, collapsed by
// a bare boolean/null result.
import type { BankPresetId } from '@/core/db/types';
import { parseStatementDate } from '@/core/bank-import/csvParser';
import type { SmsPatternBundle, SmsTransactionType } from './smsPatterns';

export interface ParsedSmsCandidate {
  bankId: BankPresetId;
  transactionType: SmsTransactionType;
  direction: 'debit' | 'credit';
  amount: number;
  /** Resolved transaction date — the template's own captured `date` group if present and parseable,
   *  else `receivedAt` (plan §5/§8). */
  date: number;
  accountLast4?: string | undefined;
  cardLast4?: string | undefined;
  counterparty?: string | undefined;
  referenceNumber?: string | undefined;
  balance?: number | undefined;
}

export type SmsParseOutcome =
  | { kind: 'parsed'; candidate: ParsedSmsCandidate }
  /** Sender matched a known bank's `senderIdPatterns`, but no template in its list matched the body
   *  — the "unparsed" bucket (plan §5/§7, 2026-08-15 addition): kept visible/exportable, never
   *  silently dropped. */
  | { kind: 'unparsed_known_bank'; bankId: BankPresetId }
  /** Sender didn't match any bank's `senderIdPatterns` at all — not a bank Penny currently
   *  recognizes (or not a bank SMS at all). Deliberately NOT surfaced anywhere by default (unlike
   *  `unparsed_known_bank`) — showing/exporting arbitrary non-bank-sender text would be a much
   *  bigger privacy overreach than this feature's scope. */
  | { kind: 'unrecognized_sender' }
  /** Belt-and-suspenders exclusion — checked before any bank/template matching at all, so an OTP
   *  message can never accidentally satisfy a transactional template. */
  | { kind: 'excluded_otp' };

/** Named capture groups `smsParser.ts` looks for — kept as a literal union (not just `string`) so
 *  `SmsTemplateTraceEntry.captureRanges`' keys are typed precisely. Named to match the verified
 *  real-world regex source's own convention (`account`/`card`/`reference`/`date`, 2026-08-18),
 *  not `ParsedSmsCandidate`'s own field names — the two are deliberately decoupled (see the
 *  explicit mapping in `traceSms()` below), so this rename doesn't touch `ParsedSmsCandidate` or
 *  any of its consumers. */
export type SmsCaptureGroupName = 'amount' | 'account' | 'card' | 'counterparty' | 'reference' | 'balance' | 'date';

/** One template's attempt against a single message — the unit `traceSms()` records one of per
 *  template belonging to a sender-matched bank (2026-08-16, SMS parser verifier tool §2/§3: "there's
 *  no way to know if a message was checked against all configured [templates] or only a single
 *  one"). */
export interface SmsTemplateTraceEntry {
  bankId: BankPresetId;
  transactionType: SmsTransactionType;
  /** Same free-text label `SmsTemplateEntry.addedAt` carries — not parsed, purely for display. */
  addedAt: string;
  /** False once an earlier template for this same message already matched — `parseSms`'s own
   *  behavior is "first structural match wins," so a later template is never actually evaluated in
   *  production once that happens. Recording it as `attempted: false` (rather than silently
   *  omitting it, or misleadingly evaluating and reporting `matched: false`) is what lets the
   *  verifier tool show "2 of 3 not tried — already matched on template 1" faithfully, instead of
   *  implying an ambiguity that was never actually reachable. */
  attempted: boolean;
  matched: boolean;
  candidate?: ParsedSmsCandidate;
  /** Start/end character offsets into the original `body` for each named group THIS template's
   *  regex defines and actually captured — present only when `matched`. Powers highlighting the raw
   *  SMS text (`body.slice(...range)` recovers the exact substring each field came from). Requires
   *  compiling the regex with the `d` (`hasIndices`) flag, only done here — `parseSms`'s own
   *  historical `i`-only compilation is untouched, since a per-attempt trace is the only consumer
   *  that needs this. */
  captureRanges?: Partial<Record<SmsCaptureGroupName, [number, number]>>;
}

/** Full diagnostic trace for one message — `parseSms()` below is now a thin wrapper returning just
 *  `.outcome`, kept for every existing caller so nothing else in the codebase needs to change. */
export interface SmsParseTrace {
  excludedAsOtp: boolean;
  /** Every bank whose `senderIdPatterns` matched this sender — normally 0 or 1; a list only because
   *  nothing technically prevents two configured banks' patterns from overlapping. */
  matchedSenderBanks: BankPresetId[];
  /** Every template belonging to a sender-matched bank, in bundle order — see `attempted` above for
   *  why this isn't simply "every template, matched or not." Empty when `matchedSenderBanks` is
   *  empty (nothing to attempt) or when `excludedAsOtp`. */
  attempts: SmsTemplateTraceEntry[];
  /** Identical semantics/shape to `parseSms()`'s own return value — the first `matched` attempt's
   *  candidate, or the appropriate non-match kind. */
  outcome: SmsParseOutcome;
}

const DIRECTION_BY_TYPE: Record<SmsTransactionType, 'debit' | 'credit'> = {
  debit: 'debit',
  upi_sent: 'debit',
  card_swipe: 'debit',
  credit: 'credit',
  upi_received: 'credit',
  refund: 'credit'
};

const OTP_EXCLUSION_KEYWORDS = [
  'otp',
  'one time password',
  'one-time password',
  'verification code',
  'is your otp',
  'do not share',
  'never share your otp'
];

function looksLikeOtp(body: string): boolean {
  const lower = body.toLowerCase();
  return OTP_EXCLUSION_KEYWORDS.some((k) => lower.includes(k));
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

/** Exported (not just an internal const) so the SMS parser verifier tool can warn a template author
 *  when their regex's `(?<name>...)` uses a name outside this list — such a group compiles fine and
 *  can even still make `matched` true (if `amount` is separately present), but its value is silently
 *  dropped here: never read into `candidate`, never present in `captureRanges`, so it won't be
 *  extracted or highlighted in production either. */
export const CAPTURE_GROUP_NAMES: SmsCaptureGroupName[] = [
  'amount',
  'account',
  'card',
  'counterparty',
  'reference',
  'balance',
  'date'
];

/** Full per-template diagnostic trace against `bundle` — the single implementation both `parseSms()`
 *  (below) and the standalone SMS parser verifier tool (`tools/sms-parser-verifier/`) are built on,
 *  so there is exactly one copy of the matching logic. */
export function traceSms(sender: string, body: string, receivedAt: number, bundle: SmsPatternBundle): SmsParseTrace {
  if (looksLikeOtp(body)) {
    return { excludedAsOtp: true, matchedSenderBanks: [], attempts: [], outcome: { kind: 'excluded_otp' } };
  }

  const senderTrimmed = sender.trim();
  const matchedSenderBanks: BankPresetId[] = [];
  const attempts: SmsTemplateTraceEntry[] = [];
  let outcome: SmsParseOutcome | null = null;

  for (const bank of bundle.banks) {
    const senderMatches = bank.senderIdPatterns.some((p) => new RegExp(p, 'i').test(senderTrimmed));
    if (!senderMatches) continue;
    matchedSenderBanks.push(bank.bankId);

    for (const template of bank.templates) {
      // Once an earlier template already won, every later one (across every sender-matched bank,
      // not just this one) is recorded as un-attempted, never actually regex-evaluated — mirrors
      // parseSms's own real "first match wins, stop looking" short-circuit exactly.
      if (outcome) {
        attempts.push({
          bankId: bank.bankId,
          transactionType: template.transactionType,
          addedAt: template.addedAt,
          attempted: false,
          matched: false
        });
        continue;
      }

      // 'd' (hasIndices) flag alongside the existing 'i' — only this trace path needs capture
      // offsets, so parseSms's own historical compilation is left untouched.
      const m = new RegExp(template.pattern, 'id').exec(body) as
        | (RegExpExecArray & {
            indices?: Partial<Record<SmsCaptureGroupName, [number, number]>> & {
              groups?: Partial<Record<SmsCaptureGroupName, [number, number]>>;
            };
          })
        | null;

      const amountRaw = m?.groups?.amount;
      const amount = amountRaw ? parseAmount(amountRaw) : NaN;
      const matched = !!m?.groups && !!amountRaw && Number.isFinite(amount) && amount > 0;

      let candidate: ParsedSmsCandidate | undefined;
      let captureRanges: SmsTemplateTraceEntry['captureRanges'];

      if (matched && m?.groups) {
        let date = receivedAt;
        if (m.groups.date && template.dateFormat) {
          const parsed = parseStatementDate(m.groups.date, template.dateFormat);
          if (parsed !== null) date = parsed;
        }
        candidate = {
          bankId: bank.bankId,
          transactionType: template.transactionType,
          direction: DIRECTION_BY_TYPE[template.transactionType],
          amount,
          date,
          accountLast4: m.groups.account,
          cardLast4: m.groups.card,
          counterparty: m.groups.counterparty?.trim(),
          referenceNumber: m.groups.reference,
          balance: m.groups.balance ? parseAmount(m.groups.balance) : undefined
        };
        const indexGroups = m.indices?.groups;
        if (indexGroups) {
          captureRanges = {};
          for (const name of CAPTURE_GROUP_NAMES) {
            const range = indexGroups[name];
            if (range) captureRanges[name] = range;
          }
        }
      }

      attempts.push({
        bankId: bank.bankId,
        transactionType: template.transactionType,
        addedAt: template.addedAt,
        attempted: true,
        matched,
        ...(candidate ? { candidate } : {}),
        ...(captureRanges ? { captureRanges } : {})
      });

      if (matched && candidate) outcome = { kind: 'parsed', candidate };
    }
  }

  if (!outcome) {
    outcome = matchedSenderBanks[0]
      ? { kind: 'unparsed_known_bank', bankId: matchedSenderBanks[0] }
      : { kind: 'unrecognized_sender' };
  }

  return { excludedAsOtp: false, matchedSenderBanks, attempts, outcome };
}

/** Thin wrapper over `traceSms()` — same signature/behavior as always, every existing caller
 *  (`processRawSms.ts`, the review UI, all 30 existing tests) is unaffected. */
export function parseSms(sender: string, body: string, receivedAt: number, bundle: SmsPatternBundle): SmsParseOutcome {
  return traceSms(sender, body, receivedAt, bundle).outcome;
}

/** Masks every digit in `text` — the default transform for the unparsed-messages copy/export screen
 *  (plan §5/§7, 2026-08-15 addition): safe to share outside the device (account numbers, balances,
 *  reference numbers all become unreadable) while preserving the surrounding wording/structure a
 *  new template would actually be written from. An explicit "copy unmasked" action bypasses this —
 *  never the default. */
export function redactDigits(text: string): string {
  return text.replace(/\d/g, '#');
}
