import {
  guessColumnMapping,
  resolveAmount,
  parseFlexibleDate,
  type ColumnMapping,
  type ColumnSynonyms
} from './importMatcher';

export interface ParsedRow {
  date: number; // epoch ms
  amount: number; // always positive
  description: string;
  categoryName: string; // raw name from file
  type: 'expense' | 'income' | 'transfer';
  account?: string; // raw account/bank name from file, if the format has one
  paymentMode?: string;
  hashtags: string[];
  notes?: string;
  /** Raw Bank Name text (2026-08-14, CSV-import redesign) — independent of whichever column `account`
   *  itself resolved to; see `ColumnMapping.bankName`'s doc comment in importMatcher.ts. */
  bankName?: string;
  /** Raw Account Type text, e.g. "bank"/"cash"/"debit-card"/"credit-card" — same 2026-08-14 addition. */
  accountType?: string;
}

/** A source row that couldn't be turned into a ParsedRow — surfaced in the wizard's "needs attention"
 *  list instead of being silently dropped (the original behavior, found 2026-07-28 to hide real data
 *  loss from the user with zero visibility). */
export interface RejectedRow {
  /** 1-based, counting only data rows (header excluded) — matches what a spreadsheet row number minus
   *  the header would show. */
  rowIndex: number;
  raw: string[];
  reason: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  rejected: RejectedRow[];
  /** Total data rows in the file (rows.length + rejected.length), for the "N rows read" summary. */
  totalDataRows: number;
}

export type ImportFormat = 'penny' | 'ynab' | 'cashew' | 'moneyview' | 'custom';

// Deliberately excludes 'custom' — apps/mobile's import wizard (not yet ported to the new
// resolution-based flow, see importPipeline.ts's legacy exports) renders one tile per entry in this
// list, and has no Map-columns step to handle Custom yet. apps/web-react's new UploadStep adds 'custom'
// as its own explicit 5th tile instead of getting it from this constant.
export const IMPORT_FORMATS: ImportFormat[] = ['penny', 'ynab', 'cashew', 'moneyview'];

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  penny: 'Penny CSV',
  ynab: 'YNAB',
  cashew: 'Cashew',
  moneyview: 'MoneyView',
  custom: 'Custom / other'
};

/** Human-readable expected column hint per format, shown on the upload step. */
export const FORMAT_COLUMNS: Record<ImportFormat, string> = {
  penny: 'Date, Amount, Description, Category, Type, PaymentMode, Tags, Notes',
  ynab: 'Date, Payee, Memo, Outflow, Inflow (or Amount)',
  cashew: 'Date, Title, Amount, Category, Account, Note',
  moneyview: 'Date, Merchant/Receiver/Sender, Credit/Debit (or Amount), Category, Account Id/Bank Name',
  custom: "Any CSV with a header row — you'll map columns to Penny's fields yourself, with a smart starting guess"
};

/** Priority-ordered synonym lists per format — each is just a preset over importMatcher's generic
 *  column-guessing engine, not bespoke parsing code. Priority order matters: e.g. MoneyView's "account
 *  id" is listed before "bank name" so the more specific column wins when a real export has both. */
