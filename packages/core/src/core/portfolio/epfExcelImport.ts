// Reads Penny's own EPF Excel export (`epfExcelExport.ts`) back in — the "structured, round-trippable"
// half of docs/plans/epf-passbook-import.md §11. Pure function, no I/O, mirrors
// `bank-import/xlsxParser.ts`'s shape exactly (`read`/`utils` from the `xlsx` package are not
// import-restricted the way `dexie`/`@anthropic-ai/sdk` are — see CLAUDE.md's architecture rules —
// so, like `xlsxParser.ts`, this lives directly in `packages/core`, no platform split needed).
//
// Deliberately does NOT reuse `ParsedEpfPassbook` (the PDF parser's output type) as its container —
// that type requires non-optional `establishmentId`/`memberId`, which a manually-entered employer
// (never itself imported from a PDF) may not have. Row-level shapes (`ParsedEpfPassbookRow`,
// contribution amounts) ARE reused as-is — a contribution row is structurally identical regardless
// of source format, so `epfReconciliation.ts` needs zero changes to accept either.
import type { EpfTransactionType } from '@/core/db/types';
import type { ParsedEpfPassbookRow } from './epfPassbookParser';

export class EpfExcelParseError extends Error {}

export interface ParsedEpfExcelEmployerStatement {
  /** memberId if the exported employer had one, else companyName — the best available key for
   *  matching against an already-tracked employer during import. */
  employerKey: string;
  companyName: string;
  establishmentId?: string | undefined;
  memberId?: string | undefined;
  fyStartYear: number;
  rows: ParsedEpfPassbookRow[];
}

/** Interest/transfer/withdrawal/advance are NOT employer-scoped in this schema today (see
 *  `EpfTransaction` — only `wagesMonth`-bearing contributions carry an implicit employer link, via
 *  date-range matching). Modelled here exactly like `epfReconciliation.ts`'s own
 *  `reconcileEpfBalanceEvent` already expects: a bare (type, FY, amounts) tuple, matching the single
 *  combined `amount` figure every one of these transaction types has always used (see
 *  `existingAmounts()` in `epfReconciliation.ts`). */
export interface ParsedEpfExcelBalanceEvent {
  type: EpfTransactionType;
  fyStartYear: number;
  amounts: { employeeAmount: number; employerAmount: number; pensionAmount: number };
}

export interface ParsedEpfExcelExport {
  uan?: string | undefined;
  epfBirthYear?: number | undefined;
  employerStatements: ParsedEpfExcelEmployerStatement[];
  balanceEvents: ParsedEpfExcelBalanceEvent[];
}

interface EmployerMeta {
  companyName: string;
  establishmentId?: string | undefined;
  memberId?: string | undefined;
}

function sheetToGrid(sheet: unknown, utils: typeof import('xlsx').utils): string[][] {
  const grid = utils.sheet_to_json<string[]>(sheet as never, { header: 1, raw: false, defval: '' });
  return grid.map((row) => row.map((cell) => (cell ?? '').toString()));
}

