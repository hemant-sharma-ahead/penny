// SMS transaction-parsing templates (2026-08-15, docs/plans/sms-transaction-tracking.md §5). Served
// as a small, mostly-static JSON route so a bank changing its SMS wording is a backend redeploy, not
// an app-store release — same shape/rationale as epfRates.ts/ppfRates.ts. No KV/D1 storage: this
// changes rarely enough that a static in-source table is trivially auditable in a diff.
//
// CRUCIAL: only these templates (regex strings, no user data) ever cross this route. Actual SMS
// text and every field parsed from it are matched 100% on-device by the app
// (`packages/core/src/core/sms-import/smsParser.ts`) and never transmitted anywhere — this route
// exists purely so the parsing RULES can be fixed centrally, not to receive or process any SMS
// content itself.
//
// This is a standalone copy of the same shape `packages/core/src/core/sms-import/smsPatterns.ts`
// defines client-side (`SmsTemplateEntry`/`BankSmsPatternSet`/`SmsPatternBundle`) — `workers/` is
// deliberately excluded from the pnpm workspace (see CLAUDE.md) and doesn't depend on
// `packages/core`, so the two are kept in sync by hand, same as epfRates.ts/ppfRates.ts already are.
// If you add/change a template here, add/change it in that file's `SMS_PATTERNS_FALLBACK` too (and
// vice versa) — see that file's own doc comment for the full rationale (tolerant-not-brittle regex,
// append-only growth, the "N SMS from known banks couldn't be parsed" discovery loop).
//
// Sender-ID suffix update (2026-08-17) — every bank's `senderIdPatterns` gained two additive
// `-[TSPG]` patterns (prefixed and unprefixed) for TRAI's 6-May-2025 SMS header suffix mandate; see
// the core file's doc comment for the full rationale. Old, un-suffixed patterns are untouched.
//
// HDFC/IndusInd/HSBC replaced 2026-08-18 with a verified real-world set (mirrored from the core
// file's own templates, byte-for-byte identical `pattern`/`dateFormat`/`addedAt` — see that file's
// own HDFC-block comment for the full conversion rationale: field names/capture width kept exactly
// as the verified source provided, three HSBC credit/debit wordings split into matched pairs).
//
// Capture-group field names renamed 2026-08-18 (`acctLast4`→`account`, `cardLast4`→`card`,
// `ref`→`reference`, `dateStr`→`date`) across every bank, not just HDFC/IndusInd/HSBC — the core
// file's own schema (`SmsCaptureGroupName` in smsParser.ts) was renamed to adopt the verified
// source's naming convention, so this mirror follows suit for all 12 banks.

type SmsTransactionType = 'debit' | 'credit' | 'upi_sent' | 'upi_received' | 'card_swipe' | 'refund';

interface SmsTemplateEntry {
  transactionType: SmsTransactionType;
  pattern: string;
  dateFormat?: string;
  addedAt: string;
}

interface BankSmsPatternSet {
  bankId: string;
  senderIdPatterns: string[];
  templates: SmsTemplateEntry[];
}

interface SmsPatternBundle {
  version: number;
  banks: BankSmsPatternSet[];
}

