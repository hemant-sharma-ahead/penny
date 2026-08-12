import { describe, expect, it } from 'vitest';
import { utils, write, type WorkBook } from 'xlsx';
import { buildEpfExcelExport, type EpfExcelExportInput } from '@/core/portfolio/epfExcelExport';
import { parseEpfExcelExport, EpfExcelParseError } from '@/core/portfolio/epfExcelImport';
import { reconcileEpfContributionRows, reconcileEpfBalanceEvent } from '@/core/portfolio/epfReconciliation';
import { EPF_RATE_TABLE_FALLBACK } from '@/core/portfolio/epfInterestRates';
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';

/** Mirrors PlannerResults.tsx's own write path exactly, so this test exercises the real
 *  export→bytes→import round trip a user's device actually performs, not just the pure builder. */
function toWorkbookBytes(exportData: ReturnType<typeof buildEpfExcelExport>): Uint8Array {
  const workbook: WorkBook = utils.book_new();
  for (const s of exportData.sheets) {
    const sheet = utils.aoa_to_sheet(s.rows);
    if (s.colWidths) sheet['!cols'] = s.colWidths.map((wch) => ({ wch }));
    utils.book_append_sheet(workbook, sheet, s.name);
  }
  return new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

const employers: EpfEmployer[] = [
  {
    id: 'e1',
    companyName: 'COGNIZANT',
    basicSalary: 60000,
    employeeContribPct: 12,
    fromDate: new Date(2022, 3, 1).getTime(),
    memberId: 'TSTEST00000000019999999', // pii-ignore: synthetic
    establishmentId: 'TSTEST0000000001'
  }
];

const transactions: EpfTransaction[] = [
  {
    id: 't1',
    type: 'contribution',
    wagesMonth: '2023-04',
    date: new Date(2023, 4, 5).getTime(),
    employeeAmount: 1200,
    employerAmount: 367
  },
  {
    id: 't2',
    type: 'contribution',
    wagesMonth: '2023-05',
    date: new Date(2023, 5, 6).getTime(),
    employeeAmount: 1200,
    employerAmount: 367
  },
  { id: 't3', type: 'interest', date: new Date(2024, 2, 31).getTime(), amount: 250 }
];

function baseInput(overrides: Partial<EpfExcelExportInput> = {}): EpfExcelExportInput {
  return {
    uan: '100987654321', // pii-ignore: fabricated test data (same fake value as seedDemoData.ts)
    epfBirthYear: 1990,
    employers,
    transactions,
    corpus: { employeeTotal: 2400, employerTotal: 734, interestEarned: 250 },
    rateTable: EPF_RATE_TABLE_FALLBACK,
    generatedAt: Date.UTC(2026, 7, 8, 12),
    ...overrides
  };
}

describe('parseEpfExcelExport — round trip against buildEpfExcelExport', () => {
  it('reads back UAN and birth year', async () => {
    const bytes = toWorkbookBytes(buildEpfExcelExport(baseInput()));
    const parsed = await parseEpfExcelExport(bytes);
    expect(parsed.uan).toBe('100987654321'); // pii-ignore: fabricated
    expect(parsed.epfBirthYear).toBe(1990);
  });

  it('groups contribution rows by employer + financial year, preserving memberId/establishmentId', async () => {
    const bytes = toWorkbookBytes(buildEpfExcelExport(baseInput()));
    const parsed = await parseEpfExcelExport(bytes);
    expect(parsed.employerStatements).toHaveLength(1);
    const statement = parsed.employerStatements[0];
    expect(statement?.companyName).toBe('COGNIZANT');
    expect(statement?.memberId).toBe('TSTEST00000000019999999'); // pii-ignore: synthetic
    expect(statement?.establishmentId).toBe('TSTEST0000000001');
    expect(statement?.fyStartYear).toBe(2023);
    expect(statement?.rows).toHaveLength(2);
  });

  it('groups non-contribution rows (interest) by type + financial year', async () => {
    const bytes = toWorkbookBytes(buildEpfExcelExport(baseInput()));
    const parsed = await parseEpfExcelExport(bytes);
    expect(parsed.balanceEvents).toHaveLength(1);
    expect(parsed.balanceEvents[0]).toMatchObject({
      type: 'interest',
      fyStartYear: 2023,
      amounts: { employeeAmount: 250, employerAmount: 0, pensionAmount: 0 }
    });
  });

  it('re-imported rows reconcile as exact matches against the original transactions (full fidelity)', async () => {
    const bytes = toWorkbookBytes(buildEpfExcelExport(baseInput()));
    const parsed = await parseEpfExcelExport(bytes);

    const statement = parsed.employerStatements[0];
    if (!statement) throw new Error('expected one employer statement');
    const contribResults = reconcileEpfContributionRows(statement.rows, transactions);
    expect(contribResults.every((r) => r.kind === 'matches')).toBe(true);

    const event = parsed.balanceEvents[0];
    if (!event) throw new Error('expected one balance event');
    const interestResult = reconcileEpfBalanceEvent(event.type, event.fyStartYear, event.amounts, transactions);
    expect(interestResult?.kind).toBe('matches');
  });

  it('a genuinely changed amount reconciles as a conflict, not a false match', async () => {
    const bytes = toWorkbookBytes(buildEpfExcelExport(baseInput()));
    const parsed = await parseEpfExcelExport(bytes);
    const statement = parsed.employerStatements[0];
    if (!statement) throw new Error('expected one employer statement');

    const editedTransactions = transactions.map((t) => (t.id === 't1' ? { ...t, employeeAmount: 9999 } : t));
    const results = reconcileEpfContributionRows(statement.rows, editedTransactions);
    const aprilRow = results.find((r) => r.wagesMonth === '2023-04');
    expect(aprilRow?.kind).toBe('conflict');
  });

  it('throws EpfExcelParseError for a workbook missing the required sheets', async () => {
    const workbook: WorkBook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([['not', 'a', 'penny', 'export']]), 'RandomSheet');
    const bytes = new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    await expect(parseEpfExcelExport(bytes)).rejects.toThrow(EpfExcelParseError);
  });

  it('throws EpfExcelParseError for an export with no transactions at all', async () => {
    const bytes = toWorkbookBytes(buildEpfExcelExport(baseInput({ transactions: [] })));
    await expect(parseEpfExcelExport(bytes)).rejects.toThrow(EpfExcelParseError);
  });

  it('throws EpfExcelParseError for unreadable bytes', async () => {
    await expect(parseEpfExcelExport(new Uint8Array([1, 2, 3]))).rejects.toThrow(EpfExcelParseError);
  });
});
