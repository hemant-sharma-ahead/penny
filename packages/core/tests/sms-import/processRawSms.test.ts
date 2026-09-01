import { describe, expect, it } from 'vitest';
import { processRawSmsCore, type ProcessRawSmsContext } from '@/core/sms-import/processRawSms';

// Synthetic — same convention as smsParser.test.ts: fabricated text matching each bank's documented
// public SMS wording, never real message content.
const RECEIVED = new Date(2026, 7, 15, 10, 30).getTime(); // 15-Aug-2026

const EMPTY_CTX: ProcessRawSmsContext = { accounts: [], mappings: [], expenses: [], records: [], excludedSenders: [] };

describe('processRawSmsCore', () => {
  it('returns undefined for an OTP message — never persisted at all', async () => {
    const record = await processRawSmsCore(
      'VM-HDFCBK',
      '123456 is your OTP to login to HDFC NetBanking. Do not share this with anyone.',
      RECEIVED,
      EMPTY_CTX
    );
    expect(record).toBeUndefined();
  });

  it('returns undefined for a sender no configured bank recognizes', async () => {
    const record = await processRawSmsCore(
      'AX-SPAMCO',
      'Get 10% cashback this weekend only! T&C apply.',
      RECEIVED,
      EMPTY_CTX
    );
    expect(record).toBeUndefined();
  });

  it("creates an 'unparsed' record for a recognized bank sender whose body matches no template", async () => {
    const record = await processRawSmsCore(
      'VM-HDFCBK',
      'HDFC Bank: your account activity summary for this month is now available in the app.',
      RECEIVED,
      EMPTY_CTX
    );
    expect(record).toMatchObject({ status: 'unparsed', bankId: 'hdfc', sender: 'VM-HDFCBK' });
  });

  it('excludes a durably-excluded sender even when its body would otherwise create an unparsed record', async () => {
    const ctx: ProcessRawSmsContext = { ...EMPTY_CTX, excludedSenders: ['VM-HDFCBK'] };
    const record = await processRawSmsCore(
      'VM-HDFCBK',
      'HDFC Bank: your account activity summary for this month is now available in the app.',
      RECEIVED,
      ctx
    );
    expect(record).toBeUndefined();
  });

  it('excludes a durably-excluded sender even when its body WOULD have structurally matched a real template', async () => {
    // A real, genuinely-matching HDFC wording (see smsParser.test.ts) — proves exclusion wins over a
    // genuine structural match, not just over an already-non-matching one.
    const ctx: ProcessRawSmsContext = { ...EMPTY_CTX, excludedSenders: ['VM-HDFCBK'] };
    const body =
      'Sent Rs.1288.15 From HDFC Bank A/C *1234 To IRCTC FULL TRAIN RESERVAT On 08/08/26 Ref 127584388992 Not You?';
    const record = await processRawSmsCore('VM-HDFCBK', body, RECEIVED, ctx);
    expect(record).toBeUndefined();
  });

  it('a message from a DIFFERENT sender is unaffected by another sender being excluded', async () => {
    const ctx: ProcessRawSmsContext = { ...EMPTY_CTX, excludedSenders: ['VM-HDFCBK'] };
    const body =
      'ICICI Bank Acct XX789 debited with Rs 2,500.00 on 15-Aug-26; Merchant Store credited. UPI:123456789012. Call 18002662 for dispute.';
    const record = await processRawSmsCore('VM-ICICIB', body, RECEIVED, ctx);
    expect(record).toMatchObject({ bankId: 'icici', amount: 2500 });
  });

  it('Tier-1 contentHash dedup still wins over everything, including exclusion (unreachable in practice, but never double-processed)', async () => {
    const body = 'HDFC Bank: your account activity summary for this month is now available in the app.';
    const first = await processRawSmsCore('VM-HDFCBK', body, RECEIVED, EMPTY_CTX);
    expect(first).toBeDefined();
    if (!first) return;
    const ctxWithRecord: ProcessRawSmsContext = { ...EMPTY_CTX, records: [first] };
    const second = await processRawSmsCore('VM-HDFCBK', body, RECEIVED, ctxWithRecord);
    expect(second).toBeUndefined();
  });
});
