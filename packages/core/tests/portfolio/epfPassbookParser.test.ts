import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEpfPassbookPdf, classifyRow, EpfPassbookParseError } from '@/core/portfolio/epfPassbookParser';

// Synthetic fixture (fake data throughout — no real UAN/member ID/name) built to mirror the exact
// structural quirks of a REAL EPFO passbook PDF, verified during this feature's design/feasibility
// research (see docs/plans/epf-passbook-import.md §4/§8): bilingual header labels, a wrapped
// establishment/member name spanning 2 lines, and the "OB Int. Updated upto"/"Int. Updated upto"/
// "Closing Balance as on" summary rows. Its own numbers (interest, closing balance) were computed
// with the SAME verified accrual algorithm this parser's sibling module
// (`epfInterestCalculator.ts`) implements, so this fixture is internally consistent, not just
// plausible-looking. A REAL sample passbook was also used directly (not committed — it carries real
// PII in its text layer even with the image visually redacted) to validate the regexes below before
// this synthetic fixture was built; this synthetic file is what stays in git.
const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/epf-passbook-synthetic.pdf', import.meta.url));

async function loadFixtureBytes(): Promise<Uint8Array> {
  return new Uint8Array(readFileSync(FIXTURE_PATH));
}

describe('parseEpfPassbookPdf', () => {
  it('parses the header block (establishment/member identity, financial year)', async () => {
    const result = await parseEpfPassbookPdf(await loadFixtureBytes());
    expect(result.establishmentId).toBe('TSTEST0000000001');
    expect(result.establishmentName).toBe('SYNTHETIC TEST EMPLOYER PRIVATE LIMITED');
    expect(result.memberId).toBe('TSTEST00000000019999999'); // pii-ignore: synthetic
    expect(result.memberName).toBe('TEST SYNTHETIC USER');
    expect(result.fyStartYear).toBe(2020);
  });

  it('parses every transaction row with correctly-aligned columns', async () => {
    const result = await parseEpfPassbookPdf(await loadFixtureBytes());
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      wagesMonth: '2020-04',
      particulars: 'Cont. for Due-Month 052020',
      epfWages: 20000,
      epsWages: 15000,
      employeeAmount: 2400,
      employerAmount: 734,
      pensionAmount: 1250
    });
    expect(result.rows[1]).toMatchObject({
      wagesMonth: '2020-05',
      employeeAmount: 2400,
      employerAmount: 734,
      pensionAmount: 1250
    });
  });

  it('parses the real transaction/deposit date, not an inferred one', async () => {
    const result = await parseEpfPassbookPdf(await loadFixtureBytes());
    // "Apr-2020 15-05-2020" — wage month April, but the row's own real deposit date is 15 May 2020.
    // Compared via local date parts (matching how the parser itself constructs the date, via
    // `new Date(year, monthIndex, day)`), not `.toISOString()`, which shifts by the runner's own
    // timezone offset and would make this test's expected value environment-dependent.
    const d = new Date(result.rows[0]?.date ?? 0);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2020, 5, 15]);
  });

  it('parses the opening and closing balance checkpoints', async () => {
    const result = await parseEpfPassbookPdf(await loadFixtureBytes());
    expect(result.openingCheckpoint).toMatchObject({
      employeeBalance: 1000,
      employerBalance: 500,
      pensionBalance: 200
    });
    expect(result.closingCheckpoint).toMatchObject({
      employeeBalance: 6208,
      employerBalance: 2109,
      pensionBalance: 2700
    });
  });

  it('parses the credited interest row, distinct from the opening/closing balance rows', async () => {
    const result = await parseEpfPassbookPdf(await loadFixtureBytes());
    expect(result.creditedInterest).toEqual({ employeeAmount: 408, employerAmount: 141, pensionAmount: 0 });
  });

  it('throws EpfPassbookParseError for a PDF with no extractable text at all', async () => {
    // A minimal, syntactically-valid but content-free PDF — simulates the real negative case hit
    // during this feature's research (a screenshot-as-PDF with zero extractable text).
    const emptyPdf = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
        'xref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF'
    );
    await expect(parseEpfPassbookPdf(emptyPdf)).rejects.toThrow(EpfPassbookParseError);
  });

  it('throws EpfPassbookParseError for a text-bearing PDF that is not actually an EPFO passbook', async () => {
    await expect(parseEpfPassbookPdf(new TextEncoder().encode('not a pdf at all'))).rejects.toThrow(
      EpfPassbookParseError
    );
  });
});

describe('classifyRow', () => {
  // Real bug this exists to fix (found via real-device testing): every row was previously being
  // written as a `'contribution'` regardless of its actual particulars — a genuine "TRANSFER IN"
  // row silently became a fabricated monthly contribution.
  it('classifies a normal credited contribution row', () => {
    expect(classifyRow('CR', 'Cont. for Due-Month 122014')).toBe('contribution');
  });

  it('classifies a "TRANSFER IN" row regardless of exact spacing/case', () => {
    expect(classifyRow('CR', 'TRANSFER IN - Old Member Id ABCD1234567890')).toBe('transfer_in'); // pii-ignore: fabricated
    expect(classifyRow('CR', 'Transfer-In from previous account')).toBe('transfer_in');
  });

  it('classifies a settlement/withdrawal/"TRANSFER OUT" row as withdrawal', () => {
    expect(classifyRow('DR', 'TRANSFER OUT - New Member Id XYZ0987654321')).toBe('withdrawal'); // pii-ignore: fabricated
    expect(classifyRow('DR', 'Final Settlement')).toBe('withdrawal');
    expect(classifyRow('DR', 'PF Final Claim Settled')).toBe('withdrawal');
  });

  it('falls back to withdrawal for any unrecognized DR row (never silently treated as a contribution)', () => {
    expect(classifyRow('DR', 'Some unrecognized debit particulars')).toBe('withdrawal');
  });

  it('defaults to contribution for an unrecognized CR row', () => {
    expect(classifyRow('CR', 'Some unrecognized credit particulars')).toBe('contribution');
  });
});
