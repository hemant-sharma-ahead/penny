// EPF full-statement Excel export (2026-08-08) — see docs/plans/epf-passbook-import.md §11. Builds
// ONE combined workbook across every employer/year Penny knows about, unlike EPFO's own passbook
// download (one employer, one FY per file). Pure function producing plain sheet-row data — the
// actual `xlsx` write call happens in the apps/mobile UI layer, mirroring
// `packages/core/src/core/loans/planExport.ts`'s exact "plain arrays in, platform renders to
// `.xlsx`" shape (that file's own `PlannerResults.tsx` consumer already solved the RN `write()`
// ArrayBuffer/Blob gotchas — reuse that pattern verbatim rather than rediscovering it).
//
// This is the "structured, round-trippable" half of §11's phase 1/phase 2 split — `epfExcelImport.ts`
// reads this exact shape back in. PDF export (phase 2, presentation-only, not re-importable) is a
// separate, later effort.
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';
import { epfEmployerForWagesMonth } from './epfCalculations';
import { getInterestRateForFy } from './epfInterestCalculator';
import type { EpfRateTable } from './epfInterestRates';

type Cell = string | number;

export interface EpfExcelSheet {
  name: string;
  rows: Cell[][];
  colWidths?: number[];
}

export interface EpfExcelExport {
  filename: string;
  sheets: EpfExcelSheet[];
}

export interface EpfExcelExportCorpusSummary {
  employeeTotal: number;
  employerTotal: number;
  interestEarned: number;
  projectedCorpus?: number | null;
  yearsToRetirement?: number | null;
}

