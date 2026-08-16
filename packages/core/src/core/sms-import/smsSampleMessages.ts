// Synthetic sample SMS — one (or more) per bank/template in `SMS_PATTERNS_FALLBACK`, used by both the
// standalone parser-verifier tool (`tools/sms-parser-verifier/`) and mirrored in
// `packages/core/tests/sms-import/smsParser.test.ts`'s own inline literals. Every string here is
// entirely synthetic — fabricated names/numbers/references constructed to match each bank's documented
// public SMS wording conventions, never real message text (same convention that test file's own header
// comment establishes; see docs/plans/sms-transaction-tracking.md's "gate before native work" step).
//
// Kept as a small, deliberately duplicated copy of the test file's literals rather than a shared import
// — these are illustrative example strings, not the actual matching logic (that lives in exactly one
// place, `smsPatterns.ts`), so a little copy here is low-risk; update both if a new template needs a
// fresh sample. If this ever needs a single source of truth, refactor the test file to import from here
// instead — deliberately not done in this pass, to avoid touching already-verified, passing tests.
import type { BankPresetId } from '@/core/db/types';
import type { SmsTransactionType } from './smsPatterns';

export interface SmsSampleMessage {
  bankId: BankPresetId;
  transactionType: SmsTransactionType;
  /** Human label for the specific template this sample is meant to exercise — matches the matching
   *  template's own `addedAt` note loosely (not parsed/compared, purely for the verifier tool's UI). */
  templateLabel: string;
  sender: string;
  body: string;
}

