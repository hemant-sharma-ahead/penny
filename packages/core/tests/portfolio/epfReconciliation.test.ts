import { describe, expect, it } from 'vitest';
import {
  reconcileEpfContributionRows,
  reconcileEpfBalanceEvent,
  reconcileEpfBalanceEventAtDate
} from '@/core/portfolio/epfReconciliation';
import type { ParsedEpfPassbookRow } from '@/core/portfolio/epfPassbookParser';
import type { EpfTransaction } from '@/core/db/types';

function row(overrides: Partial<ParsedEpfPassbookRow> = {}): ParsedEpfPassbookRow {
  return {
    wagesMonth: '2020-04',
    date: new Date(2020, 4, 15).getTime(),
    particulars: 'Cont. for Due-Month 052020',
    epfWages: 20000,
    epsWages: 15000,
    employeeAmount: 2400,
    employerAmount: 734,
    pensionAmount: 1250,
    ...overrides
  };
}

function transaction(overrides: Partial<EpfTransaction> = {}): EpfTransaction {
  return {
    id: 't1',
    type: 'contribution',
    wagesMonth: '2020-04',
    date: new Date(2020, 4, 15).getTime(),
    employeeAmount: 2400,
    employerAmount: 734,
    pensionAmount: 1250,
    ...overrides
  };
}

describe('reconcileEpfContributionRows', () => {
  it('classifies a row with no existing entry as "new"', () => {
    const result = reconcileEpfContributionRows([row()], []);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('new');
    expect(result[0]?.existing).toBeUndefined();
  });

  it('classifies a row that agrees with an existing entry as "matches"', () => {
    const result = reconcileEpfContributionRows([row()], [transaction()]);
    expect(result[0]?.kind).toBe('matches');
    expect(result[0]?.existing?.id).toBe('t1');
  });

  it('classifies a row that disagrees with an existing entry as "conflict", keeping the imported value distinct from the existing one', () => {
    const result = reconcileEpfContributionRows(
      [row({ employeeAmount: 5000 })],
      [transaction({ employeeAmount: 2400 })]
    );
    expect(result[0]?.kind).toBe('conflict');
    expect(result[0]?.imported.employeeAmount).toBe(5000);
    expect(result[0]?.existing?.employeeAmount).toBe(2400);
  });

  it('tolerates a trivial rounding difference as "matches", not "conflict"', () => {
    const result = reconcileEpfContributionRows(
      [row({ employeeAmount: 2400 })],
      [transaction({ employeeAmount: 2400.6 })]
    );
    expect(result[0]?.kind).toBe('matches');
  });

  it('matches by wagesMonth EXACTLY — a different month never collides with an existing entry, even with identical amounts', () => {
    const result = reconcileEpfContributionRows(
      [row({ wagesMonth: '2020-05' })],
      [transaction({ wagesMonth: '2020-04' })]
    );
    expect(result[0]?.kind).toBe('new');
  });

  it('ignores an existing non-contribution transaction when matching contribution rows (interest never collides with a contribution)', () => {
    const result = reconcileEpfContributionRows(
      [row()],
      [transaction({ type: 'interest', amount: 2400, employeeAmount: undefined })]
    );
    expect(result[0]?.kind).toBe('new'); // the interest entry must not be treated as a matching contribution
  });

  it('reconciles multiple rows independently, each against its own wagesMonth key', () => {
    const rows = [row({ wagesMonth: '2020-04' }), row({ wagesMonth: '2020-05', employeeAmount: 9999 })];
    const existing = [transaction({ wagesMonth: '2020-04' })];
    const result = reconcileEpfContributionRows(rows, existing);
    expect(result.map((r) => r.kind)).toEqual(['matches', 'new']);
  });
});

