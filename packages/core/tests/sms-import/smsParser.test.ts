import { describe, expect, it } from 'vitest';
import { parseSms, traceSms, redactDigits } from '@/core/sms-import/smsParser';
import { SMS_PATTERNS_FALLBACK } from '@/core/sms-import/smsPatterns';

// Every OTHER bank's sample below is entirely synthetic — fabricated names/numbers/references
// constructed to match each bank's documented public SMS wording conventions, never real message
// text (see docs/plans/sms-transaction-tracking.md's own "gate before native work" step: prove the
// parser against a real spread of samples before touching anything native/Android). HDFC/IndusInd/
// HSBC are the exception (2026-08-18): their `describe` blocks below use real, user-verified message
// wording (with the one real personal name/VPA that appeared in the source messages swapped for a
// placeholder before this file was ever written — see `smsPatterns.ts`'s own HDFC-block comment for
// the full rationale on the schema-fitting choices made converting these).
const BUNDLE = SMS_PATTERNS_FALLBACK;
const RECEIVED = new Date(2026, 7, 15, 10, 30).getTime(); // 15-Aug-2026, arbitrary receive time

describe('parseSms — HDFC (real wording)', () => {
  it('parses a real "Sent" UPI-style debit', () => {
    const body =
      'Sent Rs.1288.15 From HDFC Bank A/C *1234 To IRCTC FULL TRAIN RESERVAT On 08/08/26 Ref 127584388992 Not You?';
    const outcome = parseSms('VM-HDFCBK', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate).toMatchObject({
      bankId: 'hdfc',
      transactionType: 'debit',
      direction: 'debit',
      amount: 1288.15,
      accountLast4: '*1234',
      counterparty: 'IRCTC FULL TRAIN RESERVAT',
      referenceNumber: '127584388992'
    });
  });

  it('parses a real "Credit Alert!" UPI credit, with a correctly-resolved date', () => {
    const body =
      'Credit Alert! Rs.3000.00 credited to HDFC Bank A/c xx1234 on 25-06-25 from VPA 9829172900@ptyes (UPI 287130386996)';
    const outcome = parseSms('AD-HDFCBK', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.transactionType).toBe('credit');
    expect(outcome.candidate.direction).toBe('credit');
    expect(outcome.candidate.amount).toBe(3000);
    expect(outcome.candidate.counterparty).toBe('9829172900@ptyes');
    expect(new Date(outcome.candidate.date).getFullYear()).toBe(2025);
    expect(new Date(outcome.candidate.date).getMonth()).toBe(5); // June, 0-indexed
    expect(new Date(outcome.candidate.date).getDate()).toBe(25);
  });

  it('parses a real debit-card spend alert as card_swipe', () => {
    const body =
      "Alert!You've spent Rs.1107.73 On HDFC Bank Debit Card xx1234 At _RAJAN AUTO CARE.. On 2023-12-04:09:35:53 Avl bal: 317190.91 Not you?";
    const outcome = parseSms('HDFCBK', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate).toMatchObject({
      bankId: 'hdfc',
      transactionType: 'card_swipe',
      amount: 1107.73,
      cardLast4: 'xx1234',
      balance: 317190.91
    });
  });

  it('recognizes the HDFC sender but reports unparsed for unrecognized wording', () => {
    const body = 'HDFC Bank: your account activity summary for this month is now available in the app.';
    const outcome = parseSms('VM-HDFCBK', body, RECEIVED, BUNDLE);
    expect(outcome).toEqual({ kind: 'unparsed_known_bank', bankId: 'hdfc' });
  });
});

