import type {
  ColumnMapping,
  ParsedStatementRow,
  RejectedStatementRow,
  StatementLineDirection,
  StatementParseResult
} from './types';

/**
 * Quote-aware CSV tokenizer — handles embedded delimiters/newlines inside quoted fields and `""`
 * escapes. Deliberately a standalone copy, not a shared import from `core/import/importParsers.ts`'s
 * own `tokenizeCsv` — this module must not share code with the multi-app importer (§4 of the plan).
 */
export function tokenizeCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
  }
  return rows;
}

export function extractHeaderRow(rows: string[][]): string[] {
  return (rows[0] ?? []).map((h) => h.trim());
}

function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return negative ? -Math.abs(n) : n;
}

const MONTH_NAMES: Record<string, number> = {
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

/** Recognized date-format tokens, longest-first so `YYYY` is tried before `YY` and `MMM` before a
 *  (nonexistent) single-`M`, avoiding a token accidentally matching a prefix of a longer one. */
const FORMAT_TOKENS = ['YYYY', 'MMM', 'YY', 'MM', 'DD'] as const;
type FormatToken = (typeof FORMAT_TOKENS)[number];

export const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY';

interface CompiledDateFormat {
  regex: RegExp;
  tokens: FormatToken[];
}

const compiledFormatCache = new Map<string, CompiledDateFormat>();

/** Compiles a token format string (`DD`, `MM`, `YYYY`, `YY`, `MMM`) into a regex + the token order
 *  its capture groups correspond to. Any character that isn't the start of a recognized token is
 *  taken as a literal separator (escaped into the regex as-is) — this is what lets the same engine
 *  handle `DD/MM/YYYY`, `DD-MM-YY`, `DD MMM YYYY`, and a fully concatenated `DDMMMYYYY` (no separator
 *  at all) without any special-casing between them. Cached since the same format string gets
 *  compiled once per column-mapping change but parsed against every row in the file. */
function compileDateFormat(format: string): CompiledDateFormat {
  const cached = compiledFormatCache.get(format);
  if (cached) return cached;
  let pattern = '';
  const tokens: FormatToken[] = [];
  let i = 0;
  while (i < format.length) {
    const rest = format.slice(i).toUpperCase();
    const token = FORMAT_TOKENS.find((t) => rest.startsWith(t));
    if (token) {
      tokens.push(token);
      pattern +=
        token === 'YYYY' ? '(\\d{4})' : token === 'YY' ? '(\\d{2})' : token === 'MMM' ? '([A-Za-z]{3,})' : '(\\d{1,2})';
      i += token.length;
    } else {
      pattern += (format[i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  const compiled: CompiledDateFormat = { regex: new RegExp(`^${pattern}$`, 'i'), tokens };
  compiledFormatCache.set(format, compiled);
  return compiled;
}

/** Parses a raw statement date string against an explicit token format string (see `ColumnMapping`'s
 *  `dateFormat` doc comment for the token grammar). Rejects — returns `null` — rather than guessing
 *  whenever the string doesn't match the format's shape at all, or the extracted day/month is out of
 *  range; a mismatched format should surface as a rejected row (`RejectedStatementRow`), never a
 *  silently wrong date.
 *
 *  Replaces this session's first attempt at fixing date-format ambiguity, a narrower
 *  `NumericDateOrder` (`'day-first' | 'month-first'`) that only covered one numeric shape
 *  (`DD/MM/YYYY` vs `MM/DD/YYYY`) — real statements vary far more than that (e.g. `DD-MM-YY`, or a
 *  no-separator `DDMMMYYYY` for a date like "22Feb2026"), which direct user feedback caught
 *  2026-08-05 before this ever shipped past the mapping popup. */
export function parseStatementDate(raw: string | undefined, format: string = DEFAULT_DATE_FORMAT): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  const { regex, tokens } = compileDateFormat(format);
  const m = regex.exec(s);
  if (!m) return null;

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  tokens.forEach((token, idx) => {
    const value = m[idx + 1] ?? '';
    if (token === 'DD') day = Number(value);
    else if (token === 'MM') month = Number(value) - 1;
    else if (token === 'YYYY') year = Number(value);
    else if (token === 'YY') year = Number(value) + 2000;
    else if (token === 'MMM') month = MONTH_NAMES[value.slice(0, 3).toLowerCase()] ?? null;
  });
  if (day === null || month === null || year === null) return null;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return new Date(year, month, day).getTime();
}

/** Common real-world statement date-format shapes, most-specific/least-ambiguous first — tried in
 *  order against a date column's own real values when there's no bank preset to declare one (the
 *  Custom preset). Ordering breaks ties deliberately: day-before-month variants are listed before
 *  their month-first counterparts, so an ambiguous file (every value fits both) defaults to
 *  India-first convention rather than an arbitrary pick. */
const CANDIDATE_DATE_FORMATS = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'DD MMM YYYY',
  'DD-MMM-YYYY',
  'DDMMMYYYY',
  'DD-MMM-YY',
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'DD.MM.YYYY',
  'DD/MM/YY',
  'DD-MM-YY',
  'MM/DD/YYYY',
  'MM-DD-YYYY',
  'MM/DD/YY'
];

/** Guesses the date format from a set of real raw date-column values — tries each candidate shape in
 *  `CANDIDATE_DATE_FORMATS` and keeps whichever ones every non-blank sample actually parses under
 *  (matching the shape *and* producing an in-range day/month). `confident: true` only when exactly
 *  one candidate fully explains every sample; if several fit equally (e.g. every day ≤ 12, so both
 *  `DD/MM/YYYY` and `MM/DD/YYYY` "work") or none do, `confident: false` tells the mapping popup to
 *  prompt rather than silently assume — it still returns its single best guess (the earliest-listed
 *  fit, or the plain default if nothing fits at all) either way, so the field always starts
 *  pre-filled with something reasonable rather than blank. */
export function detectDateFormat(rawDates: (string | undefined)[]): { format: string; confident: boolean } {
  const samples = rawDates.map((d) => d?.trim()).filter((d): d is string => !!d);
  if (samples.length === 0) return { format: DEFAULT_DATE_FORMAT, confident: false };

  const fits = CANDIDATE_DATE_FORMATS.filter((format) => samples.every((s) => parseStatementDate(s, format) !== null));
  if (fits.length === 0) return { format: DEFAULT_DATE_FORMAT, confident: false };
  return { format: fits[0] ?? DEFAULT_DATE_FORMAT, confident: fits.length === 1 };
}

/**
 * Parses tokenized statement rows (header at index 0) against a confirmed column mapping. Never
 * silently drops a line — anything unparseable becomes a `RejectedStatementRow` with a reason,
 * surfaced to the user instead of hidden.
 */
export function parseStatementRows(rows: string[][], headers: string[], mapping: ColumnMapping): StatementParseResult {
  const colIndex = (name: string | undefined): number => (name ? headers.indexOf(name) : -1);
  const dateIdx = colIndex(mapping.date);
  const narrationIdx = colIndex(mapping.narration);
  const debitIdx = colIndex(mapping.debit);
  const creditIdx = colIndex(mapping.credit);
  const amountIdx = colIndex(mapping.amount);
  const balanceIdx = colIndex(mapping.balance);

  const parsed: ParsedStatementRow[] = [];
  const rejected: RejectedStatementRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const rowIndex = i + 1;
    if (!cells) continue;
    const rawLine = cells.join(',');

    const date = dateIdx >= 0 ? parseStatementDate(cells[dateIdx], mapping.dateFormat) : null;
    if (date === null) {
      rejected.push({ rowIndex, rawLine, reason: 'Unparseable or missing date' });
      continue;
    }

    const rawNarration = (narrationIdx >= 0 ? cells[narrationIdx] : '')?.trim() ?? '';
    if (!rawNarration) {
      rejected.push({ rowIndex, rawLine, reason: 'Missing narration/description' });
      continue;
    }

    let direction: StatementLineDirection | null = null;
    let amount: number | null = null;

    if (amountIdx >= 0) {
      const signed = parseAmount(cells[amountIdx]);
      if (signed !== null && signed !== 0) {
        direction = signed < 0 ? 'debit' : 'credit';
        amount = Math.abs(signed);
      }
    } else {
      const debit = debitIdx >= 0 ? parseAmount(cells[debitIdx]) : null;
      const credit = creditIdx >= 0 ? parseAmount(cells[creditIdx]) : null;
      if (debit && debit !== 0) {
        direction = 'debit';
        amount = Math.abs(debit);
      } else if (credit && credit !== 0) {
        direction = 'credit';
        amount = Math.abs(credit);
      }
    }

    if (direction === null || amount === null) {
      rejected.push({ rowIndex, rawLine, reason: 'No debit or credit amount found' });
      continue;
    }

    const balance = balanceIdx >= 0 ? (parseAmount(cells[balanceIdx]) ?? undefined) : undefined;

    parsed.push({ rawNarration, date, amount, direction, balance, rowIndex });
  }

  return { rows: parsed, rejected };
}
