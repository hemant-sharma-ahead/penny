// SMS transaction-parsing templates (docs/plans/sms-transaction-tracking.md §5) — fetched from a
// small, mostly-static Cloudflare Worker route (`SMS_PATTERNS_BASE`, mirroring
// `core/portfolio/epfInterestRates.ts`'s exact shape) so a bank changing its SMS wording is a
// backend redeploy, not an app-store release. The app ships this exact bundle baked in as an
// offline-first fallback (`SMS_PATTERNS_FALLBACK` below): network access only ever REFRESHES it,
// it's never REQUIRED — parsing works fully offline, including on first install before any fetch
// succeeds.
//
// CRUCIAL, and the reason this doesn't conflict with docs/PRIVACY.md's zero-server-PII model: only
// these templates (regex strings, no user data) ever cross the network. Actual SMS text and every
// field parsed from it (`smsParser.ts`) are matched 100% on-device and never transmitted anywhere.
//
// Bank SMS wording drifts over the years with no authoritative public catalog of "bank X's exact
// format in year Y" to build against (confirmed via research, plan §5) — so `templates` is a LIST
// per bank, not one entry per transaction type, tried in order (first structural match wins) rather
// than the caller having to guess which era a given message belongs to. `addedAt` is a human
// changelog note, not something parsed/compared. Expect this library to grow incrementally as real
// scans surface gaps (the "N SMS from known banks couldn't be parsed" counter, §5/§7, is that
// discovery loop) — the set below covers each bank's current-era wording at minimum, with a second,
// older-era template added for the banks a real historical scan is most likely to hit first.
//
// Sender-ID suffix update (2026-08-17) — TRAI's SMS header suffix mandate, effective 6 May 2025
// (per the amended Telecom Commercial Communications Customer Preference Regulations), requires
// every registered header to carry a single-letter category suffix appended after the existing
// 6-character brand code: `-T` (Transactional), `-S` (Service — real-world DLT registrations show
// banks' own transactional/account-activity alerts commonly filed under this category, not just
// `-T`), `-P` (Promotional), `-G` (Government). So a bank's SMS sender can now legitimately arrive
// as `VM-HDFCBK-T` or `VM-HDFCBK-S`, not just the pre-2025 `VM-HDFCBK`/`HDFCBK`. Every bank below
// gained two additive sender patterns (prefixed and unprefixed, `-[TSPG]` tolerant of any of the
// four real category letters rather than assuming one) alongside its original ones — the old,
// un-suffixed patterns are kept exactly as they were, never removed, since a historical multi-year
// scan will keep encountering plenty of genuine pre-May-2025 messages that never had a suffix at
// all. (Message-BODY wording is deliberately NOT touched by this same research pass — there's no
// equivalent authoritative source for "how has bank X's message text changed over 15 years," per
// this file's own note above; that stays the append-only, gap-driven-discovery model it already is.)
import { SMS_PATTERNS_BASE } from '@/core/net/apiBase';
import { getItem, setItem } from '@/core/portfolio/ratesStorage';
import type { BankPresetId } from '@/core/db/types';

export type SmsTransactionType = 'debit' | 'credit' | 'upi_sent' | 'upi_received' | 'card_swipe' | 'refund';

export interface SmsTemplateEntry {
  transactionType: SmsTransactionType;
  /** Regex source string (not a `RegExp` — this bundle is JSON, fetched from a Worker). Must use
   *  `i` semantics implicitly (the parser always compiles with the `i` flag) and MAY define any of
   *  the named capture groups `smsParser.ts` looks for: `amount`, `account`, `card`,
   *  `counterparty`, `reference`, `balance`, `date` — whichever this particular wording actually
   *  contains; absent groups are simply not captured for this match. */
  pattern: string;
  /** Token-format directive for `date` (same grammar `core/bank-import/csvParser.ts`'s
   *  `parseStatementDate` already parses, e.g. `'DD-MMM-YY'`, `'DD/MM/YY'`) — required whenever
   *  `pattern` defines a `date` group, ignored otherwise. */
  dateFormat?: string;
  /** Free-text note on when/why this template was added — not parsed programmatically (plan §5: no
   *  reliable way to bound eras precisely), purely a human changelog for the next person adding a
   *  template. */
  addedAt: string;
}

export interface BankSmsPatternSet {
  bankId: BankPresetId;
  /** Regex source strings matched against the SMS sender/shortcode as reported by the OS (e.g.
   *  "VM-HDFCBK", "AD-HDFCBK", or — post-6-May-2025 TRAI header suffix mandate — "VM-HDFCBK-T"/
   *  "VM-HDFCBK-S") — never the phone's own number. */
  senderIdPatterns: string[];
  templates: SmsTemplateEntry[];
}

export interface SmsPatternBundle {
  version: number;
  banks: BankSmsPatternSet[];
}

