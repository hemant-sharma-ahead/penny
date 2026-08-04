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

/** Tolerant date parser for common Indian bank statement formats: `DD/MM/YYYY`, `DD-MM-YYYY`,
 *  `DD MMM YYYY`, 2-digit years, and ISO `YYYY-MM-DD`. Returns epoch ms at local midnight, or null
 *  if unparseable — an unparseable date rejects the row rather than guessing. */
export function parseStatementDate(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  let m = /^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})$/.exec(s);
  if (m) {
    const day = Number(m[1] ?? '');
    const mon = MONTH_NAMES[(m[2] ?? '').slice(0, 3).toLowerCase()];
    let year = Number(m[3] ?? '');
    if (year < 100) year += 2000;
    if (mon !== undefined) return new Date(year, mon, day).getTime();
  }

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const day = Number(m[1] ?? '');
    const month = Number(m[2] ?? '') - 1;
    let year = Number(m[3] ?? '');
    if (year < 100) year += 2000;
    return new Date(year, month, day).getTime();
  }

  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return new Date(Number(m[1] ?? ''), Number(m[2] ?? '') - 1, Number(m[3] ?? '')).getTime();

  return null;
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

    const date = dateIdx >= 0 ? parseStatementDate(cells[dateIdx]) : null;
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
