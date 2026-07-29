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

/** Parses a date string that may be DD/MM/YYYY, MM/DD/YYYY, or any format `new Date()` understands
 *  (ISO-ish "YYYY-MM-DD HH:mm:ss", "YYYY/Mon/DD HH:mm:ss", etc. — both real-world sample exports used
 *  in this rewrite parse fine via the native constructor). `hint` disambiguates a bare numeric
 *  DD/MM vs MM/DD date; `'auto'` tries the native parser first and falls back to DMY (India-first
 *  product default) only for a bare numeric date the native parser couldn't handle. */
export function parseFlexibleDate(str: string, hint: DateHint = 'auto'): number | null {
  const s = str.trim();
  if (!s) return null;
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);

  if (hint !== 'auto' && numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const y = Number(numeric[3]);
    const [d, mo] = hint === 'DMY' ? [a, b] : [b, a];
    const t = new Date(y, mo - 1, d).getTime();
    return isNaN(t) ? null : t;
  }

  const native = new Date(s).getTime();
  if (!isNaN(native)) return native;

  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const y = Number(numeric[3]);
    const t = new Date(y, a - 1, b).getTime(); // last resort: assume DMY
    return isNaN(t) ? null : t;
  }
  return null;
}
