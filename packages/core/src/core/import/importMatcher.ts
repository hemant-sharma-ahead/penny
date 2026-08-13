// Generic CSV column-mapping engine shared by every import format. Penny/YNAB/Cashew/MoneyView/Custom
// are each just a *preset* — a priority-ordered synonym list per Penny field — over this one matcher,
// rather than bespoke per-format parsing code (that's what this file replaces; see importParsers.ts).
//
// Column resolution is two-pass per field: try every synonym for an EXACT header match first, and only
// if none match at all, fall back to substring matches. This matters for real files with two
// same-substring columns — e.g. Cashew's "amount" + "amount unpaid", or MoneyView's "Account Id" (more
// specific) + "Bank Name" (more generic) — a naive single-pass substring scan can pick the wrong one
// depending on column order; two-pass exact-then-substring does not.

export interface ColumnSynonyms {
  date: string[];
  description: string[];
  category: string[];
  account: string[];
  notes: string[];
  tags: string[];
  paymentMode: string[];
  /** Explicit expense/income/transfer text column (Penny's own `Type`), overrides sign-based typing. */
  typeText: string[];
  /** Single signed/unsigned amount column. */
  amount: string[];
  /** Debit/outflow column, for the split-amount pattern (YNAB Outflow, MoneyView Debit). */
  outflow: string[];
  /** Credit/inflow column, for the split-amount pattern (YNAB Inflow, MoneyView Credit). */
  inflow: string[];
  /** Explicit income boolean/flag column (Cashew's `income` TRUE/FALSE). */
  incomeFlag: string[];
}

export interface ColumnMapping {
  date: number;
  description: number;
  category: number;
  account: number;
  notes: number;
  tags: number;
  paymentMode: number;
  typeText: number;
  amount: number;
  outflow: number;
  inflow: number;
  incomeFlag: number;
}

export const PENNY_FIELDS: (keyof ColumnMapping)[] = [
  'date',
  'description',
  'category',
  'account',
  'notes',
  'tags',
  'paymentMode',
  'typeText',
  'amount',
  'outflow',
  'inflow',
  'incomeFlag'
];

const EMPTY_SYNONYMS: ColumnSynonyms = {
  date: [],
  description: [],
  category: [],
  account: [],
  notes: [],
  tags: [],
  paymentMode: [],
  typeText: [],
  amount: [],
  outflow: [],
  inflow: [],
  incomeFlag: []
};

function findColumn(header: string[], synonyms: string[]): number {
  for (const syn of synonyms) {
    const exact = header.findIndex((h) => h === syn);
    if (exact >= 0) return exact;
  }
  for (const syn of synonyms) {
    const partial = header.findIndex((h) => h.includes(syn));
    if (partial >= 0) return partial;
  }
  return -1;
}

/** Guesses a full column mapping from a CSV header row + a format's synonym priority lists. */
export function guessColumnMapping(header: string[], synonyms: Partial<ColumnSynonyms>): ColumnMapping {
  const s = { ...EMPTY_SYNONYMS, ...synonyms };
  const h = header.map((c) => c.trim().toLowerCase());
  return {
    date: findColumn(h, s.date),
    description: findColumn(h, s.description),
    category: findColumn(h, s.category),
    account: findColumn(h, s.account),
    notes: findColumn(h, s.notes),
    tags: findColumn(h, s.tags),
    paymentMode: findColumn(h, s.paymentMode),
    typeText: findColumn(h, s.typeText),
    amount: findColumn(h, s.amount),
    outflow: findColumn(h, s.outflow),
    inflow: findColumn(h, s.inflow),
    incomeFlag: findColumn(h, s.incomeFlag)
  };
}

export interface AmountResult {
  amount: number;
  type: 'expense' | 'income';
}

function parseAmt(s: string): number {
  return parseFloat(s.replace(/[,₹\s]/g, '')) || 0;
}

/** Split debit/credit (or outflow/inflow) columns take priority over a single signed amount column,
 *  when both patterns are somehow present. Returns null when no usable amount was found. */