function parseRupeeNumber(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseExportedDate(raw: string): number | null {
  // `formatDate()` in epfExcelExport.ts writes e.g. "08 Aug 2026" (en-IN, day/month/year).
  const ms = Date.parse(raw);
  return isNaN(ms) ? null : ms;
}

function dateToFyStartYear(ms: number): number {
  const d = new Date(ms);
  return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}

function parseEmployersSheet(rows: string[][]): Map<string, EmployerMeta> {
  const byName = new Map<string, EmployerMeta>();
  for (const row of rows.slice(1)) {
    const [companyName, memberId, establishmentId] = row;
    if (!companyName) continue;
    byName.set(companyName, {
      companyName,
      memberId: memberId || undefined,
      establishmentId: establishmentId || undefined
    });
  }
  return byName;
}

function parseTransactionsSheet(
  rows: string[][],
  employersByName: Map<string, EmployerMeta>
): { employerStatements: ParsedEpfExcelEmployerStatement[]; balanceEvents: ParsedEpfExcelBalanceEvent[] } {
  // Group contribution rows by (employer, FY) — one group per real EPFO passbook's equivalent scope.
  const contribGroups = new Map<string, { meta: EmployerMeta; fyStartYear: number; rows: ParsedEpfPassbookRow[] }>();
  // Group non-contribution rows by (type, FY) — matches reconcileEpfBalanceEvent's own scope exactly.
  const balanceGroups = new Map<
    string,
    { type: EpfTransactionType; fyStartYear: number; employeeAmount: number; employerAmount: number }
  >();

  for (const row of rows.slice(1)) {
    const [
      dateRaw,
      typeRaw,
      wagesMonth,
      employerName,
      employeeAmountRaw,
      employerAmountRaw,
      pensionAmountRaw,
      amountRaw,
      ,
      particulars
    ] = row;
    if (!dateRaw || !typeRaw) continue;
    const date = parseExportedDate(dateRaw);
    if (date === null) continue;
    const type = typeRaw as EpfTransactionType;

    if (type === 'contribution') {
      if (!wagesMonth) continue;
      const meta: EmployerMeta = employersByName.get(employerName ?? '') ?? { companyName: employerName ?? '' };
      const fyStartYear = dateToFyStartYear(date);
      const key = `${meta.memberId ?? meta.companyName}::${fyStartYear}`;
      const group = contribGroups.get(key) ?? { meta, fyStartYear, rows: [] };
      group.rows.push({
        wagesMonth,
        date,
        particulars: particulars ?? '',
        epfWages: 0,
        epsWages: 0,
        employeeAmount: parseRupeeNumber(employeeAmountRaw ?? '0'),
        employerAmount: parseRupeeNumber(employerAmountRaw ?? '0'),
        pensionAmount: parseRupeeNumber(pensionAmountRaw ?? '0')
      });
      contribGroups.set(key, group);
    } else {
      const fyStartYear = dateToFyStartYear(date);
      const key = `${type}::${fyStartYear}`;
      const existing = balanceGroups.get(key) ?? { type, fyStartYear, employeeAmount: 0, employerAmount: 0 };
      // Single combined figure — matches every non-contribution EPF transaction type's own
      // long-standing convention (see epfReconciliation.ts's existingAmounts()).
      existing.employeeAmount += parseRupeeNumber(amountRaw ?? '0');
      balanceGroups.set(key, existing);
    }
  }

  const employerStatements: ParsedEpfExcelEmployerStatement[] = [...contribGroups.values()].map((g) => ({
    employerKey: g.meta.memberId ?? g.meta.companyName,
    companyName: g.meta.companyName,
    establishmentId: g.meta.establishmentId,
    memberId: g.meta.memberId,
    fyStartYear: g.fyStartYear,
    rows: g.rows
  }));

  const balanceEvents: ParsedEpfExcelBalanceEvent[] = [...balanceGroups.values()].map((g) => ({
    type: g.type,
    fyStartYear: g.fyStartYear,
    amounts: { employeeAmount: g.employeeAmount, employerAmount: g.employerAmount, pensionAmount: 0 }
  }));

  return { employerStatements, balanceEvents };
}

/** @param data Raw file bytes — same contract as `parseXlsxToGrid`/`parseEpfPassbookPdf`. */
export async function parseEpfExcelExport(data: Uint8Array): Promise<ParsedEpfExcelExport> {
  const { read, utils } = await import('xlsx');
  let workbook;
  try {
    workbook = read(data, { type: 'array', cellDates: false });
  } catch {
    throw new EpfExcelParseError('Could not read this file as an Excel workbook.');
  }

  const summarySheet = workbook.Sheets['Summary'];
  const employersSheet = workbook.Sheets['Employers'];
  const transactionsSheet = workbook.Sheets['Transactions'];
  if (!summarySheet || !employersSheet || !transactionsSheet) {
    throw new EpfExcelParseError(
      'This file is missing the Summary/Employers/Transactions sheets — it doesn’t look like a Penny EPF export.'
    );
  }

  const summaryGrid = sheetToGrid(summarySheet, utils);
  const uan = summaryGrid.find((r) => r[0] === 'UAN')?.[1] || undefined;
  const epfBirthYearRaw = summaryGrid.find((r) => r[0] === 'Birth year')?.[1];
  const epfBirthYear = epfBirthYearRaw ? parseInt(epfBirthYearRaw, 10) : undefined;

  const employersByName = parseEmployersSheet(sheetToGrid(employersSheet, utils));
  const { employerStatements, balanceEvents } = parseTransactionsSheet(
    sheetToGrid(transactionsSheet, utils),
    employersByName
  );

  if (employerStatements.length === 0 && balanceEvents.length === 0) {
    throw new EpfExcelParseError('This export has no transactions to import.');
  }

  return { uan, epfBirthYear, employerStatements, balanceEvents };
}
