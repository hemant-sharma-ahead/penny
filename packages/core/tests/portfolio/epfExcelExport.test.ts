import { describe, expect, it } from 'vitest';
import { buildEpfExcelExport, type EpfExcelExportInput } from '@/core/portfolio/epfExcelExport';
import { EPF_RATE_TABLE_FALLBACK } from '@/core/portfolio/epfInterestRates';
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';

function baseInput(overrides: Partial<EpfExcelExportInput> = {}): EpfExcelExportInput {
  return {
    uan: '100987654321', // pii-ignore: fabricated test data (same fake value as seedDemoData.ts)
    epfBirthYear: 1990,
    employers: [],
    transactions: [],
    corpus: { employeeTotal: 0, employerTotal: 0, interestEarned: 0 },
    rateTable: EPF_RATE_TABLE_FALLBACK,
    // Noon UTC — avoids the filename's `.toISOString().slice(0, 10)` landing on the previous/next
    // day depending on the test runner's local timezone offset from UTC.
    generatedAt: Date.UTC(2026, 7, 8, 12),
    ...overrides
  };
}

function sheet(result: ReturnType<typeof buildEpfExcelExport>, name: string) {
  const s = result.sheets.find((s) => s.name === name);
  if (!s) throw new Error(`sheet ${name} not found`);
  return s;
}

describe('buildEpfExcelExport', () => {
  it('produces exactly the 5 sheets §11 specifies, in order', () => {
    const result = buildEpfExcelExport(baseInput());
    expect(result.sheets.map((s) => s.name)).toEqual([
      'Summary',
      'Employers',
      'Transactions',
      'Interest History',
      'Salary Hikes'
    ]);
  });

  it('filename is stable and dated', () => {
    const result = buildEpfExcelExport(baseInput());
    expect(result.filename).toBe('Penny_EPF_Statement_2026-08-08.xlsx');
  });

  it('Summary sheet includes UAN and birth year when known, omits them when not', () => {
    const withIds = sheet(buildEpfExcelExport(baseInput()), 'Summary');
    expect(withIds.rows.some((r) => r[0] === 'UAN' && r[1] === '100987654321')).toBe(true); // pii-ignore: fabricated
    expect(withIds.rows.some((r) => r[0] === 'Birth year' && r[1] === 1990)).toBe(true);

    const without = sheet(buildEpfExcelExport(baseInput({ uan: undefined, epfBirthYear: undefined })), 'Summary');
    expect(without.rows.some((r) => r[0] === 'UAN')).toBe(false);
    expect(without.rows.some((r) => r[0] === 'Birth year')).toBe(false);
  });

  it('Employers sheet lists company/member/establishment IDs and current-vs-past status', () => {
    const employers: EpfEmployer[] = [
      {
        id: 'e1',
        companyName: 'COGNIZANT',
        basicSalary: 60000,
        employeeContribPct: 12,
        fromDate: new Date(2020, 3, 1).getTime(),
        memberId: 'TSTEST00000000019999999', // pii-ignore: synthetic
        establishmentId: 'TSTEST0000000001'
      },
      {
        id: 'e2',
        companyName: 'Wipro',
        basicSalary: 40000,
        employeeContribPct: 12,
        fromDate: new Date(2016, 3, 1).getTime(),
        toDate: new Date(2019, 2, 20).getTime()
      }
    ];
    const result = sheet(buildEpfExcelExport(baseInput({ employers })), 'Employers');
    expect(result.rows[0]).toEqual([
      'Company Name',
      'Member ID',
      'Establishment ID',
      'Basic + DA (₹/mo)',
      'Employee Contribution %',
      'From',
      'To',
      'Status'
    ]);
    const cognizantRow = result.rows.find((r) => r[0] === 'COGNIZANT');
    expect(cognizantRow?.[1]).toBe('TSTEST00000000019999999');
    expect(cognizantRow?.[7]).toBe('Current');
    const wiproRow = result.rows.find((r) => r[0] === 'Wipro');
    expect(wiproRow?.[7]).toBe('Past');
  });

  it('Transactions sheet shows the FY rate used only on interest rows', () => {
    const transactions: EpfTransaction[] = [
      {
        id: 't1',
        type: 'contribution',
        wagesMonth: '2023-06',
        date: new Date(2023, 6, 10).getTime(),
        employeeAmount: 1000,
        employerAmount: 300
      },
      { id: 't2', type: 'interest', date: new Date(2024, 2, 31).getTime(), amount: 500 }
    ];
    const result = sheet(buildEpfExcelExport(baseInput({ transactions })), 'Transactions');
    const contribRow = result.rows.find((r) => r[1] === 'contribution');
    const interestRow = result.rows.find((r) => r[1] === 'interest');
    expect(contribRow?.[8]).toBe(''); // no rate on a contribution row
    // FY2023-24 (transaction dated Mar 2024) resolves to the fallback table's 8.25% rate.
    expect(interestRow?.[8]).toBe(8.25);
  });

  it('Transactions sheet attributes a contribution to whichever employer covers its wage month', () => {
    const employers: EpfEmployer[] = [
      {
        id: 'e1',
        companyName: 'COGNIZANT',
        basicSalary: 60000,
        employeeContribPct: 12,
        fromDate: new Date(2022, 3, 1).getTime()
      }
    ];
    const transactions: EpfTransaction[] = [
      {
        id: 't1',
        type: 'contribution',
        wagesMonth: '2023-06',
        date: new Date(2023, 6, 10).getTime(),
        employeeAmount: 1000,
        employerAmount: 300
      }
    ];
    const result = sheet(buildEpfExcelExport(baseInput({ employers, transactions })), 'Transactions');
    expect(result.rows[1]?.[3]).toBe('COGNIZANT');
  });

  it('Interest History sheet aggregates interest transactions by financial year', () => {
    const transactions: EpfTransaction[] = [
      { id: 't1', type: 'interest', date: new Date(2024, 2, 31).getTime(), amount: 500 },
      { id: 't2', type: 'interest', date: new Date(2025, 2, 31).getTime(), amount: 700 }
    ];
    const result = sheet(buildEpfExcelExport(baseInput({ transactions })), 'Interest History');
    expect(result.rows.slice(1).map((r) => r[0])).toEqual(['FY 2023-24', 'FY 2024-25']);
  });

  it('Salary Hikes sheet lists one row per hike per employer', () => {
    const employers: EpfEmployer[] = [
      {
        id: 'e1',
        companyName: 'COGNIZANT',
        basicSalary: 60000,
        employeeContribPct: 12,
        fromDate: new Date(2022, 3, 1).getTime(),
        hikeTimeline: [{ fromDate: new Date(2023, 3, 1).getTime(), basicSalary: 65000 }]
      }
    ];
    const result = sheet(buildEpfExcelExport(baseInput({ employers })), 'Salary Hikes');
    expect(result.rows).toHaveLength(2); // header + 1 hike
    expect(result.rows[1]?.[2]).toBe(65000);
  });
});