describe('reconcileEpfBalanceEvent', () => {
  it('returns null when there is nothing to reconcile (interest not yet credited)', () => {
    expect(reconcileEpfBalanceEvent('interest', 2024, null, [])).toBeNull();
  });

  it('classifies as "new" when no existing interest entry exists for that financial year', () => {
    const result = reconcileEpfBalanceEvent(
      'interest',
      2024,
      { employeeAmount: 408, employerAmount: 141, pensionAmount: 0 },
      []
    );
    expect(result?.kind).toBe('new');
  });

  it('classifies as "matches" when an existing interest entry for the same FY agrees', () => {
    const existing: EpfTransaction = {
      id: 'i1',
      type: 'interest',
      date: new Date(2025, 2, 31).getTime(), // 31 Mar 2025 — inside FY2024-25 (Apr 2024-Mar 2025)
      amount: 408
    };
    const result = reconcileEpfBalanceEvent(
      'interest',
      2024,
      { employeeAmount: 408, employerAmount: 0, pensionAmount: 0 },
      [existing]
    );
    expect(result?.kind).toBe('matches');
  });

  it('classifies as "conflict" when an existing manually-logged interest guess disagrees with the imported figure', () => {
    const existing: EpfTransaction = {
      id: 'i1',
      type: 'interest',
      date: new Date(2025, 2, 31).getTime(),
      amount: 200 // a rough manual guess, wrong
    };
    const result = reconcileEpfBalanceEvent(
      'interest',
      2024,
      { employeeAmount: 408, employerAmount: 0, pensionAmount: 0 },
      [existing]
    );
    expect(result?.kind).toBe('conflict');
    expect(result?.imported.employeeAmount).toBe(408);
  });

  it('does not match an existing interest entry from a DIFFERENT financial year', () => {
    const existing: EpfTransaction = {
      id: 'i1',
      type: 'interest',
      date: new Date(2023, 2, 31).getTime(), // FY2022-23, not FY2024-25
      amount: 408
    };
    const result = reconcileEpfBalanceEvent(
      'interest',
      2024,
      { employeeAmount: 408, employerAmount: 0, pensionAmount: 0 },
      [existing]
    );
    expect(result?.kind).toBe('new'); // the other year's entry must not be treated as a match
  });

  // Real bug fixed post-launch: reconcileEpfBalanceEvent originally only ever served the once-a-year
  // interest case, defaulting every event's date/label to the FY-end/"Int. Updated" shape — reused
  // for a passbook-detected transfer_in/withdrawal row (see epfPassbookParser.ts's classifyRow),
  // which has its own real date and particulars that would otherwise be lost.
  it('accepts a real event date and label, used instead of the FY-end/"Int. Updated" default', () => {
    const realDate = new Date(2018, 5, 12).getTime(); // 12 Jun 2018
    const result = reconcileEpfBalanceEvent(
      'transfer_in',
      2018,
      { employeeAmount: 50000, employerAmount: 15000, pensionAmount: 0 },
      [],
      realDate,
      'TRANSFER IN - Old Member Id ABCD1234567890' // pii-ignore: fabricated
    );
    expect(result?.date).toBe(realDate);
    expect(result?.sourceParticulars).toBe('TRANSFER IN - Old Member Id ABCD1234567890'); // pii-ignore: fabricated
    expect(result?.type).toBe('transfer_in');
  });

  // Real reported bug (2026-08-xx): a withdrawal's employer-side amount was silently dropped at
  // write time (`buildImportedTxn`'s old else-branch), and reconciliation compared everything as an
  // employee-only figure regardless — so re-importing the SAME statement could never even detect
  // that its own previously-recorded employer amount was wrong (missing entirely). Both fixed
  // together: `existingAmounts()` now prefers a real split when the existing record already has one.
  it('compares BOTH employee and employer amounts once an existing record has a real split', () => {
    const existing: EpfTransaction = {
      id: 'w1',
      type: 'withdrawal',
      date: new Date(2019, 10, 20).getTime(),
      employeeAmount: 35000,
      employerAmount: 13921,
      amount: 48921
    };
    // Same total (48,921) but the underlying split disagrees — must be a genuine conflict, not
    // silently "matches" just because an employee-only comparison would have agreed on its own.
    const result = reconcileEpfBalanceEvent(
      'withdrawal',
      2019,
      { employeeAmount: 35000, employerAmount: 20000, pensionAmount: 0 },
      [existing]
    );
    expect(result?.kind).toBe('conflict');
  });

  it('still matches when both employee and employer amounts genuinely agree with an already-split record', () => {
    const existing: EpfTransaction = {
      id: 'w1',
      type: 'withdrawal',
      date: new Date(2019, 10, 20).getTime(),
      employeeAmount: 35000,
      employerAmount: 13921,
      amount: 48921
    };
    const result = reconcileEpfBalanceEvent(
      'withdrawal',
      2019,
      { employeeAmount: 35000, employerAmount: 13921, pensionAmount: 0 },
      [existing]
    );
    expect(result?.kind).toBe('matches');
  });

  it('falls back to the FY-end date/"Int. Updated" label when eventDate/label are omitted (unchanged default)', () => {
    const result = reconcileEpfBalanceEvent(
      'interest',
      2024,
      { employeeAmount: 408, employerAmount: 0, pensionAmount: 0 },
      []
    );
    const fyEndMs = new Date(2025, 2, 31, 23, 59, 59, 999).getTime();
    expect(result?.date).toBe(fyEndMs);
    expect(result?.sourceParticulars).toBe('Int. Updated — FY2024-25');
  });
});

