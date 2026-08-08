// EPF passbook/Excel import — types, file picking, and the commit-to-Holding logic. See
// docs/plans/epf-passbook-import.md §10.1/§10.4 and mockup v4 §1/§5. Kept in its own
// components-free file (not `EpfImportFlow.tsx`) purely so that file can stay a components-only
// module — this repo's Fast Refresh lint rule requires a `.tsx` exporting a component to export
// nothing else.
//
// One picked FILE can contain multiple reconciliation UNITS: a PDF passbook is always exactly one
// employer+FY (doc §2), but a Penny-exported `.xlsx` can round-trip many employer/FY groups plus
// standalone balance events (interest/transfer/withdrawal/advance — not employer-scoped in this schema,
// see `epfExcelImport.ts`'s own doc comment) in a single file. The batch summary screen (in
// `EpfImportFlow.tsx`) operates at file granularity (duplicate/unreadable detection); the sequential
// review screen operates at unit granularity, flattening every ready file's units into one queue — so a
// single multi-group Excel file reuses the exact same per-unit review screen as a batch of PDFs.
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { Holding, EpfEmployer, EpfTransaction, EpfTransactionType } from '@/core/db/types';
import { buildBaseHolding } from '@/core/portfolio/holdingMappers';
import { epfEmployerForWagesMonth } from '@/core/portfolio/epfCalculations';
import {
  parseEpfPassbookPdf,
  EpfPassbookParseError,
  type ParsedEpfPassbookRow,
  type ParsedEpfBalanceCheckpoint
} from '@/core/portfolio/epfPassbookParser';
import { parseEpfExcelExport, EpfExcelParseError } from '@/core/portfolio/epfExcelImport';
import {
  reconcileEpfContributionRows,
  reconcileEpfBalanceEvent,
  type EpfReconciliationItem
} from '@/core/portfolio/epfReconciliation';
import { fyLabel, dateToFyStartYear } from './epfInterestOnDemand';
import { EPF_TX_LABELS } from './epfTxLabels';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EpfImportEmployerUnit {
  kind: 'employer';
  key: string;
  companyName: string;
  establishmentId?: string | undefined;
  memberId?: string | undefined;
  fyStartYear: number;
  rows: ParsedEpfPassbookRow[];
  creditedInterest: { employeeAmount: number; employerAmount: number; pensionAmount: number } | null;
  openingCheckpoint: ParsedEpfBalanceCheckpoint | null;
  closingCheckpoint: ParsedEpfBalanceCheckpoint | null;
}

export interface EpfImportBalanceUnit {
  kind: 'balanceEvent';
  key: string;
  type: EpfTransactionType;
  fyStartYear: number;
  amounts: { employeeAmount: number; employerAmount: number; pensionAmount: number };
}

export type EpfImportUnit = EpfImportEmployerUnit | EpfImportBalanceUnit;

export interface EpfImportFile {
  id: string;
  fileName: string;
  format: 'pdf' | 'xlsx';
  status: 'ready' | 'duplicate' | 'unreadable';
  errorMessage?: string;
  units: EpfImportUnit[];
  uan?: string | undefined;
  epfBirthYear?: number | undefined;
}

/** Everything the review UI has computed for one unit: which "new" item keys stayed checked, and which
 *  side each conflict resolved to. */
export interface EpfUnitSelection {
  checkedKeys: Set<string>;
  conflictChoices: Map<string, 'imported' | 'existing'>;
}

// ─── Pick + parse ───────────────────────────────────────────────────────────

/** Opens the (multi-select) file picker, parses every picked file with whichever parser its extension
 *  indicates (PDF passbook vs. a previously-exported Penny `.xlsx` — doc §11's "same entry point handles
 *  both directions and both formats"), and flags duplicates/unreadable files — never silently retried or
 *  dropped (doc §10.4). Returns `null` if the user cancelled the picker entirely. */