export interface EpfExcelExportInput {
  uan?: string;
  epfBirthYear?: number;
  employers: EpfEmployer[];
  /** Every EPF transaction across every employer — NOT pre-filtered/pre-grouped, this function does
   *  that internally (same input shape `RetirementCard.tsx` already holds in `assetMeta.epfTransactions`). */
  transactions: EpfTransaction[];
  corpus: EpfExcelExportCorpusSummary;
  rateTable: EpfRateTable;
  /** epoch ms — stamped onto the Summary sheet so a user comparing two exports can tell which is newer. */
  generatedAt: number;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Which financial year (start year) a given epoch-ms date falls inside. */
function dateToFyStartYear(ms: number): number {
  const d = new Date(ms);
  const y = d.getFullYear();
  return d.getMonth() + 1 >= 4 ? y : y - 1;
}

/** "Which employer was this transaction under" label for the Transactions sheet's readability only
 *  — never written back as new authoritative data. Prefers the transaction's own real `employerId`
 *  (set at import time, unambiguous even for a genuine mid-month employer switch); falls back to
 *  date-range containment (`epfEmployerForWagesMonth`) for a transaction written before that field
 *  existed, which returns nothing rather than guessing when more than one employer's range covers
 *  the month — see that function's own doc comment. */
function employerLabelForTransaction(t: EpfTransaction, employers: EpfEmployer[]): string {
  if (t.employerId) return employers.find((e) => e.id === t.employerId)?.companyName ?? '';
  if (!t.wagesMonth) return '';
  return epfEmployerForWagesMonth(employers, t.wagesMonth)?.companyName ?? '';
}

function buildSummarySheet(input: EpfExcelExportInput): EpfExcelSheet {
  const { corpus } = input;
  const rows: Cell[][] = [['Penny — EPF Statement'], ['Generated on', formatDate(input.generatedAt)], []];
  if (input.uan) rows.push(['UAN', input.uan]);
  if (input.epfBirthYear) rows.push(['Birth year', input.epfBirthYear]);
  rows.push(
    [],
    ['Employers tracked', input.employers.length],
    [],
    ['Corpus Summary'],
    ['Employee total (₹)', Math.round(corpus.employeeTotal)],
    ['Employer total (₹)', Math.round(corpus.employerTotal)],
    ['Interest earned (₹)', Math.round(corpus.interestEarned)]
  );
  if (corpus.projectedCorpus != null && corpus.yearsToRetirement != null) {
    rows.push(
      [],
      ['Retirement Projection'],
      ['Years to retirement', corpus.yearsToRetirement],
      ['Projected corpus (₹)', Math.round(corpus.projectedCorpus)]
    );
  }
  return { name: 'Summary', rows, colWidths: [24, 20] };
}

function buildEmployersSheet(employers: EpfEmployer[]): EpfExcelSheet {
  const header = [
    'Company Name',
    'Member ID',
    'Establishment ID',
    'Basic + DA (₹/mo)',
    'Employee Contribution %',
    'From',
    'To',
    'Status'
  ];
  const rows = employers.map((e) => [
    e.companyName,
    e.memberId ?? '',
    e.establishmentId ?? '',
    e.basicSalary,
    e.employeeContribPct,
    formatDate(e.fromDate),
    e.toDate ? formatDate(e.toDate) : '',
    e.toDate ? 'Past' : 'Current'
  ]);
  return { name: 'Employers', rows: [header, ...rows], colWidths: [26, 22, 18, 16, 12, 14, 14, 10] };
}

function buildTransactionsSheet(input: EpfExcelExportInput): EpfExcelSheet {
  const header = [
    'Date',
    'Type',
    'Wages Month',
    'Employer',
    'Employee Amount (₹)',
    'Employer Amount (₹)',
    'Pension Amount (₹)',
    'Amount (₹)',
    'Rate Used (% p.a.)',
    'Particulars / Note'
  ];
  const sorted = [...input.transactions].sort((a, b) => a.date - b.date);
  const rows = sorted.map((t) => {
    const rateUsed = t.type === 'interest' ? getInterestRateForFy(input.rateTable, dateToFyStartYear(t.date)) : null;
    return [
      formatDate(t.date),
      t.type,
      t.wagesMonth ?? '',
      employerLabelForTransaction(t, input.employers),
      t.employeeAmount ?? '',
      t.employerAmount ?? '',
      t.pensionAmount ?? '',
      t.amount ?? '',
      rateUsed === null ? '' : rateUsed,
      t.sourceParticulars ?? t.note ?? ''
    ];
  });
  return {
    name: 'Transactions',
    rows: [header, ...rows],
    colWidths: [12, 12, 12, 22, 16, 16, 16, 12, 14, 30]
  };
}

function buildInterestHistorySheet(input: EpfExcelExportInput): EpfExcelSheet {
  const header = ['Financial Year', 'Rate Used (% p.a.)', 'Employee Interest (₹)', 'Employer Interest (₹)'];
  const interestTxns = input.transactions.filter((t) => t.type === 'interest');
  const byFy = new Map<number, { employee: number; employer: number }>();
  for (const t of interestTxns) {
    const fyStartYear = dateToFyStartYear(t.date);
    const existing = byFy.get(fyStartYear) ?? { employee: 0, employer: 0 };
    existing.employee += t.employeeAmount ?? t.amount ?? 0;
    existing.employer += t.employerAmount ?? 0;
    byFy.set(fyStartYear, existing);
  }
  const rows = [...byFy.entries()]
    .sort(([a], [b]) => a - b)
    .map(([fyStartYear, totals]) => {
      const rate = getInterestRateForFy(input.rateTable, fyStartYear);
      return [
        `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,
        rate === null ? 'Not yet declared' : rate,
        Math.round(totals.employee),
        Math.round(totals.employer)
      ];
    });
  return { name: 'Interest History', rows: [header, ...rows], colWidths: [16, 18, 20, 20] };
}

function buildSalaryHikesSheet(employers: EpfEmployer[]): EpfExcelSheet {
  const header = ['Company Name', 'Effective From', 'New Basic + DA (₹/mo)'];
  const rows = employers.flatMap((e) =>
    (e.hikeTimeline ?? []).map((h) => [e.companyName, formatDate(h.fromDate), h.basicSalary])
  );
  return { name: 'Salary Hikes', rows: [header, ...rows], colWidths: [26, 16, 20] };
}

/** Builds the full 5-sheet workbook data described in §11. Every sheet is independently readable —
 *  a user opening this in Excel/Sheets sees a real statement, not just a re-import fixture. */
export function buildEpfExcelExport(input: EpfExcelExportInput): EpfExcelExport {
  return {
    filename: `Penny_EPF_Statement_${new Date(input.generatedAt).toISOString().slice(0, 10)}.xlsx`,
    sheets: [
      buildSummarySheet(input),
      buildEmployersSheet(input.employers),
      buildTransactionsSheet(input),
      buildInterestHistorySheet(input),
      buildSalaryHikesSheet(input.employers)
    ]
  };
}