export const FORMAT_SYNONYMS: Record<Exclude<ImportFormat, 'custom'>, Partial<ColumnSynonyms>> = {
  penny: {
    date: ['date'],
    description: ['description'],
    category: ['category'],
    typeText: ['type'],
    paymentMode: ['paymentmode', 'payment mode'],
    tags: ['tags'],
    notes: ['notes'],
    amount: ['amount']
  },
  ynab: {
    date: ['date'],
    description: ['payee', 'memo'],
    category: ['category'],
    outflow: ['outflow'],
    inflow: ['inflow'],
    amount: ['amount']
  },
  cashew: {
    date: ['date'],
    description: ['title', 'name', 'description'],
    category: ['category name', 'category'],
    account: ['account'],
    notes: ['note'],
    amount: ['amount'],
    incomeFlag: ['income']
  },
  moneyview: {
    date: ['date'],
    description: ['merchant/receiver/sender', 'merchant', 'narration', 'particulars', 'description'],
    category: ['category', 'subcategory'],
    account: ['account id', 'bank name', 'account'],
    outflow: ['debit'],
    inflow: ['credit'],
    amount: ['amount'],
    // Was entirely absent (found 2026-08-14): the `paymentMode` field/write-through already exists
    // end-to-end for every other format, but a real MoneyView export's " Payment Type" column (leading
    // space trimmed by guessColumnMapping) never got mapped to it, so payment mode silently never made
    // it onto any MoneyView-imported transaction.
    paymentMode: ['payment type', 'payment mode'],
    notes: ['notes'],
    // Added 2026-08-14 for the card→account merge suggestion (see importAccountResolution.ts's
    // suggestCardAccountMerges) — independent of `account` above, which a real MoneyView export's
    // higher-priority "Account Id" column usually wins instead of "Bank Name".
    bankName: ['bank name'],
    accountType: ['account type']
  }
};

/** Custom mode's starting guess — no format bias, just the broadest reasonable synonym set so a truly
 *  unknown CSV still gets a sensible pre-filled mapping instead of a blank one. */
export const CUSTOM_SYNONYMS: Partial<ColumnSynonyms> = {
  date: ['date', 'txn date', 'transaction date'],
  description: ['description', 'narration', 'merchant', 'payee', 'particulars', 'details', 'title'],
  category: ['category', 'subcategory'],
  account: ['account', 'account id', 'bank', 'wallet'],
  notes: ['notes', 'note', 'memo', 'remarks'],
  tags: ['tags', 'labels'],
  paymentMode: ['payment mode', 'payment type', 'mode'],
  typeText: ['type', 'txn type'],
  amount: ['amount', 'value'],
  outflow: ['debit', 'outflow', 'withdrawal'],
  inflow: ['credit', 'inflow', 'deposit'],
  incomeFlag: ['income', 'is income']
};

const FORMAT_DATE_HINT: Record<ImportFormat, 'DMY' | 'MDY' | 'auto'> = {
  penny: 'DMY',
  ynab: 'MDY',
  cashew: 'auto',
  moneyview: 'auto',
  custom: 'auto'
};

/** CSV tokenizer — scans the ENTIRE text once, tracking quote state across the whole stream, so a
 *  quoted field containing a literal embedded newline (common in a free-text `note`/`Notes` column,
 *  e.g. Cashew's multi-line notes) is treated as content within that field, not a row break. Only an
 *  UNQUOTED `\n`/`\r\n` ends a row. Replaces the old line-then-quote-parse approach (`text.split(/\r?\n/)`
 *  followed by a per-line quote parser), which fragmented any such field into bogus extra rows because
 *  it split into lines before any quote-awareness existed — confirmed 2026-07-28 against a real Cashew
 *  file that read as 75 rows instead of the actual 69.
 *
 *  Double-quote escaping (`""` inside a quoted field → literal `"`) and per-cell trimming match the
 *  previous `splitLine()` behavior exactly. Blank lines and `#`-prefixed comment lines are dropped here
 *  (after tokenizing, keyed off the row's first cell) rather than by pre-filtering raw text lines. */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  let firstCellQuoted = false;

  const endCell = () => {
    cols.push(cur.trim());
    cur = '';
  };

  const endRow = () => {
    endCell();
    const isBlank = cols.length === 1 && cols[0] === '';
    const isComment = !isBlank && !firstCellQuoted && (cols[0] ?? '').startsWith('#');
    if (!isBlank && !isComment) rows.push(cols);
    cols = [];
    firstCellQuoted = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (inQuotes) {
        inQuotes = false;
      } else {
        inQuotes = true;
        if (cols.length === 0 && cur === '') firstCellQuoted = true;
      }
    } else if (ch === ',' && !inQuotes) {
      endCell();
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++; // treat \r\n as one terminator
      endRow();
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || cols.length > 0) endRow(); // final row, even without a trailing newline

  return rows;
}

function parseLines(text: string): string[][] {
  return tokenizeCsv(text);
}