export function resolveAmount(cols: string[], mapping: ColumnMapping): AmountResult | null {
  if (mapping.outflow >= 0 && mapping.inflow >= 0) {
    const out = Math.abs(parseAmt(cols[mapping.outflow] ?? ''));
    const inc = Math.abs(parseAmt(cols[mapping.inflow] ?? ''));
    if (out > 0) return { amount: out, type: 'expense' };
    if (inc > 0) return { amount: inc, type: 'income' };
    return null;
  }
  if (mapping.amount >= 0) {
    const signed = parseAmt(cols[mapping.amount] ?? '');
    if (!signed) return null;
    if (mapping.incomeFlag >= 0) {
      const flag = (cols[mapping.incomeFlag] ?? '').trim().toLowerCase();
      const isIncome = flag === 'true' || flag === 'yes' || flag === '1';
      return { amount: Math.abs(signed), type: isIncome ? 'income' : 'expense' };
    }
    return { amount: Math.abs(signed), type: signed < 0 ? 'expense' : 'income' };
  }
  return null;
}

export type DateHint = 'DMY' | 'MDY' | 'auto';

const MONTH_ABBREVIATIONS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

/** Parses a date string that may be a bare numeric DD/MM/YYYY or MM/DD/YYYY date, a named-month
 *  "YYYY/Mon/DD[ HH:mm:ss]" date (MoneyView's own export format), or any other format `new Date()`
 *  understands (ISO-ish "YYYY-MM-DD HH:mm:ss", etc.). `hint` disambiguates a bare numeric DD/MM vs
 *  MM/DD date; `'auto'` means DMY (India-first product default) — it must NOT be handed to the native
 *  `Date` constructor: a bare "NN/NN/YYYY" string is exactly the shape every engine's lenient (non-ISO)
 *  string parser guesses at using its own convention (US MM/DD/YYYY), which "succeeds" (no `NaN`) for
 *  any day ≤ 12 by silently swapping day/month, and for a day > 12 overflows the month argument into a
 *  wildly wrong future date instead of failing — found + fixed 2026-08-09 via real on-device
 *  Cashew/MoneyView imports producing transactions dated up to two years off from their actual
 *  statement date. Native parsing is only safe (and only used) for a string that ISN'T this bare
 *  numeric shape, where there's no day/month ambiguity to guess at.
 *
 *  2026-08-13 fix — the named-month "YYYY/Mon/DD HH:mm:ss" shape (MoneyView's own real export format)
 *  used to fall through to the native `new Date(s)` constructor too, on the assumption (recorded in
 *  this comment until today) that "real-world sample exports used in this rewrite parse fine via the
 *  native constructor" — true for V8 (Chrome/Node, i.e. `pnpm web` and any local repro script), but
 *  Hermes (the JS engine actually running on a native Android/iOS build) is spec-strict and does NOT
 *  understand this non-ISO shape, silently returning Invalid Date for every single row. A real,
 *  full-year MoneyView export (1500+ rows) therefore parsed 1562/1563 rows fine on RN Web and 0/1563 on
 *  a real device — every row rejected as unparseable, which then crashed the native app outright when
 *  `UnparsedRows.tsx` tried to render 1500+ unvirtualized "fix this row" cards at once (see that file's
 *  own doc comment for the matching defense-in-depth fix). Parsing this shape explicitly here, rather
 *  than relying on an engine's non-portable lenient `Date` parsing, makes the result identical on every
 *  JS engine. */
export function parseFlexibleDate(str: string, hint: DateHint = 'auto'): number | null {
  const s = str.trim();
  if (!s) return null;
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);

  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const y = Number(numeric[3]);
    const [d, mo] = hint === 'MDY' ? [b, a] : [a, b];
    const t = new Date(y, mo - 1, d).getTime();
    return isNaN(t) ? null : t;
  }

  const namedMonth = /^(\d{4})[/-]([A-Za-z]{3})[A-Za-z]*[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (namedMonth) {
    const y = Number(namedMonth[1]);
    const mo = MONTH_ABBREVIATIONS[(namedMonth[2] ?? '').toLowerCase()];
    const d = Number(namedMonth[3]);
    if (mo === undefined) return null;
    const hh = namedMonth[4] ? Number(namedMonth[4]) : 0;
    const min = namedMonth[5] ? Number(namedMonth[5]) : 0;
    const ss = namedMonth[6] ? Number(namedMonth[6]) : 0;
    const t = new Date(y, mo, d, hh, min, ss).getTime();
    return isNaN(t) ? null : t;
  }

  const native = new Date(s).getTime();
  return isNaN(native) ? null : native;
}