export const SMS_SAMPLE_MESSAGES: SmsSampleMessage[] = [
  // HDFC
  {
    bankId: 'hdfc',
    transactionType: 'debit',
    templateLabel: 'current-era UPI debit',
    sender: 'VM-HDFCBK',
    body: 'HDFC Bank: Rs.500.00 debited from a/c XX1234 on 15-Aug-26 to VPA merchant@ybl (UPI Ref No 123456789012). Not you? Call 18002586161'
  },
  {
    bankId: 'hdfc',
    transactionType: 'credit',
    templateLabel: 'current-era UPI credit',
    sender: 'AD-HDFCBK',
    body: 'HDFC Bank: Rs.1,500.00 credited to a/c XX1234 on 15-Aug-26 by VPA sender@okhdfcbank (UPI Ref No 123456789013).'
  },
  {
    bankId: 'hdfc',
    transactionType: 'debit',
    templateLabel: 'older era (~2012-2016), terser wording',
    sender: 'HDFCBK',
    body: 'Rs.500.00 debited from A/c No. XX1234 on 15/08/26. Info: ATM WDL. Avl Bal: Rs.10000.00-HDFC Bank'
  },
  // ICICI
  {
    bankId: 'icici',
    transactionType: 'debit',
    templateLabel: 'current-era debit',
    sender: 'VK-ICICIB',
    body: 'ICICI Bank Acct XX789 debited with Rs 2,500.00 on 15-Aug-26; Merchant Store credited. UPI:123456789012. Call 18002662 for dispute.'
  },
  {
    bankId: 'icici',
    transactionType: 'credit',
    templateLabel: 'current-era credit',
    sender: 'ICICIB',
    body: 'ICICI Bank Acct XX789 credited with Rs 5,000.00 on 15-Aug-26 from John Doe. UPI:123456789013.'
  },
  {
    bankId: 'icici',
    transactionType: 'debit',
    templateLabel: 'older era (~2013-2017)',
    sender: 'VK-ICICIB',
    body: 'ICICI Bank: Acct XX789 debited Rs.1200.00 on 15-08-26 towards Electricity Bill. Avl bal Rs.8000.00'
  },
  // SBI
  {
    bankId: 'sbi',
    transactionType: 'debit',
    templateLabel: 'current-era debit',
    sender: 'VM-SBIINB',
    body: 'A/C X4567 debited by 500.0 on date 15Aug26 trf to Merchant Name Refno 123456789012 -SBI'
  },
  {
    bankId: 'sbi',
    transactionType: 'credit',
    templateLabel: 'current-era credit',
    sender: 'SBIINB',
    body: 'A/C X4567 credited by 2000.0 on date 15Aug26 by Jane Roe Refno 123456789013 -SBI'
  },
  {
    bankId: 'sbi',
    transactionType: 'debit',
    templateLabel: 'older era (~2014-2018), "Dear Customer"',
    sender: 'VM-SBIINB',
    body: 'Dear Customer, Rs.1200 debited from A/c XX4567 on 15/08/26 transfer to merchant@sbi Ref No123456789012. -SBI'
  },
  // Axis
  {
    bankId: 'axis',
    transactionType: 'debit',
    templateLabel: 'current-era UPI debit',
    sender: 'VM-AXISBK',
    body: 'Axis Bank: INR 750.00 debited from A/c no. XX3456 on 15-08-2026 towards UPI/P2M/123456789012/Merchant Name. Avl bal: INR 25000.00'
  },
  {
    bankId: 'axis',
    transactionType: 'credit',
    templateLabel: 'current-era UPI credit',
    sender: 'AXISBK',
    body: 'Axis Bank: INR 900.00 credited to A/c no. XX3456 on 15-08-2026 towards UPI/P2A/123456789013/Jane Roe. Avl bal: INR 25900.00'
  },
  // Kotak
  {
    bankId: 'kotak',
    transactionType: 'debit',
    templateLabel: 'current-era UPI debit',
    sender: 'VM-KOTAKB',
    body: 'Rs.300.00 debited from Kotak Bank AC X1122 on 15-08-26 for UPI/merchant@icici/Ref123456789012. Avl Bal Rs.8000.00'
  },
  {
    bankId: 'kotak',
    transactionType: 'card_swipe',
    templateLabel: 'current-era card swipe',
    sender: 'KOTAKB',
    body: 'Rs.1200.00 spent on Kotak Debit Card X5566 at Big Bazaar on 15-08-26'
  },
  // Remaining current-era-only banks
  {
    bankId: 'indusind',
    transactionType: 'debit',
    templateLabel: 'current-era UPI debit',
    sender: 'VM-INDUSB',
    body: 'IndusInd Bank: Rs.400.00 debited from A/c X7788 on 15-08-26 UPI Ref123456789012 to merchant@indus'
  },
  {
    bankId: 'bob',
    transactionType: 'debit',
    templateLabel: 'current-era debit',
    sender: 'VM-BOBTXN',
    body: 'Your A/c XX9900 is debited by Rs.600.00 on 15-08-2026 towards Grocery Store-Bank of Baroda'
  },
  {
    bankId: 'hsbc',
    transactionType: 'debit',
    templateLabel: 'current-era debit',
    sender: 'VM-HSBCIN',
    body: 'HSBC: INR 1000.00 debited from a/c XX2233 on 15/08/2026 for Online Purchase'
  },
  {
    bankId: 'yesbank',
    transactionType: 'debit',
    templateLabel: 'current-era UPI debit',
    sender: 'VM-YESBNK',
    body: 'Rs.250.00 debited from YES Bank A/c X4455 on 15-08-26 towards UPI/merchant@yesb/Ref123456789012'
  },
  {
    bankId: 'pnb',
    transactionType: 'debit',
    templateLabel: 'current-era debit',
    sender: 'VM-PNBSMS',
    body: 'PNB: Rs.800.00 debited from A/c XX6677 on 15-08-2026 for School Fees. Avail Bal Rs.15000.00'
  },
  {
    bankId: 'canara',
    transactionType: 'debit',
    templateLabel: 'current-era UPI debit',
    sender: 'VM-CANBNK',
    body: 'Canara Bank A/c XX3344 debited for Rs.450.00 on 15-08-26 UPI Ref123456789012'
  },
  {
    bankId: 'idfcfirst',
    transactionType: 'debit',
    templateLabel: 'current-era UPI debit',
    sender: 'VM-IDFCFB',
    body: 'IDFC FIRST Bank: Rs.350.00 debited from a/c X8899 on 15-08-26 via UPI to merchant@idfc (Ref123456789012)'
  }
];