/** The header row of a CSV, or null if the text is empty — used to pre-guess a column mapping before
 *  parsing (the wizard's Map-columns step) without parsing the whole file. */
export function readHeader(text: string): string[] | null {
  const [header] = parseLines(text);
  return header ?? null;
}

// Lowercased to match every other tag entry point (manual entry in ExpenseForm.tsx,
// BulkHashtagModal.tsx, useExpenses.ts's bulkAddHashtag/bulkRemoveHashtag) — found 2026-08-18 to be
// the one gap: an imported CSV/bank statement's tag column kept its original case, silently splitting
// e.g. "Groceries" and "groceries" into two different tags instead of the one the rest of the app
// already treats as case-insensitive.
function parseTags(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);
}

/** True for a "no data" placeholder literal from the source file itself (case-insensitive) — found
 *  2026-08-14 via a real MoneyView export whose Merchant/Receiver/Sender, Notes, and Account Id columns
 *  sometimes contain the literal string `"null"` rather than being genuinely blank. A plain `.trim()`
 *  doesn't catch this, since the string itself is non-empty — without this, "null" silently becomes
 *  the transaction's real description/account/note shown to the user. */
function isNullLikeValue(s: string): boolean {
  return /^(null|n\/a|na|undefined)$/i.test(s.trim());
}

/** Blanks out a null-like placeholder so every existing `|| 'Other'` / `... && { field }` fallback
 *  already in this file treats it exactly like a genuinely-empty column, instead of a real value. */
function cleanNullLike(s: string): string {
  return isNullLikeValue(s) ? '' : s;
}

/** Parses CSV text with an already-resolved column mapping. Every format ultimately goes through this
 *  — the 4 known formats via their preset synonym lists (see FORMAT_SYNONYMS), Custom via whatever
 *  mapping the user confirmed in the Map-columns step. Rows that can't be turned into a ParsedRow are
 *  collected in `rejected` with a reason, never silently dropped. */
export function parseWithMapping(text: string, mapping: ColumnMapping, dateHint: 'DMY' | 'MDY' | 'auto'): ParseResult {
  const [header, ...dataRows] = parseLines(text);
  if (!header) return { rows: [], rejected: [], totalDataRows: 0 };

  const rows: ParsedRow[] = [];
  const rejected: RejectedRow[] = [];

  dataRows.forEach((cols, i) => {
    const dateStr = mapping.date >= 0 ? (cols[mapping.date] ?? '') : '';
    const date = parseFlexibleDate(dateStr, dateHint);
    const desc = (mapping.description >= 0 ? (cols[mapping.description] ?? '') : '').trim();
    const amountResult = resolveAmount(cols, mapping);

    if (!date) {
      rejected.push({ rowIndex: i + 1, raw: cols, reason: 'Missing or unrecognised date' });
      return;
    }
    if (!desc) {
      rejected.push({ rowIndex: i + 1, raw: cols, reason: 'Missing description' });
      return;
    }
    if (!amountResult) {
      rejected.push({ rowIndex: i + 1, raw: cols, reason: 'Missing or zero amount' });
      return;
    }

    const cat = cleanNullLike((mapping.category >= 0 ? (cols[mapping.category] ?? '') : '').trim());
    const account = mapping.account >= 0 ? cleanNullLike((cols[mapping.account] ?? '').trim()) : '';
    const notes = mapping.notes >= 0 ? cleanNullLike((cols[mapping.notes] ?? '').trim()) : '';
    const tags = mapping.tags >= 0 ? parseTags(cols[mapping.tags] ?? '') : [];
    const paymentMode = mapping.paymentMode >= 0 ? cleanNullLike((cols[mapping.paymentMode] ?? '').trim()) : '';
    const bankName = mapping.bankName >= 0 ? cleanNullLike((cols[mapping.bankName] ?? '').trim()) : '';
    const accountType = mapping.accountType >= 0 ? cleanNullLike((cols[mapping.accountType] ?? '').trim()) : '';

    let type: ParsedRow['type'] = amountResult.type;
    if (mapping.typeText >= 0) {
      const rawType = (cols[mapping.typeText] ?? '').trim().toLowerCase();
      if (rawType === 'income' || rawType === 'expense' || rawType === 'transfer') type = rawType;
    }

    // A null-like description (the "Missing description" rejection above only ever fires for a
    // genuinely-empty raw value, unchanged) falls back to the row's own category rather than shipping
    // the literal placeholder text as the transaction's real description.
    const finalDesc = isNullLikeValue(desc) ? cat || 'Other' : desc;

    rows.push({
      date,
      amount: amountResult.amount,
      description: finalDesc,
      categoryName: cat || 'Other',
      type,
      ...(account && { account }),
      ...(paymentMode && { paymentMode }),
      hashtags: tags,
      ...(notes && { notes }),
      ...(bankName && { bankName }),
      ...(accountType && { accountType })
    });
  });

  return { rows, rejected, totalDataRows: dataRows.length };
}

