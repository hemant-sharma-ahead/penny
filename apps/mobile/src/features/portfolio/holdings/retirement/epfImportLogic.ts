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
import {
  epfEmployerForWagesMonth,
  epfResolveTxnEmployer,
  epfDaysInMonth,
  epfGetSalaryForMonth,
  estimateProRataEdgeDate
} from '@/core/portfolio/epfCalculations';
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
  reconcileEpfBalanceEventAtDate,
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

/** 2026-08-30 fix — was `item.wagesMonth ?? item.type` alone, which silently collapsed multiple
 *  non-contribution items of the SAME type in one unit (e.g. two genuinely separate `transfer_in`
 *  events in one FY — see `reconcileEpfBalanceEventAtDate`'s own doc comment) onto the identical key,
 *  making them indistinguishable in the review screen's `checkedKeys`/`conflictChoices` tracking (one
 *  checkbox toggle would silently affect both). Appending the item's own date makes every item's key
 *  unique in practice — two genuinely distinct events landing on the exact same calendar day is the one
 *  case this can't distinguish, an acceptable, very rare edge case for real passbook data. */
export function itemKey(item: EpfReconciliationItem): string {
  return item.wagesMonth ?? `${item.type}-${item.date}`;
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
  // Default `fromDate` — always just an internal fallback, since `describeNewEmployerSetup` (below)
  // makes the caller ask the user to confirm the real joining date via `applyConfirmedJoinDate`
  // right after this employer is created. Kept as a strictly-better guess regardless (defence in
  // depth, matching this feature's other belt-and-braces fixes): the EARLIEST WAGE MONTH's 1st, not
  // the earliest transaction's own `date` (a contribution's `date` is its DEPOSIT date — EPFO
  // deposits ~15th of the month AFTER the wage month — so using it here was silently off by about a
  // month even before considering pro-rata).
  const contributionRows = unit.rows.filter((r) => (r.rowType ?? 'contribution') === 'contribution');
  const fyStartMs = new Date(unit.fyStartYear, 3, 1).getTime();
  const earliestWagesMonth = contributionRows.map((r) => r.wagesMonth).sort()[0];
  const fromDate = earliestWagesMonth ? new Date(`${earliestWagesMonth}-01T00:00:00`).getTime() : fyStartMs;
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

// ─── New-employer setup — always confirm the real joining date, and any switch (2026-08-11) ──

export interface EpfProRataInput {
  daysInMonth: number;
  actualAmount: number;
  fullAmount: number;
}

export interface EpfNewEmployerSetup {
  companyName: string;
  fyStartYear: number;
  /** "YYYY-MM" — the earliest real wage month found for the new employer; combine with
   *  `suggestedJoinDay` to build the actual epoch-ms date once the user confirms/edits it. */
  suggestedJoinMonth: string;
  suggestedJoinDay: number;
  /** Absent for a contribution-free first unit (nothing to invert pro-rata against). */
  joinProRata?: EpfProRataInput;
  /** Set only when an existing "current" (open-ended) employer's `fromDate` precedes this unit's
   *  own dates — the genuine switch-ambiguity case (root cause: `createEmployerFromUnit` only ever
   *  auto-bound the reverse ordering). `undefined` means this is either the very first employer ever
   *  tracked, or an unambiguous EARLIER job (already safely auto-bound, no confirmation needed). */
  priorEmployer?: {
    id: string;
    companyName: string;
    suggestedLastWorkingMonth: string;
    suggestedLastWorkingDay: number;
    leavingProRata?: EpfProRataInput;
  };
}

/** Detects whether committing `unit` is about to create a BRAND NEW employer — and if so, what to
 *  ask the user before doing it (docs/plans/epf-passbook-import.md's 2026-08-11 follow-up round:
 *  "always confirm a new employer's real joining date," never silently infer one from a deposit
 *  date). Returns `null` when the unit extends an EXISTING employer (matched via
 *  `findEmployerIndex`) — nothing new to ask; `extendEmployerCoverage` handles that path, with its
 *  own re-confirm trigger for a joining-date contradiction (see that function's doc comment).
 *
 *  Order-independence: this is evaluated fresh against whatever `holding` already contains at the
 *  moment THIS unit is about to commit — regardless of which employer/FY/file was imported first,
 *  in this session or any earlier one. The only two orderings that ever create ambiguity requiring a
 *  user answer are covered by `priorEmployer`; every other ordering (see the design doc's own
 *  worked-through list) either needs no new employer at all, or is already unambiguous and handled
 *  by `createEmployerFromUnit`'s existing "earlier job" auto-bind. */
export function describeNewEmployerSetup(unit: EpfImportEmployerUnit, holding: Holding): EpfNewEmployerSetup | null {
  const employers = holding.assetMeta?.epfEmployers ?? [];
  if (findEmployerIndex(employers, unit.memberId, unit.companyName) >= 0) return null;

  const contributionRows = unit.rows.filter((r) => (r.rowType ?? 'contribution') === 'contribution');
  if (contributionRows.length === 0) {
    // A contribution-free first unit (rare — e.g. only an interest/transfer row for a brand-new
    // employer) has nothing to invert pro-rata against; suggest the FY's own start as a plain
    // default rather than fabricating a pro-rata guess from nothing.
    return {
      companyName: unit.companyName,
      fyStartYear: unit.fyStartYear,
      suggestedJoinMonth: `${unit.fyStartYear}-04`,
      suggestedJoinDay: 1
    };
  }

  const sortedRows = [...contributionRows].sort((a, b) => a.wagesMonth.localeCompare(b.wagesMonth));
  const firstRow = sortedRows[0];
  if (!firstRow) return null; // unreachable — guarded by the length check above, keeps TS happy

  const fullAmount = Math.max(...contributionRows.map((r) => r.employeeAmount));
  const daysInMonth = epfDaysInMonth(firstRow.wagesMonth);
  const suggestedJoinDay = estimateProRataEdgeDate(daysInMonth, firstRow.employeeAmount, fullAmount, 'start');

  const setup: EpfNewEmployerSetup = {
    companyName: unit.companyName,
    fyStartYear: unit.fyStartYear,
    suggestedJoinMonth: firstRow.wagesMonth,
    suggestedJoinDay,
    joinProRata: { daysInMonth, actualAmount: firstRow.employeeAmount, fullAmount }
  };

  const newUnitStartMs = new Date(`${firstRow.wagesMonth}-01T00:00:00`).getTime();
  const currentEmp = employers.find((e) => !e.toDate);
  // No existing "current" employer, or it's unambiguously an EARLIER job (already safely auto-bound
  // by `createEmployerFromUnit` using ITS OWN confirmed/real fromDate — see that function) — no
  // switch to confirm.
  if (!currentEmp || currentEmp.fromDate > newUnitStartMs) return setup;

  // Genuine switch — invert pro-rata against the OLD employer's OWN established full-month rate
  // (real basicSalary/contribution history already exists for it, unlike the brand-new employer
  // above, which has none yet).
  const oldEmployerTxns = (holding.assetMeta?.epfTransactions ?? [])
    .filter((t) => t.type === 'contribution' && !!t.wagesMonth)
    .filter((t) => epfResolveTxnEmployer(t, employers)?.id === currentEmp.id);
  const lastTxn = [...oldEmployerTxns].sort((a, b) => (b.wagesMonth ?? '').localeCompare(a.wagesMonth ?? ''))[0];

  if (!lastTxn?.wagesMonth) {
    // No real contribution evidence at all for the old employer (unlikely — it's "current" precisely
    // because SOME import created it — but stay defensive) — suggest the day before the new
    // employer's own suggested join day as a plain fallback, no pro-rata to invert.
    const fallbackDaysInMonth = epfDaysInMonth(firstRow.wagesMonth);
    setup.priorEmployer = {
      id: currentEmp.id,
      companyName: currentEmp.companyName,
      suggestedLastWorkingMonth: firstRow.wagesMonth,
      // "Day before the new join day," unless that join day is itself the 1st (nothing to subtract
      // from within the same month) — falls back to that month's own last day instead.
      suggestedLastWorkingDay: suggestedJoinDay > 1 ? suggestedJoinDay - 1 : fallbackDaysInMonth
    };
    return setup;
  }

  const oldDaysInMonth = epfDaysInMonth(lastTxn.wagesMonth);
  const oldFullAmount = epfGetSalaryForMonth(currentEmp, lastTxn.wagesMonth) * (currentEmp.employeeContribPct / 100);
  const suggestedLastWorkingDay = estimateProRataEdgeDate(
    oldDaysInMonth,
    lastTxn.employeeAmount ?? 0,
    oldFullAmount,
    'end'
  );
  setup.priorEmployer = {
    id: currentEmp.id,
    companyName: currentEmp.companyName,
    suggestedLastWorkingMonth: lastTxn.wagesMonth,
    suggestedLastWorkingDay,
    leavingProRata: {
      daysInMonth: oldDaysInMonth,
      actualAmount: lastTxn.employeeAmount ?? 0,
      fullAmount: oldFullAmount
    }
  };
  return setup;
}

/** Patches the just-created new employer's `fromDate` to the user-confirmed real joining date and
 *  marks `joiningDateConfirmed: true` — called right after `commitUnit` creates it (rather than
 *  threading a confirmed date INTO `createEmployerFromUnit` itself), so `commitUnit`'s own
 *  create-vs-extend branching stays unchanged. Re-locates the employer via the same
 *  `findEmployerIndex` match `commitUnit` itself just used — a no-op (returns `holding` unchanged)
 *  if it can't be found, which shouldn't happen in the real flow but keeps this safely pure either
 *  way. */
export function applyConfirmedJoinDate(holding: Holding, unit: EpfImportEmployerUnit, joinDateMs: number): Holding {
  const employers = holding.assetMeta?.epfEmployers ?? [];
  const idx = findEmployerIndex(employers, unit.memberId, unit.companyName);
  if (idx < 0) return holding;
  const nextEmployers = [...employers];
  const target = nextEmployers[idx];
  if (!target) return holding;
  nextEmployers[idx] = { ...target, fromDate: joinDateMs, joiningDateConfirmed: true };
  return {
    ...holding,
    assetMeta: { ...holding.assetMeta, epfEmployers: nextEmployers },
    updatedAt: Date.now()
  };
}

/** Bounds the OLD employer's `toDate` to the user-confirmed last working day, applied BEFORE
 *  `commitUnit` runs for the unit that triggered the switch — so the new employer's own creation
 *  (`createEmployerFromUnit`) never has to special-case "is this a confirmed switch," it just sees a
 *  holding where the old employer is already correctly bounded. */
export function applyConfirmedSwitch(holding: Holding, oldEmployerId: string, lastWorkingDayMs: number): Holding {
  const employers = holding.assetMeta?.epfEmployers ?? [];
  const nextEmployers = employers.map((e) =>
    e.id === oldEmployerId ? { ...e, toDate: lastWorkingDayMs, currentEmploymentConfirmed: false } : e
  );
  return {
    ...holding,
    assetMeta: { ...holding.assetMeta, epfEmployers: nextEmployers },
    updatedAt: Date.now()
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
 *  contribution-free confirmed year is real, authoritative EPFO data, not a gap.
 *
 *  2026-08-11 addition — `fromDate` is only extended backward SILENTLY while `joiningDateConfirmed`
 *  isn't set yet (i.e. nothing has explicitly confirmed it — same as before this fix existed). Once
 *  a user HAS explicitly confirmed a real joining date (`applyConfirmedJoinDate`), a later import
 *  revealing an even-earlier real contribution never silently overrides it — the real transaction
 *  still exists in `epfTransactions[]` either way (never dropped), but `fromDate` stays put and
 *  `epfReviewFlags.ts`'s `checkJoiningDateContradiction` surfaces the disagreement instead, so the
 *  user can look at it and decide, rather than either side silently winning. */
function extendEmployerCoverage(emp: EpfEmployer, unit: EpfImportEmployerUnit): EpfEmployer {
  let result = emp;

  const confirmedFys = new Set(result.confirmedFys ?? []);
  confirmedFys.add(unit.fyStartYear);
  result = { ...result, confirmedFys: [...confirmedFys].sort((a, b) => a - b) };

  const contributionRows = unit.rows.filter((r) => (r.rowType ?? 'contribution') === 'contribution');
  const rowDates = contributionRows.map((r) => r.date);
  const earliestRowDate = rowDates.length > 0 ? Math.min(...rowDates) : null;
  const latestRowDate = rowDates.length > 0 ? Math.max(...rowDates) : null;

  if (earliestRowDate !== null && earliestRowDate < result.fromDate && !result.joiningDateConfirmed) {
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

/** Auto-attributes an IMPORTED `transfer_in` row back to whichever OLD employer it actually came
 *  from, straight from the passbook's own real data — no guessing. A transfer-in row's own
 *  particulars always carry the source's real "Old Member Id" (e.g. "TRANSFER IN - Old Member Id
 *  TNMAS0031309..."), which is the EXACT SAME value already stored as that old employer's own
 *  `memberId` (from when ITS passbook was first imported). Matching the imported row's particulars
 *  text against every known employer's `memberId` is therefore a real, deterministic identification,
 *  not a heuristic.
 *
 *  Real bug this fixes (2026-08-30): before this existed, `transferredFromEmployerId` was ONLY ever
 *  set by the manual "It was transferred" confirm flow (`useEpfPendingTransfer`) — a transfer-in row
 *  that came from a genuine PDF import (exactly the case this feature exists to handle) never got it,
 *  so `epfPendingTransferSuccessor` kept treating the source employer as still-pending forever, even
 *  once its real transfer had already been correctly imported and was sitting right there in the
 *  ledger. */
function resolveTransferSourceEmployerId(
  sourceParticulars: string,
  employers: EpfEmployer[],
  excludeEmployerId: string | undefined
): string | undefined {
  return employers.find((e) => e.id !== excludeEmployerId && e.memberId && sourceParticulars.includes(e.memberId))?.id;
}

function buildImportedTxn(
  item: EpfReconciliationItem,
  row: ParsedEpfPassbookRow | undefined,
  batchId: string,
  employerId: string | undefined,
  employers: EpfEmployer[]
): EpfTransaction {
  const base: EpfTransaction = {
    id: crypto.randomUUID(),
    type: item.type,
    date: item.date,
    sourceParticulars: item.sourceParticulars,
    sourceRef: batchId
  };
  if (item.wagesMonth) base.wagesMonth = item.wagesMonth;
  // Stamped on every import-created type now (2026-08-11) — not contribution-only. Originally only
  // contributions were scoped (the one type that could conflict across a mid-month switch), but a
  // per-employer ledger view needs EVERY transaction type attributed to its real employer, not just
  // contributions — `reconcileUnit` already knows exactly which employer's unit produced this row.
  if (employerId) base.employerId = employerId;
  if (item.type === 'transfer_in') {
    const sourceId = resolveTransferSourceEmployerId(item.sourceParticulars, employers, employerId);
    if (sourceId) base.transferredFromEmployerId = sourceId;
  }
  if (item.type === 'contribution') {
    base.employeeAmount = item.imported.employeeAmount;
    base.employerAmount = item.imported.employerAmount;
    base.pensionAmount = item.imported.pensionAmount;
    if (row?.epfWages) base.epfWages = row.epfWages;
    if (row?.epsWages) base.epsWages = row.epsWages;
  } else {
    // A passbook-imported interest/transfer-in/withdrawal/advance row carries a real employee/
    // employer split (same table columns a contribution row uses) — worth keeping rather than
    // collapsing into the single-`amount` shape a MANUALLY-typed entry of these types has always used
    // (see `epfReconciliation.ts`'s own `existingAmounts()` for that legacy, manual-entry-only
    // convention, unaffected by this).
    //
    // 2026-08-xx fix — withdrawal/advance used to fall into their own branch that discarded
    // `imported.employerAmount` entirely, storing only the employee-side portion as `amount`. Real
    // bug this fixes: the interest calculator's mid-year-withdrawal fix (`buildEpfInterestInput`)
    // reads a withdrawal's `employerAmount` to reduce the EMPLOYER interest stream — with it silently
    // dropped, the employer-side balance never actually shrank after a withdrawal, so employer
    // interest for that FY stayed wrong even after the withdrawal-timing fix landed.
    base.employeeAmount = item.imported.employeeAmount;
    base.employerAmount = item.imported.employerAmount;
    base.amount = item.imported.employeeAmount + item.imported.employerAmount;
  }
  return base;
}

function mergeImportedIntoExisting(
  existing: EpfTransaction,
  item: EpfReconciliationItem,
  row: ParsedEpfPassbookRow | undefined,
  batchId: string,
  employerId: string | undefined,
  employers: EpfEmployer[]
): EpfTransaction {
  const updated: EpfTransaction = { ...existing, sourceRef: batchId, sourceParticulars: item.sourceParticulars };
  // Backfill employerId onto a legacy match/conflict that predates this field (any type now, not
  // just contribution — see `buildImportedTxn`'s own 2026-08-11 doc comment) — same idea as
  // `backfillEmployerIds` for the employer record itself, never overwrites an already-set value.
  if (!updated.employerId && employerId) updated.employerId = employerId;
  // Same auto-attribution as `buildImportedTxn` — backfills a legacy/already-imported transfer_in
  // that predates this fix, never overwrites an already-set value.
  if (item.type === 'transfer_in' && !updated.transferredFromEmployerId) {
    const sourceId = resolveTransferSourceEmployerId(item.sourceParticulars, employers, employerId);
    if (sourceId) updated.transferredFromEmployerId = sourceId;
  }
  if (item.type === 'contribution') {
    updated.employeeAmount = item.imported.employeeAmount;
    updated.employerAmount = item.imported.employerAmount;
    updated.pensionAmount = item.imported.pensionAmount;
    if (row?.epfWages) updated.epfWages = row.epfWages;
    if (row?.epsWages) updated.epsWages = row.epsWages;
  } else {
    // Same 2026-08-xx fix as `buildImportedTxn` above — withdrawal/advance now preserve the real
    // employer-side amount too, not just employee.
    updated.employeeAmount = item.imported.employeeAmount;
    updated.employerAmount = item.imported.employerAmount;
    updated.amount = item.imported.employeeAmount + item.imported.employerAmount;
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
 *  rows are each reconciled INDIVIDUALLY at their own exact real date (`reconcileEpfBalanceEventAtDate`
 *  — see that function's own doc comment for why this replaced an earlier same-type/same-FY
 *  aggregation: a real passbook can and does contain several genuinely distinct transfer_in events in
 *  one FY — e.g. the actual principal transfer, followed months later by a separate "TRANSFER IN -
 *  INTEREST AMOUNT ONLY" catch-up credit — which the old aggregate approach silently collapsed into one
 *  combined item dated to whichever event happened to be latest, discarding the real earlier date the
 *  principal actually moved on).
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
 *  belong to it, so it always gets an empty scope — everything is correctly `'new'`.
 *
 *  2026-08-xx fix — the SAME employer-scoping now also applies to interest/transfer_in/withdrawal,
 *  which were still matched holding-wide (`(type, FY)` only, see `reconcileEpfBalanceEvent`'s own
 *  key). A genuine same-FY switch means BOTH employers can legitimately earn/receive interest (or a
 *  transfer) in the same financial year — Company A's balance keeps earning interest in FY2 even
 *  after leaving, right up until it's actually transferred out, while Company B independently earns
 *  its own interest on its own balance the same FY. Before this fix, importing Company B's FY2
 *  interest saw Company A's already-logged FY2 interest as the "existing" value for that FY and
 *  silently overwrote it (or forced an unnecessary conflict) — real reported bug, found via on-device
 *  testing. `epfResolveTxnEmployer` (packages/core) now resolves ANY transaction type, not just
 *  contributions, so this reuses the exact same resolution as `epfComputeAllMonths` itself. */
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
  // Same idea, for interest/transfer_in/withdrawal/advance — `epfResolveTxnEmployer` now resolves
  // ANY type (not contribution-only), so this is the identical scoping pattern, just widened.
  const employerScopedNonContribTxns = unitEmployer
    ? existingTxns.filter(
        (t) => t.type !== 'contribution' && epfResolveTxnEmployer(t, employers)?.id === unitEmployer.id
      )
    : [];

  const contributionRows = unit.rows.filter((r) => (r.rowType ?? 'contribution') === 'contribution');
  const nonContributionRows = unit.rows.filter((r) => r.rowType === 'transfer_in' || r.rowType === 'withdrawal');

  const contribItems = reconcileEpfContributionRows(contributionRows, employerScopedTxns);

  const nonContribItems: EpfReconciliationItem[] = nonContributionRows.map((row) =>
    reconcileEpfBalanceEventAtDate(
      row.rowType as 'transfer_in' | 'withdrawal',
      { employeeAmount: row.employeeAmount, employerAmount: row.employerAmount, pensionAmount: row.pensionAmount },
      row.date,
      row.particulars,
      employerScopedNonContribTxns
    )
  );

  const interestItem = unit.creditedInterest
    ? reconcileEpfBalanceEvent('interest', unit.fyStartYear, unit.creditedInterest, employerScopedNonContribTxns)
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
      transactions = [...transactions, buildImportedTxn(item, row, batchId, unitEmployerId, employers)];
    } else if (item.kind === 'conflict') {
      const choice = selection.conflictChoices.get(key) ?? 'imported';
      if (choice === 'imported' && item.existing) {
        const existingId = item.existing.id;
        transactions = transactions.map((t) =>
          t.id === existingId ? mergeImportedIntoExisting(t, item, row, batchId, unitEmployerId, employers) : t
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