describe('parseSms — ICICI', () => {
  it('parses a current-era debit', () => {
    const body =
      'ICICI Bank Acct XX789 debited with Rs 2,500.00 on 15-Aug-26; Merchant Store credited. UPI:123456789012. Call 18002662 for dispute.';
    const outcome = parseSms('VK-ICICIB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate).toMatchObject({
      bankId: 'icici',
      transactionType: 'debit',
      amount: 2500,
      accountLast4: '789',
      counterparty: 'Merchant Store',
      referenceNumber: '123456789012'
    });
  });

  it('parses a current-era credit', () => {
    const body = 'ICICI Bank Acct XX789 credited with Rs 5,000.00 on 15-Aug-26 from John Doe. UPI:123456789013.';
    const outcome = parseSms('ICICIB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.transactionType).toBe('credit');
    expect(outcome.candidate.counterparty).toBe('John Doe');
  });

  it('parses an older-era debit', () => {
    const body = 'ICICI Bank: Acct XX789 debited Rs.1200.00 on 15-08-26 towards Electricity Bill. Avl bal Rs.8000.00';
    const outcome = parseSms('VK-ICICIB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate).toMatchObject({ amount: 1200, counterparty: 'Electricity Bill', balance: 8000 });
  });
});

describe('parseSms — SBI', () => {
  it('parses a current-era debit', () => {
    const body = 'A/C X4567 debited by 500.0 on date 15Aug26 trf to Merchant Name Refno 123456789012 -SBI';
    const outcome = parseSms('VM-SBIINB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate).toMatchObject({
      bankId: 'sbi',
      amount: 500,
      accountLast4: '4567',
      counterparty: 'Merchant Name',
      referenceNumber: '123456789012'
    });
  });

  it('parses a current-era credit', () => {
    const body = 'A/C X4567 credited by 2000.0 on date 15Aug26 by Jane Roe Refno 123456789013 -SBI';
    const outcome = parseSms('SBIINB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.transactionType).toBe('credit');
  });

  it('parses an older-era "Dear Customer" debit', () => {
    const body =
      'Dear Customer, Rs.1200 debited from A/c XX4567 on 15/08/26 transfer to merchant@sbi Ref No123456789012. -SBI';
    const outcome = parseSms('VM-SBIINB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate).toMatchObject({
      amount: 1200,
      counterparty: 'merchant@sbi',
      referenceNumber: '123456789012'
    });
  });
});

describe('parseSms — Axis', () => {
  it('parses a current-era UPI debit', () => {
    const body =
      'Axis Bank: INR 750.00 debited from A/c no. XX3456 on 15-08-2026 towards UPI/P2M/123456789012/Merchant Name. Avl bal: INR 25000.00';
    const outcome = parseSms('VM-AXISBK', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate).toMatchObject({
      bankId: 'axis',
      amount: 750,
      accountLast4: '3456',
      referenceNumber: '123456789012',
      counterparty: 'Merchant Name',
      balance: 25000
    });
  });

  it('parses a current-era UPI credit', () => {
    const body =
      'Axis Bank: INR 900.00 credited to A/c no. XX3456 on 15-08-2026 towards UPI/P2A/123456789013/Jane Roe. Avl bal: INR 25900.00';
    const outcome = parseSms('AXISBK', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.transactionType).toBe('credit');
  });
});

describe('parseSms — Kotak', () => {
  it('parses a UPI debit', () => {
    const body =
      'Rs.300.00 debited from Kotak Bank AC X1122 on 15-08-26 for UPI/merchant@icici/Ref123456789012. Avl Bal Rs.8000.00';
    const outcome = parseSms('VM-KOTAKB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate).toMatchObject({ bankId: 'kotak', amount: 300, accountLast4: '1122', balance: 8000 });
  });

  it('parses a card swipe', () => {
    const body = 'Rs.1200.00 spent on Kotak Debit Card X5566 at Big Bazaar on 15-08-26';
    const outcome = parseSms('KOTAKB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate).toMatchObject({
      bankId: 'kotak',
      transactionType: 'card_swipe',
      direction: 'debit',
      amount: 1200,
      cardLast4: '5566',
      counterparty: 'Big Bazaar'
    });
  });
});