/** The initial bundle, seeded 2026-08-15. HDFC/ICICI/SBI/Axis/Kotak carry both a current-era and an
 *  older, terser-era template per direction (the banks a real historical multi-year scan is most
 *  likely to actually exercise both eras of); the remaining banks start with current-era coverage
 *  only, per the append-only growth model above. */
export const SMS_PATTERNS_FALLBACK: SmsPatternBundle = {
  version: 1,
  banks: [
    {
      bankId: 'hdfc',
      senderIdPatterns: ['^[A-Z]{2}-HDFCBK$', '^HDFCBK$', '^[A-Z]{2}-HDFCBK-[TSPG]$', '^HDFCBK-[TSPG]$'],
      // Replaced 2026-08-18 with a verified real-world set (9 templates) — the 3 templates here before
      // this date were synthetic placeholders, never checked against real HDFC message text. These
      // patterns follow the provided source regexes as-given, using the provided field-name
      // convention (account, card, reference, date) verbatim — 2026-08-18: Penny's own schema
      // (`SmsCaptureGroupName` in smsParser.ts) was renamed to adopt these names as canonical, so no
      // renaming is needed on this side either. Every other named group (currency, bank, description,
      // counterparty_account, time, balance_currency) is kept exactly as provided, even though the
      // parser doesn't read it (it just won't be extracted, same as any other unrecognized name). The
      // one genuine fix: the debit-card-alert regex is missing a literal "On " before "HDFC Bank" that
      // 2 of its own 4 real sample messages actually have — added `(?:On\s+)?` so it matches its own
      // samples.
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
          // Debit card spend alert — the one genuine bug fix, see the block comment above: `(?:On\s+)?`
          // added right before the (already-present) `(?:via\s+)?` so this matches its own real samples.
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
          // Older ICICI wording — "A/c" abbreviation, "Avl bal" spelled lowercase, no UPI ref field.
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
          // Older SBI wording — "Dear Customer" preamble, "A/c" (not "A/C"), full "transfer to" verb.
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
      // Replaced 2026-08-18 with a verified real-world set (8 templates) — see the HDFC block's own
      // comment above for the shared conversion approach (provided field-name convention kept
      // verbatim, everything else kept as provided). None of these real messages included a
      // transaction date at all, so no template here defines `dateFormat`.
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
      // Replaced 2026-08-18 with a verified real-world set (10 templates) — see the HDFC block's own
      // comment above for the shared conversion approach. Three of the real source wordings covered
      // BOTH credit and debit in one regex (a runtime-captured `credited|debited` choice) — split into
      // a matched credit/debit pair here (the one structural change beyond the required renames), since
      // this schema's `transactionType` is a fixed property per template, not something read at match
      // time; the alternation becomes a literal word in each half instead.
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

const CACHE_KEY = 'penny_sms_patterns_v1';
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — bank formats drift far less often than
// this, but more often than EPF/PPF rates (once a year), since a template addition is a normal,
// possibly-frequent maintenance event early on rather than a rare regulatory change.

let memCache: SmsPatternBundle | null = null;

interface CachedBundle {
  bundle: SmsPatternBundle;
  fetchedAt: number;
}

function isValidBundle(value: unknown): value is SmsPatternBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as SmsPatternBundle;
  return (
    typeof bundle.version === 'number' &&
    Array.isArray(bundle.banks) &&
    bundle.banks.every(
      (b): b is BankSmsPatternSet =>
        !!b &&
        typeof b === 'object' &&
        typeof b.bankId === 'string' &&
        Array.isArray(b.senderIdPatterns) &&
        Array.isArray(b.templates)
    )
  );
}

/** Returns the best pattern bundle available: a fresh local cache if one exists and isn't stale,
 *  otherwise a live fetch from the Worker (cached locally on success), otherwise — if offline or the
 *  Worker is unreachable — silently falls back to `SMS_PATTERNS_FALLBACK` so parsing always has SOME
 *  bundle to work with. Never throws. */
export async function getSmsPatternBundle(): Promise<SmsPatternBundle> {
  if (memCache) return memCache;

  try {
    const cached = await getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedBundle;
      if (isValidBundle(parsed.bundle) && Date.now() - parsed.fetchedAt < REFRESH_INTERVAL_MS) {
        memCache = parsed.bundle;
        return memCache;
      }
    }
  } catch {
    // corrupt cache — fall through to a live fetch
  }

  if (SMS_PATTERNS_BASE) {
    try {
      const res = await fetch(SMS_PATTERNS_BASE);
      if (res.ok) {
        const json: unknown = await res.json();
        if (isValidBundle(json)) {
          memCache = json;
          await setItem(CACHE_KEY, JSON.stringify({ bundle: json, fetchedAt: Date.now() } satisfies CachedBundle));
          return memCache;
        }
      }
    } catch {
      // offline / worker unreachable — fall through to the baked-in bundle
    }
  }

  memCache = SMS_PATTERNS_FALLBACK;
  return memCache;
}