export const SMS_PATTERN_BUNDLE: SmsPatternBundle = {
  version: 1,
  banks: [
    {
      bankId: 'hdfc',
      senderIdPatterns: ['^[A-Z]{2}-HDFCBK$', '^HDFCBK$', '^[A-Z]{2}-HDFCBK-[TSPG]$', '^HDFCBK-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, "Sent" wording)',
          dateFormat: 'DD/MM/YY',
          pattern:
            "(?:Amt\\s+)?Sent\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+From\\s+(?<bank>[A-Za-z][A-Za-z0-9& .'-]*?)\\s+(?:A/C|A/c|account)\\s+(?<account>[Xx*0-9-]+)\\s+To\\s+(?<counterparty>.*?)\\s+On\\s+(?<date>[0-9]{1,2}[-/][0-9]{1,2}(?:[-/][0-9]{2,4})?)\\s+Ref\\s+(?<reference>[A-Za-z0-9-]+)"
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, "Credit Alert!" UPI wording)',
          dateFormat: 'DD-MM-YY',
          pattern:
            "Credit\\s+Alert!\\s*(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+credited\\s+to\\s+(?<bank>[A-Za-z][A-Za-z0-9& .'-]*?)\\s+(?:A/C|A/c|account)\\s+(?<account>[Xx*0-9-]+)\\s+on\\s+(?<date>[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})\\s+from\\s+VPA\\s+(?<counterparty>[A-Za-z0-9._-]+@[A-Za-z0-9.-]+)\\s+\\(UPI\\s+(?<reference>[A-Za-z0-9-]+)\\)"
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, "HDFC Bank: ... debited ... to VPA" wording)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'HDFC\\s+Bank:\\s*(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+debited\\s+from\\s+(?:a/c|A/C|account)\\s+(?<account>[Xx*0-9-]+)\\s+on\\s+(?<date>[0-9]{1,2}[-/][0-9]{1,2}(?:[-/][0-9]{2,4})?)\\s+to\\s+VPA\\s+(?<counterparty>.*?)\\s*\\(UPI\\s+Ref\\s+No\\s+(?<reference>[A-Za-z0-9-]+)\\)'
        },
        {
          transactionType: 'card_swipe',
          addedAt: '2026-08-18 (real, debit card spend alert)',
          dateFormat: 'YYYY-MM-DD',
          pattern:
            "(?:ALERT:|Alert!)\\s*You've\\s+spent\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+(?:On\\s+)?(?:via\\s+)?(?:HDFC\\s+Bank\\s+)?Debit\\s+Card\\s+(?<card>[Xx*0-9-]+)\\s+(?:At|at)\\s+(?<counterparty>.*?)\\s*\\.?\\s+(?:On|on)\\s+(?<date>[0-9]{4}[-/][0-9]{2}[-/][0-9]{2})(?::(?<time>[0-9]{2}:[0-9]{2}:[0-9]{2}))?\\s*\\.?\\s*Avl\\s+[Bb]al\\s*:?\\s*(?:(?<balance_currency>INR|Rs\\.?|₹)\\s*)?(?<balance>[0-9,]+(?:\\.[0-9]{1,2})?).*$"
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, IMPS sent wording)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'IMPS\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+sent\\s+from\\s+(?<bank>HDFC\\s+Bank)\\s+(?:A/C|A/c|account)\\s+(?<account>[Xx*0-9-]+)\\s+on\\s+(?<date>[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})\\s+To\\s+(?:A/C|A/c|account)\\s+(?<counterparty_account>[Xx*0-9-]+)\\s+Ref-?\\s*(?<reference>[A-Za-z0-9-]+)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, "linked to VPA" credit wording)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'HDFC\\s+Bank:\\s*(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+credited\\s+to\\s+(?:a/c|A/C|account)\\s+(?<account>[Xx*0-9-]+)\\s+on\\s+(?<date>[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})\\s+by\\s+(?:a/c|A/C|account)\\s+linked\\s+to\\s+VPA\\s+(?<counterparty>[A-Za-z0-9._-]+@[A-Za-z0-9.-]+)\\s*\\(\\s*UPI\\s+Ref\\s+No\\s+(?<reference>[A-Za-z0-9-]+)\\s*\\)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, "UPDATE:" cheque-withdrawal wording)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'UPDATE:\\s*(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+debited\\s+from\\s+(?<bank>HDFC\\s+Bank)\\s+(?<account>[Xx*0-9-]+)\\s+on\\s+(?<date>[0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4})\\.\\s*Info:\\s*(?<description>.*?)\\.\\s*Avl\\s+bal:\\s*(?<balance_currency>INR|Rs\\.?|₹)\\s*(?<balance>[0-9,]+(?:\\.[0-9]{1,2})?)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, prepaid card load wording)',
          dateFormat: 'DD MMM,YYYY',
          pattern:
            'Alert!\\s*(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+loaded\\s+on\\s+(?<bank>HDFC\\s+Bank)\\s+Prepaid\\s+Card\\s+(?<card>[Xx*0-9-]+)\\s+on\\s+(?<date>[0-9]{1,2}\\s+[A-Za-z]{3},[0-9]{4})\\s+(?<time>[0-9]{1,2}:[0-9]{2}\\s+[AP]M)\\s+IST\\s+Bal:\\s*(?<balance_currency>INR|Rs\\.?|₹)\\s*(?<balance>[0-9,]+(?:\\.[0-9]{1,2})?)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, "Money Sent-" IMPS wording)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'Money\\s+Sent-(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+From\\s+(?<bank>HDFC\\s+Bank)\\s+(?:A/C|A/c|account)\\s+(?<account>[Xx*0-9-]+)\\s+on\\s+(?<date>[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})\\s+To\\s+(?:A/C|A/c|account)\\s+(?<counterparty_account>[Xx*0-9-]+)\\s+IMPS\\s+Ref-?\\s*(?<reference>[A-Za-z0-9-]+)(?:\\s+Avl\\s+bal:\\s*(?<balance_currency>INR|Rs\\.?|₹)\\s*(?<balance>[0-9,]+(?:\\.[0-9]{1,2})?))?'
        }
      ]
    },
    {
      bankId: 'icici',
      senderIdPatterns: ['^[A-Z]{2}-ICICIB$', '^ICICIB$', '^[A-Z]{2}-ICICIB-[TSPG]$', '^ICICIB-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'ICICI Bank Acct\\s+X+(?<account>\\d{3,6})\\s+debited with Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<date>\\d{2}-[A-Za-z]{3}-\\d{2});\\s+(?<counterparty>[\\w .]+)\\s+credited\\.\\s+UPI:\\s?(?<reference>\\d+)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'ICICI Bank Acct\\s+X+(?<account>\\d{3,6})\\s+credited with Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<date>\\d{2}-[A-Za-z]{3}-\\d{2})\\s+from\\s+(?<counterparty>[\\w .]+)\\.\\s+UPI:\\s?(?<reference>\\d+)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (older era, ~2013-2017)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'ICICI Bank:\\s?Acct\\s+X+(?<account>\\d{3,6})\\s+debited Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{2})\\s+towards\\s+(?<counterparty>[\\w .]+)\\.\\s+Avl bal Rs\\.?(?<balance>[\\d,]+\\.?\\d*)'
        }
      ]
    },
    {
      bankId: 'sbi',
      senderIdPatterns: [
        '^[A-Z]{2}-SBIINB$',
        '^SBIINB$',
        '^[A-Z]{2}-SBIUPI$',
        '^[A-Z]{2}-SBIINB-[TSPG]$',
        '^SBIINB-[TSPG]$',
        '^[A-Z]{2}-SBIUPI-[TSPG]$',
        '^SBIUPI-[TSPG]$'
      ],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'A\\/C\\s+X(?<account>\\d{3,6})\\s+debited by\\s+(?<amount>[\\d,]+\\.?\\d*)\\s+on date\\s+(?<date>\\d{2}[A-Za-z]{3}\\d{2})\\s+trf to\\s+(?<counterparty>[\\w .]+)\\s+Refno\\s?(?<reference>\\d+)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'A\\/C\\s+X(?<account>\\d{3,6})\\s+credited by\\s+(?<amount>[\\d,]+\\.?\\d*)\\s+on date\\s+(?<date>\\d{2}[A-Za-z]{3}\\d{2})\\s+by\\s+(?<counterparty>[\\w .]+)\\s+Refno\\s?(?<reference>\\d+)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (older era, ~2014-2018)',
          dateFormat: 'DD/MM/YY',
          pattern:
            'Dear Customer,\\s?Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from A\\/c\\s+X+(?<account>\\d{3,6})\\s+on\\s+(?<date>\\d{2}\\/\\d{2}\\/\\d{2})\\s+transfer to\\s+(?<counterparty>[\\w .@]+)\\s+Ref No\\s?(?<reference>\\d+)'
        }
      ]
    },
    {
      bankId: 'axis',
      senderIdPatterns: ['^[A-Z]{2}-AXISBK$', '^AXISBK$', '^[A-Z]{2}-AXISBK-[TSPG]$', '^AXISBK-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YYYY',
          pattern:
            'Axis Bank:\\s?INR\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from A\\/c no\\.\\s+X+(?<account>\\d{3,6})\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{4})\\s+towards UPI\\/P2M\\/(?<reference>\\d+)\\/(?<counterparty>[\\w .]+)\\.\\s+Avl bal:\\s?INR\\s?(?<balance>[\\d,]+\\.?\\d*)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YYYY',
          pattern:
            'Axis Bank:\\s?INR\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+credited to A\\/c no\\.\\s+X+(?<account>\\d{3,6})\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{4})\\s+towards UPI\\/P2A\\/(?<reference>\\d+)\\/(?<counterparty>[\\w .]+)\\.\\s+Avl bal:\\s?INR\\s?(?<balance>[\\d,]+\\.?\\d*)'
        }
      ]
    },
    {
      bankId: 'kotak',
      senderIdPatterns: ['^[A-Z]{2}-KOTAKB$', '^KOTAKB$', '^[A-Z]{2}-KOTAKB-[TSPG]$', '^KOTAKB-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from Kotak Bank AC\\s+X(?<account>\\d{3,6})\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{2})\\s+for UPI\\/(?<counterparty>[\\w.@-]+)\\/Ref\\s?(?<reference>\\d+)\\.\\s+Avl Bal Rs\\.?(?<balance>[\\d,]+\\.?\\d*)'
        },
        {
          transactionType: 'card_swipe',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+spent on Kotak (?:Debit|Credit) Card\\s+X(?<card>\\d{4})\\s+at\\s+(?<counterparty>[\\w .]+)\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{2})'
        }
      ]
    },
    {
      bankId: 'indusind',
      senderIdPatterns: ['^[A-Z]{2}-INDUSB$', '^INDUSB$', '^[A-Z]{2}-INDUSB-[TSPG]$', '^INDUSB-[TSPG]$'],
      templates: [
        {
          transactionType: 'card_swipe',
          addedAt: '2026-08-18 (real, debit card purchase wording)',
          pattern:
            'INR\\s+(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+\\(Incl\\.\\s+TCS\\s+as\\s+applicable\\)\\s+is\\s+debited\\s+from\\s+your\\s+(?<bank>IndusInd)\\s+(?:A/C|A/c|account)\\s+No\\s+(?<account>[Xx*0-9-]+)\\s+towards\\s+(?<description>Debit\\s+Card\\s+Purchase)\\.\\s+Avl\\s+BAL\\s+is\\s+(?<balance_currency>INR|Rs\\.?|₹)\\s+(?<balance>[0-9,]+(?:\\.[0-9]{1,2})?)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, NEFT/RTGS-style credit wording)',
          pattern:
            "Your\\s+IndusInd\\s+(?:Account|A/C|A/c)\\s+(?<account>[Xx*0-9-]+)\\s+has\\s+been\\s+credited\\s+for\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+towards\\s+(?<description>N/[A-Za-z0-9-]+/[A-Za-z0-9-]+/[A-Za-z0-9 .'-]+?)(?:\\.\\s+Call|\\s+Call)"
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, quarterly interest-credit wording)',
          pattern:
            'INR\\s+(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+has\\s+been\\s+credited\\s+to\\s+your\\s+(?<bank>IndusInd)\\s+(?:A/C|A/c|Account)\\s+(?<account>[Xx*0-9-]+)\\s+towards\\s+(?<description>Interest\\s+Credit\\s+for\\s+the\\s+quarter\\s+ending\\s+[A-Za-z]+)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, IMPS debit wording)',
          pattern:
            'Your\\s+(?<bank>IndusInd)\\s+(?:Account|A/C|A/c)\\s+(?<account>[Xx*0-9-]+)\\s+has\\s+been\\s+debited\\s+for\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+towards\\s+IMPS/(?<reference>[A-Za-z0-9-]+)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, IMPS credit wording)',
          pattern:
            'Your\\s+(?<bank>IndusInd)\\s+(?:Account|A/C|A/c)\\s+(?<account>[Xx*0-9-]+)\\s+has\\s+been\\s+credited\\s+for\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+towards\\s+IMPS/(?<reference>[A-Za-z0-9-]+)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, cheque withdrawal wording)',
          pattern:
            'INR\\s+(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+is\\s+debited\\s+from\\s+your\\s+(?:A/C|A/c|Account)\\s+(?<account>[Xx*0-9-]+)\\s+towards\\s+(?<description>Cheque\\s+withdrawal)\\.\\s+Avl\\s+BAL\\s+(?<balance_currency>INR|Rs\\.?|₹)\\s+(?<balance>[0-9,]+(?:\\.[0-9]{1,2})?)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, card annual-charge wording)',
          pattern:
            'IndusInd\\s+(?:A/C|A/c|Account)\\s+Debited;\\s*(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+Ref-To\\s+(?<description>Card\\s+Annual\\s+Charge)\\s+(?<reference>[0-9]+)\\.Bal\\s+(?<balance_currency>INR|Rs\\.?|₹)\\s*(?<balance>[0-9,]+(?:\\.[0-9]{1,2})?)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, VPA + RRN credit wording)',
          pattern:
            '(?:A/c|A/C|Account)\\s+(?<account>[Xx*0-9-]+)\\s+credited\\s+by\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)\\s+from\\s+(?<counterparty>[A-Za-z0-9._-]+@[A-Za-z0-9.-]+)\\.\\s*RRN:\\s*(?<reference>[A-Za-z0-9-]+)'
        }
      ]
    },
    {
      bankId: 'bob',
      senderIdPatterns: ['^[A-Z]{2}-BOBTXN$', '^BOBTXN$', '^[A-Z]{2}-BOBTXN-[TSPG]$', '^BOBTXN-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YYYY',
          pattern:
            'Your A\\/c\\s+X+(?<account>\\d{3,6})\\s+is debited by\\s+Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{4})\\s+towards\\s+(?<counterparty>[\\w .]+)-Bank of Baroda'
        }
      ]
    },
    {
      bankId: 'hsbc',
      senderIdPatterns: ['^[A-Z]{2}-HSBCIN$', '^HSBCIN$', '^[A-Z]{2}-HSBCIN-[TSPG]$', '^HSBCIN-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, "is paid from" wording)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            "(?:INR|Rs\\.?|₹)\\s*(?<amount>[\\d,]+(?:\\.\\d{1,2})?)\\s+is\\s+paid\\s+from\\s+(?<bank>[A-Za-z][A-Za-z0-9& .'-]*?)\\s+(?:account|a/c)\\s+(?<account>[X*x*0-9-]+)\\s+to\\s+(?<counterparty>.*?)\\s+on\\s+(?<date>\\d{1,2}[-/][A-Za-z]{3}[-/]\\d{2,4})\\s+with\\s+ref(?:erence)?\\s*[:#]?\\s*(?<reference>[A-Za-z0-9-]+)"
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, "Dear Customer... credited" wording)',
          pattern:
            'HSBC:\\s*Dear\\s+Customer,\\s*your\\s+HSBC\\s+(?:A/c|Acc(?:ount)?)\\s+(?<account>[X*0-9-]+)\\s+has\\s+been\\s+credited\\s+with\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[\\d,]+(?:\\.\\d{1,2})?)[+-]?\\s+on\\s+(?<date>\\d{1,2}[A-Za-z]{3}(?:[-/]\\d{2,4})?)\\s+as\\s+(?<description>.*?)\\s*\\.\\s*Your\\s+(?:available|avl|Avl)\\s+Bal(?:ance)?\\s+is\\s+(?:(?<balance_currency>INR|Rs\\.?|₹)\\s*)?(?<balance>[\\d,]+(?:\\.\\d{1,2})?)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, "Dear Customer... debited" wording)',
          pattern:
            'HSBC:\\s*Dear\\s+Customer,\\s*your\\s+HSBC\\s+(?:A/c|Acc(?:ount)?)\\s+(?<account>[X*0-9-]+)\\s+has\\s+been\\s+debited\\s+with\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[\\d,]+(?:\\.\\d{1,2})?)[+-]?\\s+on\\s+(?<date>\\d{1,2}[A-Za-z]{3}(?:[-/]\\d{2,4})?)\\s+as\\s+(?<description>.*?)\\s*\\.\\s*Your\\s+(?:available|avl|Avl)\\s+Bal(?:ance)?\\s+is\\s+(?:(?<balance_currency>INR|Rs\\.?|₹)\\s*)?(?<balance>[\\d,]+(?:\\.\\d{1,2})?)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, UPI credit wording)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'Your\\s+HSBC\\s+(?:A/c|Acc(?:ount)?)\\s+(?<account>[X*0-9-]+)\\s+is\\s+credited\\s+for\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[\\d,]+(?:\\.\\d{1,2})?)\\s+on\\s+(?<date>\\d{1,2}[-/][A-Za-z]{3}[-/]\\d{2,4})\\s+(?:from|towards)\\s+(?<counterparty>.*?)\\.\\s*UPI\\s+Ref(?:erence)?\\s+No\\.?\\s*[:#]?\\s*(?<reference>[A-Za-z0-9-]+)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, UPI debit wording)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'Your\\s+HSBC\\s+(?:A/c|Acc(?:ount)?)\\s+(?<account>[X*0-9-]+)\\s+is\\s+debited\\s+for\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[\\d,]+(?:\\.\\d{1,2})?)\\s+on\\s+(?<date>\\d{1,2}[-/][A-Za-z]{3}[-/]\\d{2,4})\\s+(?:from|towards)\\s+(?<counterparty>.*?)\\.\\s*UPI\\s+Ref(?:erence)?\\s+No\\.?\\s*[:#]?\\s*(?<reference>[A-Za-z0-9-]+)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, UTR/NEFT/IMPS credit wording)',
          pattern:
            'HSBC:\\s*(?:Dear\\s+Customer,\\s*)?(?:Your\\s+)?A/c\\s+(?<account>[X*0-9-]+)\\s+is\\s+credited\\s+with\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)[+-]?\\s+on\\s+(?<date>[0-9]{1,2}[A-Za-z]{3}(?:[-/][0-9]{2,4})?)\\s+(?:at\\s+(?<time>[0-9]{1,2}[.:][0-9]{2}[.:][0-9]{2})\\s+)?with\\s+UTR\\s+(?<reference>[A-Za-z0-9-]+)\\s+as\\s+(?<transaction_mode>[A-Za-z]+)\\s+(?<transfer_details>.*?)\\s*\\.\\s*(?:Your\\s+)?(?:Avl|available)\\s+Bal(?:ance)?\\s+is\\s+(?:(?<balance_currency>INR|Rs\\.?|₹)\\s*)?(?<balance>[0-9,]+(?:\\.[0-9]{1,2})?)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, UTR/NEFT/IMPS debit wording)',
          pattern:
            'HSBC:\\s*(?:Dear\\s+Customer,\\s*)?(?:Your\\s+)?A/c\\s+(?<account>[X*0-9-]+)\\s+is\\s+debited\\s+with\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[0-9,]+(?:\\.[0-9]{1,2})?)[+-]?\\s+on\\s+(?<date>[0-9]{1,2}[A-Za-z]{3}(?:[-/][0-9]{2,4})?)\\s+(?:at\\s+(?<time>[0-9]{1,2}[.:][0-9]{2}[.:][0-9]{2})\\s+)?with\\s+UTR\\s+(?<reference>[A-Za-z0-9-]+)\\s+as\\s+(?<transaction_mode>[A-Za-z]+)\\s+(?<transfer_details>.*?)\\s*\\.\\s*(?:Your\\s+)?(?:Avl|available)\\s+Bal(?:ance)?\\s+is\\s+(?:(?<balance_currency>INR|Rs\\.?|₹)\\s*)?(?<balance>[0-9,]+(?:\\.[0-9]{1,2})?)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-18 (real, NEFT-credit-destination wording)',
          dateFormat: 'DD-MM-YYYY',
          pattern:
            "HSBC:\\s*Dear\\s+HSBC\\s+Customer,\\s*your\\s+NEFT\\s+transaction\\s+with\\s+reference\\s+number\\s+(?<reference>[A-Za-z0-9-]+)\\s+for\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[\\d,]+(?:\\.\\d{1,2})?)\\s+has\\s+been\\s+credited\\s+to\\s+(?<destination_bank>[A-Za-z0-9& .'-]+)\\s+(?:A/c|Acc(?:ount)?)\\s+(?<destination_account>[X*0-9-]+)\\s+of\\s+(?<counterparty>.*?)\\s+on\\s+(?<date>\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4})"
        },
        {
          transactionType: 'card_swipe',
          addedAt: '2026-08-18 (real, debit card spend wording)',
          pattern:
            'HSBC:\\s*Thank\\s+you\\s+for\\s+using\\s+HSBC\\s+Debit\\s+Card\\s+(?<card>[X*0-9-]+)\\s+for\\s+(?<currency>INR|Rs\\.?|₹)\\s*(?<amount>[\\d,]+(?:\\.\\d{1,2})?)\\s+on\\s+(?<date>[0-9]{1,2}[A-Za-z]{3}(?:[-/][0-9]{2,4})?)\\s+at\\s+(?<counterparty>[^.]+)\\s*\\.\\s*Your\\s+available\\s+bal\\s+is\\s+(?<balance_currency>INR|Rs\\.?|₹)\\s*(?<balance>[\\d,]+(?:\\.\\d{1,2})?)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-18 (real, UPI AutoPay wording)',
          dateFormat: 'DD/MM/YYYY',
          pattern:
            'Dear\\s+Customer,\\s*Your\\s+HSBC\\s+account\\s+has\\s+been\\s+successfully\\s+debited\\s+with\\s+(?:(?<currency>INR|Rs\\.?|₹)\\s*)?(?<amount>[\\d,]+(?:\\.\\d{1,2})?)\\s+on\\s+(?<date>[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})\\s+towards\\s+(?<description>.*?)\\s*,\\s*(?<counterparty>[A-Za-z0-9._-]+@[A-Za-z0-9.-]+)'
        }
      ]
    },
    {
      bankId: 'yesbank',
      senderIdPatterns: ['^[A-Z]{2}-YESBNK$', '^YESBNK$', '^[A-Z]{2}-YESBNK-[TSPG]$', '^YESBNK-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from YES Bank A\\/c\\s+X(?<account>\\d{3,6})\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{2})\\s+towards UPI\\/(?<counterparty>[\\w.@-]+)\\/Ref\\s?(?<reference>\\d+)'
        }
      ]
    },
    {
      bankId: 'pnb',
      senderIdPatterns: ['^[A-Z]{2}-PNBSMS$', '^PNBSMS$', '^[A-Z]{2}-PNBSMS-[TSPG]$', '^PNBSMS-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YYYY',
          pattern:
            'PNB:\\s?Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from A\\/c\\s+X+(?<account>\\d{3,6})\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{4})\\s+for\\s+(?<counterparty>[\\w .]+)\\.\\s+Avail Bal Rs\\.?(?<balance>[\\d,]+\\.?\\d*)'
        }
      ]
    },
    {
      bankId: 'canara',
      senderIdPatterns: ['^[A-Z]{2}-CANBNK$', '^CANBNK$', '^[A-Z]{2}-CANBNK-[TSPG]$', '^CANBNK-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'Canara Bank A\\/c\\s+X+(?<account>\\d{3,6})\\s+debited for Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{2})\\s+UPI Ref\\s?(?<reference>\\d+)'
        }
      ]
    },
    {
      bankId: 'idfcfirst',
      senderIdPatterns: ['^[A-Z]{2}-IDFCFB$', '^IDFCFB$', '^[A-Z]{2}-IDFCFB-[TSPG]$', '^IDFCFB-[TSPG]$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'IDFC FIRST Bank:\\s?Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from a\\/c\\s+X(?<account>\\d{3,6})\\s+on\\s+(?<date>\\d{2}-\\d{2}-\\d{2})\\s+via UPI to\\s+(?<counterparty>[\\w.@-]+)\\s+\\(Ref\\s?(?<reference>\\d+)\\)'
        }
      ]
    }
  ]
};