describe('parseSms — remaining current-era-only banks', () => {
  it('parses IndusInd (real wording)', () => {
    const body =
      'INR 200,000.00 is debited from your A/C 159***660960 towards Cheque withdrawal. Avl BAL INR 1,995,939.64 - IndusInd Bank';
    const outcome = parseSms('VM-INDUSB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.bankId).toBe('indusind');
    expect(outcome.candidate.accountLast4).toBe('159***660960');
  });

  it('parses Bank of Baroda', () => {
    const body = 'Your A/c XX9900 is debited by Rs.600.00 on 15-08-2026 towards Grocery Store-Bank of Baroda';
    const outcome = parseSms('VM-BOBTXN', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.bankId).toBe('bob');
  });

  it('parses HSBC (real wording)', () => {
    const body =
      'INR 240.00 is paid from HSBC account XXXXXX1234 to Sharma general Store on 14-Aug-26 with ref 123123123123.';
    const outcome = parseSms('VM-HSBCIN', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.bankId).toBe('hsbc');
    expect(outcome.candidate.accountLast4).toBe('XXXXXX1234');
  });

  it('parses Yes Bank', () => {
    const body = 'Rs.250.00 debited from YES Bank A/c X4455 on 15-08-26 towards UPI/merchant@yesb/Ref123456789012';
    const outcome = parseSms('VM-YESBNK', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.bankId).toBe('yesbank');
  });

  it('parses PNB', () => {
    const body = 'PNB: Rs.800.00 debited from A/c XX6677 on 15-08-2026 for School Fees. Avail Bal Rs.15000.00';
    const outcome = parseSms('VM-PNBSMS', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.bankId).toBe('pnb');
  });

  it('parses Canara Bank', () => {
    const body = 'Canara Bank A/c XX3344 debited for Rs.450.00 on 15-08-26 UPI Ref123456789012';
    const outcome = parseSms('VM-CANBNK', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.bankId).toBe('canara');
  });

  it('parses IDFC FIRST Bank', () => {
    const body =
      'IDFC FIRST Bank: Rs.350.00 debited from a/c X8899 on 15-08-26 via UPI to merchant@idfc (Ref123456789012)';
    const outcome = parseSms('VM-IDFCFB', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.bankId).toBe('idfcfirst');
  });
});

describe('parseSms — TRAI 2025 header-suffix sender format', () => {
  // TRAI's SMS header suffix mandate (effective 6 May 2025) appends a single-letter category suffix
  // to every registered header — `-T` (Transactional), `-S` (Service — real-world DLT registrations
  // show plenty of banks' own transactional alerts filed under this category, not just `-T`), `-P`
  // (Promotional), `-G` (Government). A bank's sender can now legitimately arrive as `VM-HDFCBK-T` or
  // `VM-HDFCBK-S`, in addition to (never instead of) the pre-2025 `VM-HDFCBK`/`HDFCBK` forms a
  // historical scan will keep encountering for plenty of older messages.
  const body =
    'Sent Rs.1288.15 From HDFC Bank A/C *1234 To IRCTC FULL TRAIN RESERVAT On 08/08/26 Ref 127584388992 Not You?';

  it('parses a prefixed sender with the Transactional (-T) suffix', () => {
    const outcome = parseSms('VM-HDFCBK-T', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
  });

  it('parses a prefixed sender with the Service (-S) suffix', () => {
    const outcome = parseSms('VM-HDFCBK-S', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
  });

  it('parses an unprefixed sender with a suffix', () => {
    const outcome = parseSms('HDFCBK-T', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
  });

  it('still parses the pre-2025 unsuffixed form — old patterns are additive, never replaced', () => {
    const outcome = parseSms('VM-HDFCBK', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
  });

  it('does not match a Promotional (-P) suffix against an unrelated bare sender', () => {
    // Sanity check that the suffix character class doesn't accidentally widen the match beyond a
    // real bank's own registered header — an entirely different 6-character code plus a suffix must
    // still not match.
    const outcome = parseSms('VM-RANDOM-T', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('unrecognized_sender');
  });

  it('SBI recognizes both its registered headers with a suffix', () => {
    const sbiBody = 'A/C X4567 debited by 500.0 on date 15Aug26 trf to Merchant Name Refno 123456789012 -SBI';
    expect(parseSms('AD-SBIINB-S', sbiBody, RECEIVED, BUNDLE).kind).toBe('parsed');
    expect(parseSms('AD-SBIUPI-T', sbiBody, RECEIVED, BUNDLE).kind).toBe('parsed');
  });
});

describe('parseSms — negative/edge scenarios', () => {
  it('excludes an OTP message before any bank matching runs', () => {
    const body = '123456 is your OTP to login to HDFC NetBanking. Do not share this with anyone.';
    expect(parseSms('VM-HDFCBK', body, RECEIVED, BUNDLE)).toEqual({ kind: 'excluded_otp' });
  });

  it('reports unrecognized_sender for a non-bank sender', () => {
    const body = 'Hey, are we still on for dinner tonight?';
    expect(parseSms('MOM', body, RECEIVED, BUNDLE)).toEqual({ kind: 'unrecognized_sender' });
  });

  it('reports unrecognized_sender for a promotional message from an unrecognized shortcode', () => {
    const body = 'Get a personal loan at 10.5% interest! Apply now.';
    expect(parseSms('VM-PROMOX', body, RECEIVED, BUNDLE)).toEqual({ kind: 'unrecognized_sender' });
  });

  it('falls back to receivedAt when no date is captured or parseable', () => {
    // A real HDFC message from the SAME template as the "Sent" test above, but this particular
    // real-world variant has no year at all in its date ("02-11", a hyphenated day-month with
    // nothing after it) — doesn't fit the template's own `dateFormat: 'DD/MM/YY'` (slash-separated,
    // 2-digit year), so this should still resolve using receivedAt rather than being rejected
    // outright over one unparseable field.
    const body = 'Amt Sent Rs.205.33 From HDFC Bank A/C *1234 To ZOMATO LIMITED On 02-11 Ref 430770561103 Not You?';
    const outcome = parseSms('VM-HDFCBK', body, RECEIVED, BUNDLE);
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') return;
    expect(outcome.candidate.date).toBe(RECEIVED);
  });
});

describe('redactDigits', () => {
  it('masks every digit, leaving structure/wording intact', () => {
    expect(redactDigits('Rs.500.00 debited from a/c XX1234 on 15-Aug-26')).toBe(
      'Rs.###.## debited from a/c XX#### on ##-Aug-##'
    );
  });
});

// 2026-08-16 — traceSms() full diagnostic trace (SMS parser verifier tool §2/§3): every template
// belonging to the sender-matched bank should show up as an attempt, whether or not it matched, and
// parseSms()'s own outcome must be identical to traceSms()'s .outcome (parseSms is now a thin wrapper).
describe('traceSms', () => {
  it('matches on the FIRST template of several — later ones are recorded as not-attempted, not "didn\'t match"', () => {
    const body =
      'Sent Rs.1288.15 From HDFC Bank A/C *1234 To IRCTC FULL TRAIN RESERVAT On 08/08/26 Ref 127584388992 Not You?';
    const trace = traceSms('VM-HDFCBK', body, RECEIVED, BUNDLE);
    expect(trace.matchedSenderBanks).toEqual(['hdfc']);
    expect(trace.attempts).toHaveLength(9); // HDFC has 9 templates
    expect(trace.attempts[0]).toMatchObject({ attempted: true, matched: true });
    for (let i = 1; i < 9; i++) expect(trace.attempts[i]).toMatchObject({ attempted: false, matched: false });
    expect(trace.outcome).toEqual(parseSms('VM-HDFCBK', body, RECEIVED, BUNDLE));
  });

  it('matches on the LAST template of several — every earlier one is a real, attempted non-match', () => {
    const body =
      'Money Sent-INR 2,50,000.00 From HDFC Bank A/c XX1234 on 28-12-23 To A/c xxxxxxxxxxx6038 IMPS Ref-336215356196 Avl bal:INR 39,518.00 Not you?';
    const trace = traceSms('HDFCBK', body, RECEIVED, BUNDLE);
    expect(trace.attempts).toHaveLength(9);
    for (let i = 0; i < 8; i++) expect(trace.attempts[i]).toMatchObject({ attempted: true, matched: false });
    expect(trace.attempts[8]).toMatchObject({ attempted: true, matched: true });
  });

  it('recognized bank, no template matches — every template is a real, attempted non-match', () => {
    const body = 'HDFC Bank: your account activity summary for this month is now available in the app.';
    const trace = traceSms('VM-HDFCBK', body, RECEIVED, BUNDLE);
    expect(trace.matchedSenderBanks).toEqual(['hdfc']);
    expect(trace.attempts).toHaveLength(9);
    expect(trace.attempts.every((a) => a.attempted && !a.matched)).toBe(true);
    expect(trace.outcome).toEqual({ kind: 'unparsed_known_bank', bankId: 'hdfc' });
  });

  it('unrecognized sender — no attempts at all', () => {
    const trace = traceSms('MOM', 'Hey, are we still on for dinner tonight?', RECEIVED, BUNDLE);
    expect(trace.matchedSenderBanks).toEqual([]);
    expect(trace.attempts).toEqual([]);
    expect(trace.outcome).toEqual({ kind: 'unrecognized_sender' });
  });

  it('excluded as OTP — no attempts, no sender matching even performed', () => {
    const trace = traceSms('VM-HDFCBK', '123456 is your OTP to login to HDFC NetBanking.', RECEIVED, BUNDLE);
    expect(trace.excludedAsOtp).toBe(true);
    expect(trace.matchedSenderBanks).toEqual([]);
    expect(trace.attempts).toEqual([]);
    expect(trace.outcome).toEqual({ kind: 'excluded_otp' });
  });

  it('captureRanges recover the exact substring each field came from', () => {
    const body =
      'Sent Rs.1288.15 From HDFC Bank A/C *1234 To IRCTC FULL TRAIN RESERVAT On 08/08/26 Ref 127584388992 Not You?';
    const trace = traceSms('VM-HDFCBK', body, RECEIVED, BUNDLE);
    const matchedAttempt = trace.attempts.find((a) => a.matched);
    const amountRange = matchedAttempt?.captureRanges?.amount;
    const counterpartyRange = matchedAttempt?.captureRanges?.counterparty;
    expect(amountRange).toBeDefined();
    expect(counterpartyRange).toBeDefined();
    if (!amountRange || !counterpartyRange) return;
    expect(body.slice(amountRange[0], amountRange[1])).toBe('1288.15');
    expect(body.slice(counterpartyRange[0], counterpartyRange[1])).toBe('IRCTC FULL TRAIN RESERVAT');
  });

  it('parseSms and traceSms(...).outcome stay identical across every existing sample in this file', () => {
    const samples: [string, string][] = [
      [
        'VM-HDFCBK',
        'Sent Rs.1288.15 From HDFC Bank A/C *1234 To IRCTC FULL TRAIN RESERVAT On 08/08/26 Ref 127584388992 Not You?'
      ],
      [
        'VK-ICICIB',
        'ICICI Bank Acct XX789 debited with Rs 2,500.00 on 15-Aug-26; Merchant Store credited. UPI:123456789012.'
      ],
      ['MOM', 'Hey, are we still on for dinner tonight?'],
      ['VM-HDFCBK', '123456 is your OTP to login to HDFC NetBanking. Do not share this with anyone.']
    ];
    for (const [sender, body] of samples) {
      expect(traceSms(sender, body, RECEIVED, BUNDLE).outcome).toEqual(parseSms(sender, body, RECEIVED, BUNDLE));
    }
  });
});