export async function pickAndParseEpfFiles(): Promise<EpfImportFile[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    type:
      Platform.OS === 'web'
        ? '*/*'
        : ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '*/*'],
    copyToCacheDirectory: true
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;

  const files: EpfImportFile[] = [];
  const seenSignatures = new Set<string>();

  for (const asset of result.assets) {
    const id = crypto.randomUUID();
    const isXlsx = /\.xlsx?$/i.test(asset.name);
    const isPdf = /\.pdf$/i.test(asset.name);

    if (!isXlsx && !isPdf) {
      files.push({
        id,
        fileName: asset.name,
        format: 'pdf',
        status: 'unreadable',
        errorMessage: 'Unrecognized file type — expected a passbook PDF or a Penny .xlsx export.',
        units: []
      });
      continue;
    }

    try {
      const bytes =
        Platform.OS === 'web' && asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : await new File(asset.uri).bytes();

      let units: EpfImportUnit[];
      let uan: string | undefined;
      let epfBirthYear: number | undefined;

      if (isPdf) {
        const parsed = await parseEpfPassbookPdf(bytes);
        units = [
          {
            kind: 'employer',
            key: `${parsed.memberId || parsed.establishmentName}::${parsed.fyStartYear}`,
            companyName: parsed.establishmentName,
            establishmentId: parsed.establishmentId,
            memberId: parsed.memberId,
            fyStartYear: parsed.fyStartYear,
            rows: parsed.rows,
            creditedInterest: parsed.creditedInterest,
            openingCheckpoint: parsed.openingCheckpoint,
            closingCheckpoint: parsed.closingCheckpoint
          }
        ];
      } else {
        const parsed = await parseEpfExcelExport(bytes);
        uan = parsed.uan;
        epfBirthYear = parsed.epfBirthYear;
        units = [
          ...parsed.employerStatements.map((s): EpfImportEmployerUnit => ({
            kind: 'employer',
            key: `${s.employerKey}::${s.fyStartYear}`,
            companyName: s.companyName,
            establishmentId: s.establishmentId,
            memberId: s.memberId,
            fyStartYear: s.fyStartYear,
            rows: s.rows,
            creditedInterest: null,
            openingCheckpoint: null,
            closingCheckpoint: null
          })),
          ...parsed.balanceEvents.map((e): EpfImportBalanceUnit => ({
            kind: 'balanceEvent',
            key: `${e.type}::${e.fyStartYear}`,
            type: e.type,
            fyStartYear: e.fyStartYear,
            amounts: e.amounts
          }))
        ];
      }

      const signature = [...units.map((u) => u.key)].sort().join('|');
      const isDuplicate = signature.length > 0 && seenSignatures.has(signature);
      if (!isDuplicate) seenSignatures.add(signature);

      files.push({
        id,
        fileName: asset.name,
        format: isPdf ? 'pdf' : 'xlsx',
        status: isDuplicate ? 'duplicate' : 'ready',
        units,
        uan,
        epfBirthYear
      });
    } catch (err) {
      const detail =
        err instanceof EpfPassbookParseError || err instanceof EpfExcelParseError
          ? err.message
          : 'Could not read this file.';
      files.push({
        id,
        fileName: asset.name,
        format: isPdf ? 'pdf' : 'xlsx',
        status: 'unreadable',
        errorMessage: detail,
        units: []
      });
    }
  }

  return files;
}

// ─── Commit logic (pure, no I/O) ────────────────────────────────────────────

export function itemKey(item: EpfReconciliationItem): string {
  return item.wagesMonth ?? item.type;
}

function findEmployerIndex(employers: EpfEmployer[], memberId: string | undefined, companyName: string): number {
  if (memberId) {
    // A unit with its own real memberId never falls back to a plain name match — protects against the
    // "rejoined the same employer under a new Member ID" ambiguity memberId exists to resolve (doc §5).
    return employers.findIndex((e) => e.memberId === memberId);
  }
  return employers.findIndex(
    (e) => !e.memberId && e.companyName.trim().toLowerCase() === companyName.trim().toLowerCase()
  );
}

function createEmployerFromUnit(unit: EpfImportEmployerUnit, employers: EpfEmployer[]): EpfEmployer {
  const rowDates = unit.rows.map((r) => r.date);
  const fyStartMs = new Date(unit.fyStartYear, 3, 1).getTime();
  const fromDate = rowDates.length > 0 ? Math.min(...rowDates) : fyStartMs;
  const basicSalary = unit.rows.reduce((max, r) => Math.max(max, r.epfWages), 0);

  const currentEmp = employers.find((e) => !e.toDate);
  // If an existing "current" employer's own employment clearly started after this unit's dates, this
  // import is for an earlier job — bound its toDate there so only one employer is ever "current" at a
  // time. Otherwise (no current employer yet, or an ambiguous overlap a real EPF career shouldn't
  // produce) leave it open — see the design doc §9's still-open note on employer-picker ambiguity.
  const toDate = currentEmp && currentEmp.fromDate > fromDate ? currentEmp.fromDate : undefined;

  return {
    id: crypto.randomUUID(),
    companyName: unit.companyName,
    basicSalary,
    employeeContribPct: 12,
    fromDate,
    confirmedFys: [unit.fyStartYear],
    ...(toDate !== undefined && { toDate }),
    ...(unit.establishmentId && { establishmentId: unit.establishmentId }),
    ...(unit.memberId && { memberId: unit.memberId })
  };
}

