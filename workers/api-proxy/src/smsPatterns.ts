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
      senderIdPatterns: ['^[A-Z]{2}-HDFCBK$', '^HDFCBK$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from a\\/c\\s+X+(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}-[A-Za-z]{3}-\\d{2})\\s+to\\s+VPA\\s+(?<counterparty>[\\w.@-]+)\\s+\\(UPI Ref No\\s+(?<ref>\\d+)\\)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+credited to a\\/c\\s+X+(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}-[A-Za-z]{3}-\\d{2})\\s+by\\s+VPA\\s+(?<counterparty>[\\w.@-]+)\\s+\\(UPI Ref No\\s+(?<ref>\\d+)\\)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (older era, ~2012-2016)',
          dateFormat: 'DD/MM/YY',
          pattern:
            'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from A\\/c No\\.\\s+X+(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}\\/\\d{2}\\/\\d{2})\\.\\s+Info:\\s+(?<counterparty>[\\w .]+)\\.\\s+Avl Bal:\\s?Rs\\.?(?<balance>[\\d,]+\\.?\\d*)'
        }
      ]
    },
    {
      bankId: 'icici',
      senderIdPatterns: ['^[A-Z]{2}-ICICIB$', '^ICICIB$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'ICICI Bank Acct\\s+X+(?<acctLast4>\\d{3,6})\\s+debited with Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<dateStr>\\d{2}-[A-Za-z]{3}-\\d{2});\\s+(?<counterparty>[\\w .]+)\\s+credited\\.\\s+UPI:\\s?(?<ref>\\d+)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'ICICI Bank Acct\\s+X+(?<acctLast4>\\d{3,6})\\s+credited with Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<dateStr>\\d{2}-[A-Za-z]{3}-\\d{2})\\s+from\\s+(?<counterparty>[\\w .]+)\\.\\s+UPI:\\s?(?<ref>\\d+)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (older era, ~2013-2017)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'ICICI Bank:\\s?Acct\\s+X+(?<acctLast4>\\d{3,6})\\s+debited Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{2})\\s+towards\\s+(?<counterparty>[\\w .]+)\\.\\s+Avl bal Rs\\.?(?<balance>[\\d,]+\\.?\\d*)'
        }
      ]
    },
    {
      bankId: 'sbi',
      senderIdPatterns: ['^[A-Z]{2}-SBIINB$', '^SBIINB$', '^[A-Z]{2}-SBIUPI$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'A\\/C\\s+X(?<acctLast4>\\d{3,6})\\s+debited by\\s+(?<amount>[\\d,]+\\.?\\d*)\\s+on date\\s+(?<dateStr>\\d{2}[A-Za-z]{3}\\d{2})\\s+trf to\\s+(?<counterparty>[\\w .]+)\\s+Refno\\s?(?<ref>\\d+)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MMM-YY',
          pattern:
            'A\\/C\\s+X(?<acctLast4>\\d{3,6})\\s+credited by\\s+(?<amount>[\\d,]+\\.?\\d*)\\s+on date\\s+(?<dateStr>\\d{2}[A-Za-z]{3}\\d{2})\\s+by\\s+(?<counterparty>[\\w .]+)\\s+Refno\\s?(?<ref>\\d+)'
        },
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (older era, ~2014-2018)',
          dateFormat: 'DD/MM/YY',
          pattern:
            'Dear Customer,\\s?Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from A\\/c\\s+X+(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}\\/\\d{2}\\/\\d{2})\\s+transfer to\\s+(?<counterparty>[\\w .@]+)\\s+Ref No\\s?(?<ref>\\d+)'
        }
      ]
    },
    {
      bankId: 'axis',
      senderIdPatterns: ['^[A-Z]{2}-AXISBK$', '^AXISBK$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YYYY',
          pattern:
            'Axis Bank:\\s?INR\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from A\\/c no\\.\\s+X+(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{4})\\s+towards UPI\\/P2M\\/(?<ref>\\d+)\\/(?<counterparty>[\\w .]+)\\.\\s+Avl bal:\\s?INR\\s?(?<balance>[\\d,]+\\.?\\d*)'
        },
        {
          transactionType: 'credit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YYYY',
          pattern:
            'Axis Bank:\\s?INR\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+credited to A\\/c no\\.\\s+X+(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{4})\\s+towards UPI\\/P2A\\/(?<ref>\\d+)\\/(?<counterparty>[\\w .]+)\\.\\s+Avl bal:\\s?INR\\s?(?<balance>[\\d,]+\\.?\\d*)'
        }
      ]
    },
    {
      bankId: 'kotak',
      senderIdPatterns: ['^[A-Z]{2}-KOTAKB$', '^KOTAKB$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from Kotak Bank AC\\s+X(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{2})\\s+for UPI\\/(?<counterparty>[\\w.@-]+)\\/Ref\\s?(?<ref>\\d+)\\.\\s+Avl Bal Rs\\.?(?<balance>[\\d,]+\\.?\\d*)'
        },
        {
          transactionType: 'card_swipe',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+spent on Kotak (?:Debit|Credit) Card\\s+X(?<cardLast4>\\d{4})\\s+at\\s+(?<counterparty>[\\w .]+)\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{2})'
        }
      ]
    },
    {
      bankId: 'indusind',
      senderIdPatterns: ['^[A-Z]{2}-INDUSB$', '^INDUSB$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'IndusInd Bank:\\s?Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from A\\/c\\s+X(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{2})\\s+UPI Ref\\s?(?<ref>\\d+)\\s+to\\s+(?<counterparty>[\\w.@-]+)'
        }
      ]
    },
    {
      bankId: 'bob',
      senderIdPatterns: ['^[A-Z]{2}-BOBTXN$', '^BOBTXN$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YYYY',
          pattern:
            'Your A\\/c\\s+X+(?<acctLast4>\\d{3,6})\\s+is debited by\\s+Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{4})\\s+towards\\s+(?<counterparty>[\\w .]+)-Bank of Baroda'
        }
      ]
    },
    {
      bankId: 'hsbc',
      senderIdPatterns: ['^[A-Z]{2}-HSBCIN$', '^HSBCIN$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD/MM/YYYY',
          pattern:
            'HSBC:\\s?INR\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from a\\/c\\s+X+(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}\\/\\d{2}\\/\\d{4})\\s+for\\s+(?<counterparty>[\\w .]+)'
        }
      ]
    },
    {
      bankId: 'yesbank',
      senderIdPatterns: ['^[A-Z]{2}-YESBNK$', '^YESBNK$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from YES Bank A\\/c\\s+X(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{2})\\s+towards UPI\\/(?<counterparty>[\\w.@-]+)\\/Ref\\s?(?<ref>\\d+)'
        }
      ]
    },
    {
      bankId: 'pnb',
      senderIdPatterns: ['^[A-Z]{2}-PNBSMS$', '^PNBSMS$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YYYY',
          pattern:
            'PNB:\\s?Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from A\\/c\\s+X+(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{4})\\s+for\\s+(?<counterparty>[\\w .]+)\\.\\s+Avail Bal Rs\\.?(?<balance>[\\d,]+\\.?\\d*)'
        }
      ]
    },
    {
      bankId: 'canara',
      senderIdPatterns: ['^[A-Z]{2}-CANBNK$', '^CANBNK$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'Canara Bank A\\/c\\s+X+(?<acctLast4>\\d{3,6})\\s+debited for Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{2})\\s+UPI Ref\\s?(?<ref>\\d+)'
        }
      ]
    },
    {
      bankId: 'idfcfirst',
      senderIdPatterns: ['^[A-Z]{2}-IDFCFB$', '^IDFCFB$'],
      templates: [
        {
          transactionType: 'debit',
          addedAt: '2026-08-15 (current era)',
          dateFormat: 'DD-MM-YY',
          pattern:
            'IDFC FIRST Bank:\\s?Rs\\.?(?<amount>[\\d,]+\\.?\\d*)\\s+debited from a\\/c\\s+X(?<acctLast4>\\d{3,6})\\s+on\\s+(?<dateStr>\\d{2}-\\d{2}-\\d{2})\\s+via UPI to\\s+(?<counterparty>[\\w.@-]+)\\s+\\(Ref\\s?(?<ref>\\d+)\\)'
        }
      ]
    }
  ]
};