/** Guesses the column mapping for a known format (or Custom's starting guess) from the file's header. */
export function guessMappingForFormat(text: string, format: ImportFormat): ColumnMapping | null {
  const header = readHeader(text);
  if (!header) return null;
  const synonyms = format === 'custom' ? CUSTOM_SYNONYMS : FORMAT_SYNONYMS[format];
  return guessColumnMapping(header, synonyms);
}

/** Confirms a guessed mapping actually resolved the minimum fields a known format needs before any row
 *  parsing is attempted — date, description, and either a single amount column or a full outflow+inflow
 *  split. Without this upfront check, picking the wrong preset (e.g. a MoneyView export under the
 *  "Cashew" tile) doesn't error at all: `guessColumnMapping`'s substring fallback still resolves some
 *  fields against the wrong columns (confirmed 2026-07-28 — Cashew's `description` synonym `"name"`
 *  substring-matches MoneyView's `"Bank Name"` column), and whichever required field truly can't resolve
 *  (there, `amount` — Cashew has no outflow/inflow synonyms, so a split-column file always fails there)
 *  causes every row to land in `rejected` with a generic per-row reason instead of one clear "wrong
 *  format" message. Not applied to 'custom' — the user maps columns explicitly there, so there's nothing
 *  to guess wrong. Returns an error message, or null if the mapping looks usable. */
export function validateMappingForFormat(
  mapping: ColumnMapping,
  format: Exclude<ImportFormat, 'custom'>
): string | null {
  const hasAmount = mapping.amount >= 0 || (mapping.outflow >= 0 && mapping.inflow >= 0);
  if (mapping.date >= 0 && mapping.description >= 0 && hasAmount) return null;
  return `This file doesn't look like a ${FORMAT_LABELS[format]} export — expected columns like ${FORMAT_COLUMNS[format]}. Check you picked the right format, or try Custom to map columns yourself.`;
}

/** Parses a file for a known format using its preset synonym mapping. For 'custom', pass the
 *  user-confirmed mapping from the Map-columns step instead (guessMappingForFormat + edits). */
export function parseByFormat(text: string, format: ImportFormat, customMapping?: ColumnMapping): ParseResult {
  const mapping = format === 'custom' ? customMapping : guessMappingForFormat(text, format);
  if (!mapping) return { rows: [], rejected: [], totalDataRows: 0 };
  return parseWithMapping(text, mapping, FORMAT_DATE_HINT[format]);
}

export const PENNY_TEMPLATE = [
  'Date,Amount,Description,Category,Type,PaymentMode,Tags,Notes',
  '14/06/2026,450,Groceries from DMart,Groceries,expense,UPI,#groceries,Weekly shop',
  '14/06/2026,22000,Rent payment,Rent,expense,NetBanking,,',
  '13/06/2026,3500,Dinner at restaurant,Dining & Café,expense,Card,#dining,',
  '12/06/2026,95000,Salary credit,Salary,income,NetBanking,,',
  '11/06/2026,1200,Netflix subscription,Subscriptions,expense,Card,#ott,'
].join('\n');