function backfillEmployerIds(emp: EpfEmployer, unit: EpfImportEmployerUnit): EpfEmployer {
  if ((!emp.establishmentId && unit.establishmentId) || (!emp.memberId && unit.memberId)) {
    return {
      ...emp,
      ...(!emp.establishmentId && unit.establishmentId && { establishmentId: unit.establishmentId }),
      ...(!emp.memberId && unit.memberId && { memberId: unit.memberId })
    };
  }
  return emp;
}

/** Extends an EXISTING employer's `[fromDate, toDate]` coverage and `confirmedFys` to fit a
 *  newly-imported unit's real data — found via real-device testing across two related bugs:
 *
 *  1. Importing FY2014-15 then answering "No" to the employment prompt bounds `toDate` to March
 *     2015; a LATER import of FY2015-16 for the same employer (matched by `memberId`) was writing
 *     real transactions past that boundary without ever moving it, so `epfComputeAllMonths()`
 *     (whose per-employer loop stops at `toDate`) silently never reached those months — the new
 *     transactions existed in `epfTransactions[]` but were invisible in both "See all transactions"
 *     and the card's totals, which both derive from that same function.
 *  2. The naive fix for #1 (extend `toDate` to the newly-imported unit's FY-END whenever ANY unit
 *     for that FY is imported) is ALSO wrong: importing a later year where the person had already
 *     left mid-way through a PRIOR year (so this unit's real rows stop partway through the FY, or
 *     there are no contribution rows in it at all — only an interest credit or a transfer-out) is
 *     not evidence employment continued to the end of that FY, or into this FY at all. `toDate`
 *     must extend only as far as the LATEST REAL CONTRIBUTION row actually found, never blindly to
 *     a calendar FY boundary — and a unit with zero contribution rows extends `toDate` not at all
 *     (it still gets marked into `confirmedFys` below, so those empty months read as confirmed
 *     zeros rather than estimates — see `epfComputeAllMonths`).
 *
 *  `fromDate` extends backward the same way (by real row date, not FY start) if an even-older unit
 *  is imported later — symmetric fix, same root cause. Every imported unit's FY is unconditionally
 *  added to `confirmedFys` regardless of whether it moves `fromDate`/`toDate` at all — a
 *  contribution-free confirmed year is real, authoritative EPFO data, not a gap. */
function extendEmployerCoverage(emp: EpfEmployer, unit: EpfImportEmployerUnit): EpfEmployer {
  let result = emp;

  const confirmedFys = new Set(result.confirmedFys ?? []);
  confirmedFys.add(unit.fyStartYear);
  result = { ...result, confirmedFys: [...confirmedFys].sort((a, b) => a - b) };

  const contributionRows = unit.rows.filter((r) => (r.rowType ?? 'contribution') === 'contribution');
  const rowDates = contributionRows.map((r) => r.date);
  const earliestRowDate = rowDates.length > 0 ? Math.min(...rowDates) : null;
  const latestRowDate = rowDates.length > 0 ? Math.max(...rowDates) : null;

  if (earliestRowDate !== null && earliestRowDate < result.fromDate) {
    result = { ...result, fromDate: earliestRowDate };
  }

  if (latestRowDate !== null && result.toDate !== undefined && latestRowDate > result.toDate) {
    const latestIsCurrentFy = dateToFyStartYear(latestRowDate) >= dateToFyStartYear(Date.now());
    // Omit `toDate` entirely (never set it to `undefined`) — this repo's `exactOptionalPropertyTypes`
    // convention, matching `createEmployerFromUnit`'s own conditional-spread pattern above.
    const { toDate, ...withoutToDate } = result;
    void toDate;
    result = latestIsCurrentFy
      ? { ...withoutToDate, currentEmploymentConfirmed: true }
      : { ...result, toDate: latestRowDate, currentEmploymentConfirmed: false };
  }

  return result;
}

