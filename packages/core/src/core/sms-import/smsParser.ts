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
  /** Resolved transaction date — the template's own captured `dateStr` if present and parseable,
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

export function parseSms(sender: string, body: string, receivedAt: number, bundle: SmsPatternBundle): SmsParseOutcome {
  if (looksLikeOtp(body)) return { kind: 'excluded_otp' };

  const senderTrimmed = sender.trim();
  let matchedBank: BankPresetId | null = null;

  for (const bank of bundle.banks) {
    const senderMatches = bank.senderIdPatterns.some((p) => new RegExp(p, 'i').test(senderTrimmed));
    if (!senderMatches) continue;
    matchedBank = bank.bankId;

    for (const template of bank.templates) {
      const m = new RegExp(template.pattern, 'i').exec(body);
      if (!m?.groups) continue;

      const amountRaw = m.groups.amount;
      if (!amountRaw) continue; // a template without a captured amount can never be a real match
      const amount = parseAmount(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      let date = receivedAt;
      if (m.groups.dateStr && template.dateFormat) {
        const parsed = parseStatementDate(m.groups.dateStr, template.dateFormat);
        if (parsed !== null) date = parsed;
      }

      const candidate: ParsedSmsCandidate = {
        bankId: bank.bankId,
        transactionType: template.transactionType,
        direction: DIRECTION_BY_TYPE[template.transactionType],
        amount,
        date,
        accountLast4: m.groups.acctLast4,
        cardLast4: m.groups.cardLast4,
        counterparty: m.groups.counterparty?.trim(),
        referenceNumber: m.groups.ref,
        balance: m.groups.balance ? parseAmount(m.groups.balance) : undefined
      };
      return { kind: 'parsed', candidate };
    }
  }

  return matchedBank ? { kind: 'unparsed_known_bank', bankId: matchedBank } : { kind: 'unrecognized_sender' };
}

/** Masks every digit in `text` — the default transform for the unparsed-messages copy/export screen
 *  (plan §5/§7, 2026-08-15 addition): safe to share outside the device (account numbers, balances,
 *  reference numbers all become unreadable) while preserving the surrounding wording/structure a
 *  new template would actually be written from. An explicit "copy unmasked" action bypasses this —
 *  never the default. */
export function redactDigits(text: string): string {
  return text.replace(/\d/g, '#');
}