// Real bug this covers (2026-08-30, found against a real multi-employer transfer): a single FY can
// genuinely contain SEVERAL distinct transfer_in/withdrawal events (e.g. the real principal transfer,
// followed months later by a separate "TRANSFER IN - INTEREST AMOUNT ONLY" catch-up credit) —
// `reconcileEpfBalanceEvent`'s "one event per (type, FY)" model can't represent that; this matches by
// each event's own EXACT date instead.
describe('reconcileEpfBalanceEventAtDate', () => {
  const amounts = { employeeAmount: 60000, employerAmount: 20000, pensionAmount: 0 };

  it('is "new" when nothing exists at this exact date', () => {
    const result = reconcileEpfBalanceEventAtDate('transfer_in', amounts, new Date(2019, 9, 1).getTime(), 'p', []);
    expect(result.kind).toBe('new');
  });

  it('treats two genuinely distinct same-type events in one FY as two separate items, not one aggregate', () => {
    const principalDate = new Date(2019, 9, 1).getTime(); // 1 Oct 2019
    const interestOnlyDate = new Date(2020, 2, 1).getTime(); // 1 Mar 2020 — same FY2019-20
    const principal = reconcileEpfBalanceEventAtDate(
      'transfer_in',
      amounts,
      principalDate,
      'TRANSFER IN - Old Member Id ABC',
      []
    );
    const interestOnly = reconcileEpfBalanceEventAtDate(
      'transfer_in',
      { employeeAmount: 900, employerAmount: 300, pensionAmount: 0 },
      interestOnlyDate,
      'TRANSFER IN - INTEREST AMOUNT ONLY (Old Member Id-:ABC)',
      []
    );
    expect(principal.date).toBe(principalDate);
    expect(interestOnly.date).toBe(interestOnlyDate);
    expect(principal.kind).toBe('new');
    expect(interestOnly.kind).toBe('new');
  });

  it('matches an existing transaction only at the EXACT same date, not just the same FY', () => {
    const existing: EpfTransaction = {
      id: 'x1',
      type: 'transfer_in',
      date: new Date(2019, 9, 1).getTime(),
      employeeAmount: 60000,
      employerAmount: 20000,
      amount: 80000
    };
    const sameDate = reconcileEpfBalanceEventAtDate('transfer_in', amounts, new Date(2019, 9, 1).getTime(), 'p', [
      existing
    ]);
    const differentDate = reconcileEpfBalanceEventAtDate('transfer_in', amounts, new Date(2019, 11, 1).getTime(), 'p', [
      existing
    ]);
    expect(sameDate.kind).toBe('matches');
    expect(differentDate.kind).toBe('new');
  });

  it('flags a conflict when the exact same date already has a DIFFERENT amount logged', () => {
    const existing: EpfTransaction = {
      id: 'x1',
      type: 'transfer_in',
      date: new Date(2019, 9, 1).getTime(),
      employeeAmount: 1,
      employerAmount: 1,
      amount: 2
    };
    const result = reconcileEpfBalanceEventAtDate('transfer_in', amounts, new Date(2019, 9, 1).getTime(), 'p', [
      existing
    ]);
    expect(result.kind).toBe('conflict');
  });
});