function mergeCheckpoints(emp: EpfEmployer, unit: EpfImportEmployerUnit): EpfEmployer {
  const cps = [...(emp.balanceCheckpoints ?? [])];
  const before = cps.length;
  for (const cp of [unit.openingCheckpoint, unit.closingCheckpoint]) {
    if (cp && !cps.some((existing) => existing.asOfDate === cp.asOfDate)) cps.push(cp);
  }
  if (cps.length === before) return emp;
  cps.sort((a, b) => a.asOfDate - b.asOfDate);
  return { ...emp, balanceCheckpoints: cps };
}

function buildImportedTxn(
  item: EpfReconciliationItem,
  row: ParsedEpfPassbookRow | undefined,
  batchId: string,
  employerId: string | undefined
): EpfTransaction {
  const base: EpfTransaction = {
    id: crypto.randomUUID(),
    type: item.type,
    date: item.date,
    sourceParticulars: item.sourceParticulars,
    sourceRef: batchId
  };
  if (item.wagesMonth) base.wagesMonth = item.wagesMonth;
  if (item.type === 'contribution') {
    // Stamped on contributions only — the one type this schema actually attributes to a specific
    // employer (see `EpfTransaction.employerId`'s own doc comment: it exists specifically to
    // disambiguate a mid-month employer switch, where two employers legitimately share a
    // wagesMonth). interest/transfer_in/withdrawal/advance stay unscoped, matching this schema's
    // existing design (see `epfReconciliation.ts`'s own doc comments on those types).
    if (employerId) base.employerId = employerId;
    base.employeeAmount = item.imported.employeeAmount;
    base.employerAmount = item.imported.employerAmount;
    base.pensionAmount = item.imported.pensionAmount;
    if (row?.epfWages) base.epfWages = row.epfWages;
    if (row?.epsWages) base.epsWages = row.epsWages;
  } else if (item.type === 'interest' || item.type === 'transfer_in') {
    // A passbook-imported transfer-in carries a real employee/employer split (same table columns a
    // contribution row uses), same as an imported interest credit — worth keeping rather than
    // collapsing into the single-`amount` shape a manually-typed entry of either type has always
    // used (see `epfReconciliation.ts`'s own `existingAmounts()` for that legacy convention, still
    // used for manual entries and for withdrawal/advance below).
    base.employeeAmount = item.imported.employeeAmount;
    base.employerAmount = item.imported.employerAmount;
    base.amount = item.imported.employeeAmount + item.imported.employerAmount;
  } else {
    base.amount = item.imported.employeeAmount;
  }
  return base;
}

function mergeImportedIntoExisting(
  existing: EpfTransaction,
  item: EpfReconciliationItem,
  row: ParsedEpfPassbookRow | undefined,
  batchId: string,
  employerId: string | undefined
): EpfTransaction {
  const updated: EpfTransaction = { ...existing, sourceRef: batchId, sourceParticulars: item.sourceParticulars };
  if (item.type === 'contribution') {
    // Backfill employerId onto a legacy match/conflict that predates this field — same idea as
    // `backfillEmployerIds` for the employer record itself, never overwrites an already-set value.
    if (!updated.employerId && employerId) updated.employerId = employerId;
    updated.employeeAmount = item.imported.employeeAmount;
    updated.employerAmount = item.imported.employerAmount;
    updated.pensionAmount = item.imported.pensionAmount;
    if (row?.epfWages) updated.epfWages = row.epfWages;
    if (row?.epsWages) updated.epsWages = row.epsWages;
  } else if (item.type === 'interest' || item.type === 'transfer_in') {
    updated.employeeAmount = item.imported.employeeAmount;
    updated.employerAmount = item.imported.employerAmount;
    updated.amount = item.imported.employeeAmount + item.imported.employerAmount;
  } else {
    updated.amount = item.imported.employeeAmount;
  }
  return updated;
}

