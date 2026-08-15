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
import { SMS_PATTERNS_BASE } from '@/core/net/apiBase';
import { getItem, setItem } from '@/core/portfolio/ratesStorage';
import type { BankPresetId } from '@/core/db/types';

export type SmsTransactionType = 'debit' | 'credit' | 'upi_sent' | 'upi_received' | 'card_swipe' | 'refund';

export interface SmsTemplateEntry {
  transactionType: SmsTransactionType;
  /** Regex source string (not a `RegExp` — this bundle is JSON, fetched from a Worker). Must use
   *  `i` semantics implicitly (the parser always compiles with the `i` flag) and MAY define any of
   *  the named capture groups `smsParser.ts` looks for: `amount`, `acctLast4`, `cardLast4`,
   *  `counterparty`, `ref`, `balance`, `dateStr` — whichever this particular wording actually
   *  contains; absent groups are simply not captured for this match. */
  pattern: string;
  /** Token-format directive for `dateStr` (same grammar `core/bank-import/csvParser.ts`'s
   *  `parseStatementDate` already parses, e.g. `'DD-MMM-YY'`, `'DD/MM/YY'`) — required whenever
   *  `pattern` defines a `dateStr` group, ignored otherwise. */
  dateFormat?: string;
  /** Free-text note on when/why this template was added — not parsed programmatically (plan §5: no
   *  reliable way to bound eras precisely), purely a human changelog for the next person adding a
   *  template. */
  addedAt: string;
}

export interface BankSmsPatternSet {
  bankId: BankPresetId;
  /** Regex source strings matched against the SMS sender/shortcode as reported by the OS (e.g.
   *  "VM-HDFCBK", "AD-HDFCBK") — never the phone's own number. */
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
          // Older, terser HDFC wording (pre-UPI-detail era) — narration-only, no VPA, "Info:" field.
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
          // Older ICICI wording — "A/c" abbreviation, "Avl bal" spelled lowercase, no UPI ref field.
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
          // Older SBI wording — "Dear Customer" preamble, "A/c" (not "A/C"), full "transfer to" verb.
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
