// Sample SMS — one (or more) per bank/template in `SMS_PATTERNS_FALLBACK`, used by both the standalone
// parser-verifier tool (`tools/sms-parser-verifier/`) and mirrored in
// `packages/core/tests/sms-import/smsParser.test.ts`'s own inline literals. Most banks' strings here are
// entirely synthetic — fabricated names/numbers/references constructed to match each bank's documented
// public SMS wording conventions, never real message text (see docs/plans/sms-transaction-tracking.md's
// "gate before native work" step). HDFC/IndusInd/ HSBC are the exception (2026-08-18): their samples are
// real, user-verified message wording — the one real personal name/VPA that appeared in the ORIGINAL
// source messages (never in any of the samples below) was swapped for a placeholder before this file
// was ever written; see `smsPatterns.ts`'s own HDFC-block comment for the schema-fitting conversion this
// required (mask-stripped acctLast4/cardLast4, dropped/unmapped fields, three combined credit/debit
// wordings split into pairs).
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
  // HDFC — real, user-verified message wording (2026-08-18 replacement of the earlier synthetic set;
  // see smsPatterns.ts's own HDFC-block comment). One personal name/VPA that appeared in the original
  // source messages (never any of these 9) never made it in — everything below was already either a
  // masked account/card number, a bank helpline, or a merchant/service name.
  {
    bankId: 'hdfc',
    transactionType: 'debit',
    templateLabel: 'real, "Sent" wording',
    sender: 'VM-HDFCBK',
    body: 'Sent Rs.1288.15 From HDFC Bank A/C *1234 To IRCTC FULL TRAIN RESERVAT On 08/08/26 Ref 127584388992 Not You?'
  },
  {
    bankId: 'hdfc',
    transactionType: 'credit',
    templateLabel: 'real, "Credit Alert!" UPI wording',
    sender: 'AD-HDFCBK',
    body: 'Credit Alert! Rs.3000.00 credited to HDFC Bank A/c xx1234 on 25-06-25 from VPA 9829172900@ptyes (UPI 287130386996)'
  },
  {
    bankId: 'hdfc',
    transactionType: 'debit',
    templateLabel: 'real, "HDFC Bank: ... debited ... to VPA" wording',
    sender: 'HDFCBK',
    body: 'HDFC Bank: Rs 54.00 debited from a/c **1234 on 10-08-23 to VPA paytmqr28100505010114phlsjpa5m8paytm(UPI Ref No 322256610741). Not you?'
  },
  {
    bankId: 'hdfc',
    transactionType: 'card_swipe',
    templateLabel: 'real, debit card spend alert',
    sender: 'VM-HDFCBK',
    body: "Alert!You've spent Rs.1107.73 On HDFC Bank Debit Card xx1234 At _RAJAN AUTO CARE.. On 2023-12-04:09:35:53 Avl bal: 317190.91 Not you?"
  },
  {
    bankId: 'hdfc',
    transactionType: 'debit',
    templateLabel: 'real, IMPS sent wording',
    sender: 'VM-HDFCBK',
    body: 'IMPS INR 4,40,000.10 sent from HDFC Bank A/c XX1234 on 17-05-25 To A/c xxxxxxxx0960 Ref-513708399748 Not you?'
  },
  {
    bankId: 'hdfc',
    transactionType: 'credit',
    templateLabel: 'real, "linked to VPA" credit wording',
    sender: 'AD-HDFCBK',
    body: 'HDFC Bank: Rs. 23000.00 credited to a/c XXXXXX1234 on 12-09-22 by a/c linked to VPA sainiprem410@ybl (UPI Ref No 225524688883).'
  },
  {
    bankId: 'hdfc',
    transactionType: 'debit',
    templateLabel: 'real, "UPDATE:" cheque-withdrawal wording',
    sender: 'HDFCBK',
    body: 'UPDATE: INR 1,40,000.00 debited from HDFC Bank XX1234 on 30-JUN-26. Info: SELF - CHQ PAID - MANGYAWAS RO. Avl bal:INR 15,871.53'
  },
  {
    bankId: 'hdfc',
    transactionType: 'credit',
    templateLabel: 'real, prepaid card load wording',
    sender: 'VM-HDFCBK',
    body: 'Alert! INR 8800.0 loaded on HDFC Bank Prepaid Card 1234 on 30 Jun,2026 02:35 AM IST Bal: INR 19914.12 Cash withdrawal activated at 30 Jun,2026 03:05 AM IST Help?'
  },
  {
    bankId: 'hdfc',
    transactionType: 'debit',
    templateLabel: 'real, "Money Sent-" IMPS wording',
    sender: 'VM-HDFCBK',
    body: 'Money Sent-INR 2,50,000.00 From HDFC Bank A/c XX1234 on 28-12-23 To A/c xxxxxxxxxxx6038 IMPS Ref-336215356196 Avl bal:INR 39,518.00 Not you?'
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
  // IndusInd — real, user-verified wording (2026-08-18 replacement of the earlier synthetic single
  // template). One real personal name and one real VPA that appeared in the original source messages
  // (in the "credited for" and "VPA + RRN" wordings below) were swapped for a placeholder before this
  // file was written.
  {
    bankId: 'indusind',
    transactionType: 'card_swipe',
    templateLabel: 'real, debit card purchase wording',
    sender: 'VM-INDUSB',
    body: 'INR 618.93 (Incl. TCS as applicable) is debited from your IndusInd A/C No 159***660960 towards Debit Card Purchase. Avl BAL is INR 122,147.07 - IndusInd Bank.'
  },
  {
    bankId: 'indusind',
    transactionType: 'credit',
    templateLabel: 'real, NEFT/RTGS-style credit wording',
    sender: 'VM-INDUSB',
    body: 'Your IndusInd Account XXXXXXXX0960 has been credited for INR 200000 towards N/HSBCN18160937466/REF1234567/MR JOHN DOE. Call 18602677777 to report issue-IndusInd Bank'
  },
  {
    bankId: 'indusind',
    transactionType: 'credit',
    templateLabel: 'real, quarterly interest-credit wording',
    sender: 'VM-INDUSB',
    body: 'INR 1,952.00 has been credited to your IndusInd A/C 159***660960 towards Interest Credit for the quarter ending June - IndusInd Bank'
  },
  {
    bankId: 'indusind',
    transactionType: 'debit',
    templateLabel: 'real, IMPS debit wording',
    sender: 'VM-INDUSB',
    body: 'Your IndusInd Account 15XXXXX0960 has been debited for INR 200000 towards IMPS/318714889890. Call 18602677777 to report issue-IndusInd Bank'
  },
  {
    bankId: 'indusind',
    transactionType: 'credit',
    templateLabel: 'real, IMPS credit wording',
    sender: 'VM-INDUSB',
    body: 'Your IndusInd Account 15XXXXX0960 has been credited for INR 20000 towards IMPS/315615390081. Call 18602677777 to report issue-IndusInd Bank'
  },
  {
    bankId: 'indusind',
    transactionType: 'debit',
    templateLabel: 'real, cheque withdrawal wording',
    sender: 'VM-INDUSB',
    body: 'INR 200,000.00 is debited from your A/C 159***660960 towards Cheque withdrawal. Avl BAL INR 1,995,939.64 - IndusInd Bank'
  },
  {
    bankId: 'indusind',
    transactionType: 'debit',
    templateLabel: 'real, card annual-charge wording',
    sender: 'VM-INDUSB',
    body: 'IndusInd A/C Debited; INR 293.82 Ref-To Card Annual Charge 5256220704059967.Bal INR 1,747,843.64.Dispute-Call 18602677777-IndusInd Bank'
  },
  {
    bankId: 'indusind',
    transactionType: 'credit',
    templateLabel: 'real, VPA + RRN credit wording',
    sender: 'VM-INDUSB',
    body: 'A/c *XX0960 credited by Rs 38000.00 from j.doe2182-1@okhdfcbank. RRN: 433340613562. Not You? call 18602677777- IndusInd Bank'
  },
  {
    bankId: 'bob',
    transactionType: 'debit',
    templateLabel: 'current-era debit',
    sender: 'VM-BOBTXN',
    body: 'Your A/c XX9900 is debited by Rs.600.00 on 15-08-2026 towards Grocery Store-Bank of Baroda'
  },
  // HSBC — real, user-verified wording (2026-08-18 replacement of the earlier synthetic single
  // template). The one real personal name that appeared in the original NEFT-credit-destination
  // source message was swapped for a placeholder before this file was written.
  {
    bankId: 'hsbc',
    transactionType: 'debit',
    templateLabel: 'real, "is paid from" wording',
    sender: 'VM-HSBCIN',
    body: 'INR 240.00 is paid from HSBC account XXXXXX1234 to Sharma general Store on 14-Aug-26 with ref 123123123123.'
  },
  {
    bankId: 'hsbc',
    transactionType: 'credit',
    templateLabel: 'real, "Dear Customer... credited" wording',
    sender: 'VM-HSBCIN',
    body: 'HSBC: Dear Customer, your HSBC A/c 123-456***-006 has been credited with INR 60.00+ on 10AUG as per the transaction . Your available Bal is 1,531,734.41 .'
  },
  {
    bankId: 'hsbc',
    transactionType: 'debit',
    templateLabel: 'real, "Dear Customer... debited" wording',
    sender: 'VM-HSBCIN',
    body: 'HSBC:Dear Customer, your HSBC A/c 123-456***-006 has been debited with INR 10,000.00 on 02DEC as CSH WDL. Your Avl Bal is INR 752,932.09 .'
  },
  {
    bankId: 'hsbc',
    transactionType: 'credit',
    templateLabel: 'real, UPI credit wording',
    sender: 'VM-HSBCIN',
    body: 'Your HSBC Acc XXXXXX5006 is credited for INR 1.00 on 24-Jul-26 from goog-payments@axisbank. UPI Ref No 322063002056'
  },
  {
    bankId: 'hsbc',
    transactionType: 'debit',
    templateLabel: 'real, UPI debit wording',
    sender: 'VM-HSBCIN',
    body: 'Your HSBC Acc XXXXXX1234 is debited for INR 29.00 on 05-Aug-25 towards UBER INDIA SYSTEMS PRIVATE LIMITED. UPI Ref No 521774679819.'
  },
  {
    bankId: 'hsbc',
    transactionType: 'credit',
    templateLabel: 'real, UTR/NEFT/IMPS credit wording',
    sender: 'VM-HSBCIN',
    body: 'HSBC: A/c 123-456***-006 is credited with INR 2,352.96+ on 06JUN at 05.04.16 with UTR YESF361575804825 as NEFT from YESB A/c ***0071 of ZERODHA BROKING L*** . Your Avl Bal is INR 1,573,623.50 .'
  },
  {
    bankId: 'hsbc',
    transactionType: 'debit',
    templateLabel: 'real, UTR/NEFT/IMPS debit wording',
    sender: 'VM-HSBCIN',
    body: 'HSBC: A/c 123-456***-006 is debited with INR 190,000.00- on 07JUL with UTR HSBCN18856936028 as NEFT via Online to IDIB A/c ***0960 John Doe*** . Avl Bal is INR 216,599.42 . Report fraud 18002663456/914065118001.'
  },
  {
    bankId: 'hsbc',
    transactionType: 'credit',
    templateLabel: 'real, NEFT-credit-destination wording',
    sender: 'VM-HSBCIN',
    body: 'HSBC: Dear HSBC Customer, your NEFT transaction with reference number HSBCN123123123123 for INR 200,000.00 has been credited to the INDB A/c XXXXXXXX0960 of JANE ROE on 30-06-2026 at : : .'
  },
  {
    bankId: 'hsbc',
    transactionType: 'card_swipe',
    templateLabel: 'real, debit card spend wording',
    sender: 'VM-HSBCIN',
    body: 'HSBC:Thank you for using HSBC Debit Card XXXXX1234 for INR 2,100.00 on 07MAR at AMAZON PAY INDIA PRIVATE .Your available bal is INR 1,124,194.01 .To report fraudulent transaction call 18002673456 (local) Or +914061268007 (overseas).'
  },
  {
    bankId: 'hsbc',
    transactionType: 'debit',
    templateLabel: 'real, UPI AutoPay wording',
    sender: 'VM-HSBCIN',
    body: 'Dear Customer, Your HSBC account has been successfully debited with 199.00 on 21/05/2025 towards NETFLIX COM UPI AutoPay, 8aa70bd8e71f4c22b5651e887dc6417c@okaxis.'
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