/** Reconciles one unit against the CURRENT working holding — recomputed live so a later unit in the same
 *  batch sees whatever the previous unit just wrote (doc §10.4's sequential review).
 *
 *  A real bug found via real-device testing: every row in a parsed passbook's transaction table was
 *  being reconciled as a `'contribution'` regardless of what it actually was — a genuine
 *  "TRANSFER IN - Old Member Id ..." row got silently written as a monthly contribution with a
 *  fabricated `wagesMonth`, never recognized as the one-time transfer it is. Rows are now split by
 *  their parser-classified `rowType` (`epfPassbookParser.ts`'s `classifyRow`) first: real
 *  contribution rows go through the existing wagesMonth-keyed reconciliation; transfer_in/withdrawal
 *  rows are grouped by type (summed if a passbook somehow has more than one of the same type in one
 *  FY — mirrors `epfExcelImport.ts`'s own same-type-same-FY aggregation) and reconciled via
 *  `reconcileEpfBalanceEvent`, using the row's own real date/particulars rather than the
 *  FY-end-date/"Int. Updated" label that function's original interest-only design defaults to.
 *
 *  A second real bug found via real-device testing: a mid-month EMPLOYER SWITCH (e.g. leaving
 *  Company A partway through August, joining Company B the same month) means both employers can
 *  have a genuine, real `wagesMonth: '2017-08'` contribution — but `reconcileEpfContributionRows`
 *  matches by wagesMonth ALONE, so importing Company B's August row was seeing Company A's already-
 *  logged August row as a "conflict" to resolve one-or-the-other, when really both are correct and
 *  belong to different employers. Fixed by scoping `existingTxns` to ONLY the transactions that
 *  belong to THIS unit's own employer (via `employerId` where set, or date-range containment via
 *  `epfEmployerForWagesMonth` as a fallback for legacy pre-`employerId` data — which itself refuses
 *  to guess when more than one employer's range covers the month) before reconciling contribution
 *  rows. A brand-new employer (not yet in `employers[]`) has no existing transactions that could
 *  belong to it, so it always gets an empty scope — everything is correctly `'new'`. */
export function reconcileUnit(unit: EpfImportUnit, holding: Holding): EpfReconciliationItem[] {
  const existingTxns = holding.assetMeta?.epfTransactions ?? [];
  if (unit.kind === 'balanceEvent') {
    const item = reconcileEpfBalanceEvent(unit.type, unit.fyStartYear, unit.amounts, existingTxns);
    return item ? [item] : [];
  }

  const employers = holding.assetMeta?.epfEmployers ?? [];
  const employerIdx = findEmployerIndex(employers, unit.memberId, unit.companyName);
  const unitEmployer = employerIdx >= 0 ? employers[employerIdx] : null;
  const employerScopedTxns = unitEmployer
    ? existingTxns.filter((t) => {
        if (t.type !== 'contribution' || !t.wagesMonth) return false;
        const owner = t.employerId
          ? employers.find((e) => e.id === t.employerId)
          : epfEmployerForWagesMonth(employers, t.wagesMonth);
        return owner?.id === unitEmployer.id;
      })
    : [];

  const contributionRows = unit.rows.filter((r) => (r.rowType ?? 'contribution') === 'contribution');
  const nonContributionRows = unit.rows.filter((r) => r.rowType === 'transfer_in' || r.rowType === 'withdrawal');

  const contribItems = reconcileEpfContributionRows(contributionRows, employerScopedTxns);

  const nonContribByType = new Map<
    'transfer_in' | 'withdrawal',
    { employeeAmount: number; employerAmount: number; pensionAmount: number; date: number; particulars: string[] }
  >();
  for (const row of nonContributionRows) {
    const type = row.rowType as 'transfer_in' | 'withdrawal';
    const group = nonContribByType.get(type) ?? {
      employeeAmount: 0,
      employerAmount: 0,
      pensionAmount: 0,
      date: row.date,
      particulars: []
    };
    group.employeeAmount += row.employeeAmount;
    group.employerAmount += row.employerAmount;
    group.pensionAmount += row.pensionAmount;
    group.date = Math.max(group.date, row.date); // most recent, if somehow more than one
    group.particulars.push(row.particulars);
    nonContribByType.set(type, group);
  }
  const nonContribItems: EpfReconciliationItem[] = [];
  for (const [type, group] of nonContribByType) {
    const item = reconcileEpfBalanceEvent(
      type,
      unit.fyStartYear,
      {
        employeeAmount: group.employeeAmount,
        employerAmount: group.employerAmount,
        pensionAmount: group.pensionAmount
      },
      existingTxns,
      group.date,
      group.particulars.join('; ')
    );
    if (item) nonContribItems.push(item);
  }

  const interestItem = unit.creditedInterest
    ? reconcileEpfBalanceEvent('interest', unit.fyStartYear, unit.creditedInterest, existingTxns)
    : null;

  return [...contribItems, ...nonContribItems, ...(interestItem ? [interestItem] : [])];
}

/** Applies a reviewed unit's decisions to the working holding — creates/updates the employer record (for
 *  an 'employer' unit) and writes every checked 'new' row plus every conflict resolved to 'imported'.
 *  'matches' and conflicts resolved to 'existing' are no-ops — the ledger already agrees. */
export function commitUnit(
  holding: Holding,
  unit: EpfImportUnit,
  items: EpfReconciliationItem[],
  selection: EpfUnitSelection,
  batchId: string
): Holding {
  let employers = [...(holding.assetMeta?.epfEmployers ?? [])];
  let transactions = [...(holding.assetMeta?.epfTransactions ?? [])];
  // Contribution rows only — a transfer_in/withdrawal row can share the same (meaningless, for those
  // types) `wagesMonth` value as a real contribution row, which would otherwise let it clobber the
  // correct row in this map and backfill the wrong epfWages/epsWages onto a contribution item.
  const rowsByMonth =
    unit.kind === 'employer'
      ? new Map(unit.rows.filter((r) => (r.rowType ?? 'contribution') === 'contribution').map((r) => [r.wagesMonth, r]))
      : null;

  // Resolved (or newly assigned) employer id for this unit — stamped onto every contribution
  // transaction written below, so a future import can unambiguously scope reconciliation to the
  // right employer even for a wagesMonth two employers legitimately share (a mid-month switch).
  let unitEmployerId: string | undefined;

  if (unit.kind === 'employer') {
    const idx = findEmployerIndex(employers, unit.memberId, unit.companyName);
    if (idx >= 0) {
      const existing = employers[idx];
      if (existing) {
        employers[idx] = mergeCheckpoints(extendEmployerCoverage(backfillEmployerIds(existing, unit), unit), unit);
        unitEmployerId = existing.id;
      }
    } else {
      const created = mergeCheckpoints(createEmployerFromUnit(unit, employers), unit);
      employers = [...employers, created];
      unitEmployerId = created.id;
    }
  }

  for (const item of items) {
    const key = itemKey(item);
    const row = rowsByMonth?.get(item.wagesMonth ?? '');
    if (item.kind === 'new') {
      if (!selection.checkedKeys.has(key)) continue;
      transactions = [...transactions, buildImportedTxn(item, row, batchId, unitEmployerId)];
    } else if (item.kind === 'conflict') {
      const choice = selection.conflictChoices.get(key) ?? 'imported';
      if (choice === 'imported' && item.existing) {
        const existingId = item.existing.id;
        transactions = transactions.map((t) =>
          t.id === existingId ? mergeImportedIntoExisting(t, item, row, batchId, unitEmployerId) : t
        );
      }
    }
    // 'matches' → no-op, the ledger already agrees.
  }

  return {
    ...holding,
    assetMeta: { ...holding.assetMeta, epfEmployers: employers, epfTransactions: transactions },
    updatedAt: Date.now()
  };
}

export function createEmptyEpfHolding(): Holding {
  const holding = buildBaseHolding({ assetClass: 'epf', name: 'EPF', investedAmount: 0, notes: '' }, null);
  holding.assetMeta = {};
  return holding;
}

// ─── Display helpers ────────────────────────────────────────────────────────

export function unitTitle(unit: EpfImportUnit): string {
  if (unit.kind === 'employer') return `${unit.companyName} · ${fyLabel(unit.fyStartYear)}`;
  return `${EPF_TX_LABELS[unit.type]} · ${fyLabel(unit.fyStartYear)}`;
}

export function describeFile(file: EpfImportFile): string {
  if (file.status === 'unreadable') return file.errorMessage ?? 'Could not read this file.';
  const employerUnits = file.units.filter((u): u is EpfImportEmployerUnit => u.kind === 'employer');
  const balanceUnits = file.units.filter((u) => u.kind === 'balanceEvent');
  const firstEmployerUnit = employerUnits[0];
  if (employerUnits.length === 1 && balanceUnits.length === 0 && firstEmployerUnit) {
    return `${fyLabel(firstEmployerUnit.fyStartYear)} · ${firstEmployerUnit.rows.length} row${firstEmployerUnit.rows.length === 1 ? '' : 's'}`;
  }
  const totalRows = employerUnits.reduce((sum, u) => sum + u.rows.length, 0);
  const parts: string[] = [];
  if (employerUnits.length > 0)
    parts.push(`${employerUnits.length} employer/FY group${employerUnits.length === 1 ? '' : 's'}`);
  if (balanceUnits.length > 0) parts.push(`${balanceUnits.length} other event${balanceUnits.length === 1 ? '' : 's'}`);
  parts.push(`${totalRows} row${totalRows === 1 ? '' : 's'} total`);
  return parts.join(' · ');
}
