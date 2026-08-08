// PPF statement import — file picking, column-mapping-draft helpers, reconcile wrapper, and the
// commit-to-Holding logic. See docs/mockups/proposals/ppf-statement-import-v1.html and
// `epfImportLogic.ts` (the sibling EPF feature this mirrors structurally). Kept in its own
// components-free file, same reason as `epfImportLogic.ts`'s own doc comment: this repo's Fast
// Refresh lint rule requires a `.tsx` exporting a component to export nothing else.
//
// Unlike EPF's passbook import (one PDF = one employer+FY unit, a multi-unit sequential review
// queue), a PPF bank/post-office statement is ALWAYS one continuous ledger for one account — so
// there's no unit queue here, just: pick one file → confirm column mapping → review → (maybe)
// missing-details gate → commit. Single-file, not multi-select (mirrors the mockup's explicit
// "no multi-file/summary queue" scoping note).
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { Holding, PpfTransaction } from '@/core/db/types';
import { buildBaseHolding, applyPpfFields } from '@/core/portfolio/holdingMappers';
import { tokenizeCsv, detectDateFormat, DEFAULT_DATE_FORMAT } from '@/core/bank-import/csvParser';
import { parseXlsxToGrid, XlsxParseError } from '@/core/bank-import/xlsxParser';
import type { ColumnMapping } from '@/core/bank-import/types';
import {
  parsePpfStatementRows,
  guessPpfColumnMapping,
  extractPpfHeaders,
  findPpfTableHeaderRowIndex,
  type ParsedPpfStatementRow
} from '@/core/portfolio/ppfStatementParser';
import { reconcilePpfRows, type PpfReconciliationItem } from '@/core/portfolio/ppfReconciliation';
import type { PpfRateTable } from '@/core/portfolio/ppfInterestRates';

// ─── Pick + parse ───────────────────────────────────────────────────────────

export interface PickedPpfFile {
  fileName: string;
  grid: string[][];
  headers: string[];
}

export type PickPpfFileResult =
  ({ status: 'picked' } & PickedPpfFile) | { status: 'error'; message: string } | { status: 'canceled' };

/** Opens a single-file picker (CSV or `.xlsx`), tokenizes it into the same `string[][]` grid shape
 *  both formats produce (extension-based detection, mirroring `SetupStep.tsx`'s/`epfImportLogic.ts`'s
 *  own convention — some Android content-provider URIs report a generic mimeType regardless of the
 *  real file type, but the picked file's own name is always reliable). Never silently swallows a
 *  parse failure — surfaced as `{ status: 'error' }` for the flow to show, never retried/dropped. */
export async function pickAndParsePpfFile(): Promise<PickPpfFileResult> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
    type:
      Platform.OS === 'web'
        ? '*/*'
        : [
            'text/csv',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            '*/*'
          ],
    copyToCacheDirectory: true
  });
  if (result.canceled || !result.assets?.[0]) return { status: 'canceled' };

  const asset = result.assets[0];
  const isXlsx = /\.xlsx?$/i.test(asset.name);

  try {
    let grid: string[][];
    if (isXlsx) {
      const bytes =
        Platform.OS === 'web' && asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : await new File(asset.uri).bytes();
      grid = parseXlsxToGrid(bytes);
    } else {
      const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
      grid = tokenizeCsv(text);
    }
    // `extractPpfHeaders` (not a bare `extractHeaderRow(grid)`) — a real bank/post-office statement
    // export often carries several preamble rows first (account holder, PPF account number,
    // nominee, branch, statement period) before the actual transaction table begins; this skips
    // past them to find the real header row instead of misreading the preamble as columns.
    const headers = extractPpfHeaders(grid);
    if (headers.length === 0) return { status: 'error', message: 'Could not find a header row in this file.' };
    return { status: 'picked', fileName: asset.name, grid, headers };
  } catch (err) {
    const detail = err instanceof XlsxParseError ? err.message : 'Could not read this file.';
    return { status: 'error', message: detail };
  }
}

// ─── Column-mapping draft (inline mapping-review step — borrows the IDEA from bank-import's
// `SetupStep.tsx`, not the code, since that component is Expense-coupled) ───────────────────────

/** Plain-string mirror of `ColumnMapping` for a form draft — empty string means "not mapped", same
 *  convention `useBankImport.ts`'s own `mapping` state uses, so an empty `<SelectInput>` value maps
 *  cleanly onto its "— Not mapped —" option. */
export interface PpfMappingDraft {
  date: string;
  narration: string;
  debit: string;
  credit: string;
  balance: string;
  dateFormat: string;
}

/** Best-effort pre-fill from `guessPpfColumnMapping` — never trusted silently, the mapping step
 *  requires the user to review/confirm (and can edit) every field before parsing proceeds. */
export function guessInitialPpfMapping(headers: string[]): PpfMappingDraft {
  const guess = guessPpfColumnMapping(headers);
  return {
    date: guess.date ?? '',
    narration: guess.narration ?? '',
    debit: guess.debit ?? '',
    credit: guess.credit ?? '',
    balance: guess.balance ?? '',
    dateFormat: DEFAULT_DATE_FORMAT
  };
}

/** Re-detects the date format from the real column values once a date column is chosen — same
 *  smart-detection `useBankImport.ts` runs for bank statements, reused here via the same underlying
 *  `detectDateFormat`. `grid` is the FULL raw grid (preamble included, if any) — `headers` comes from
 *  `extractPpfHeaders(grid)`, so data rows start one past the DETECTED header row, not necessarily
 *  `grid[1]` (a preamble would otherwise make this slice off actual account-detail rows instead of
 *  the real transaction data). */
export function detectPpfDateFormat(
  grid: string[][],
  headers: string[],
  dateHeader: string
): { format: string; confident: boolean } {
  const idx = dateHeader ? headers.indexOf(dateHeader) : -1;
  if (idx < 0) return { format: DEFAULT_DATE_FORMAT, confident: false };
  const headerRowIndex = findPpfTableHeaderRowIndex(grid);
  const values = grid.slice(headerRowIndex + 1).map((row) => row[idx]);
  return detectDateFormat(values);
}

export function ppfMappingReady(draft: PpfMappingDraft): boolean {
  return !!draft.date && !!draft.narration && (!!draft.debit || !!draft.credit);
}

export function buildPpfColumnMapping(draft: PpfMappingDraft): ColumnMapping {
  return {
    date: draft.date,
    narration: draft.narration,
    ...(draft.debit && { debit: draft.debit }),
    ...(draft.credit && { credit: draft.credit }),
    ...(draft.balance && { balance: draft.balance }),
    ...(draft.dateFormat && { dateFormat: draft.dateFormat })
  };
}

// ─── Reconcile ──────────────────────────────────────────────────────────────

export interface PpfReconcileResult {
  rows: ParsedPpfStatementRow[];
  rejectedCount: number;
  items: PpfReconciliationItem[];
}

/** Thin wrapper: parses the confirmed mapping against the file's grid, then reconciles against
 *  whatever the target holding already has on record — `rateTable` (fetched by the caller via
 *  `getPpfRateTable()`) additionally populates each interest row's `calculatedInterest`. */
export function reconcilePpfImport(
  grid: string[][],
  mapping: ColumnMapping,
  holding: Holding | null,
  rateTable: PpfRateTable | null
): PpfReconcileResult {
  const { rows, rejected } = parsePpfStatementRows(grid, mapping);
  const existing = holding?.assetMeta?.ppfTransactions ?? [];
  const items = reconcilePpfRows(rows, existing, rateTable);
  return { rows, rejectedCount: rejected.length, items };
}

/** A stable per-render key for one reconciliation item — PPF rows have no natural id of their own
 *  (unlike EPF's wagesMonth), but `items` is derived deterministically from the same `rows` array
 *  every render, so its index is a safe, stable key for tracking checkbox/radio selection. */
export function itemKey(item: PpfReconciliationItem, index: number): string {
  return `${item.type}::${item.date}::${index}`;
}

// ─── Missing-details gate ───────────────────────────────────────────────────

export interface PpfMissingDetailsNeed {
  needsName: boolean;
  needsOpeningDate: boolean;
}

/** `ppfBank` is optional — never gated on. `name` only matters for a brand-new holding (an existing
 *  one always has one already). `ppfOpeningDate` is always required — it drives the maturity
 *  calculation — regardless of whether the holding is new or being extended. */
export function ppfMissingDetailsNeed(holding: Holding | null): PpfMissingDetailsNeed {
  return {
    needsName: holding === null,
    needsOpeningDate: holding?.assetMeta?.ppfOpeningDate == null
  };
}

/** A SUGGESTED opening date from the earliest imported row — never applied silently, only offered
 *  as a pre-filled, editable starting point in the missing-details gate form. */
export function suggestedPpfOpeningDate(rows: ParsedPpfStatementRow[]): number | null {
  if (rows.length === 0) return null;
  return Math.min(...rows.map((r) => r.date));
}

export interface PpfMissingDetailsInput {
  name: string;
  ppfOpeningDate: string; // YYYY-MM-DD, matching `DateInput`'s value contract
  ppfBank: string;
  ppfAnnual: string;
}

export interface PpfImportSelection {
  /** Keys of every 'new' item the user left checked (default: all checked). */
  checkedKeys: Set<string>;
  /** Per-conflict-item choice; a key not present here defaults to 'imported'. */
  conflictChoices: Map<string, 'imported' | 'existing'>;
}

/** Applies a reviewed import's decisions to (a new-or-existing) holding — creates the holding first
 *  if `holding` is `null`, applies any missing account-level fields, writes every checked 'new' item
 *  plus every conflict resolved to 'imported' into `ppfTransactions[]`, and recomputes
 *  `investedAmount` from the FULL resulting ledger (deposits/interest add, withdrawals subtract) —
 *  never left for the user to type, so the card and the transaction list can never disagree, the same
 *  "derive, don't ask" principle `applyEpfFields` already applies to EPF's own corpus. */
export function commitPpfImport(
  holding: Holding | null,
  items: PpfReconciliationItem[],
  selection: PpfImportSelection,
  missingDetails: PpfMissingDetailsInput | null,
  batchId: string
): Holding {
  let working =
    holding ??
    buildBaseHolding(
      { assetClass: 'ppf', name: missingDetails?.name.trim() || 'PPF', investedAmount: 0, notes: '' },
      null
    );

  if (missingDetails) {
    working = applyPpfFields(working, {
      ppfOpeningDate: missingDetails.ppfOpeningDate,
      ppfBank: missingDetails.ppfBank,
      ppfAnnual: missingDetails.ppfAnnual,
      ...(working.assetMeta && { existingMeta: working.assetMeta })
    });
  }

  let transactions: PpfTransaction[] = [...(working.assetMeta?.ppfTransactions ?? [])];

  items.forEach((item, index) => {
    const key = itemKey(item, index);
    if (item.kind === 'new') {
      if (!selection.checkedKeys.has(key)) return;
      transactions = [
        ...transactions,
        {
          id: crypto.randomUUID(),
          type: item.type,
          date: item.date,
          amount: item.imported,
          sourceParticulars: item.sourceParticulars,
          sourceRef: batchId
        }
      ];
    } else if (item.kind === 'conflict') {
      const choice = selection.conflictChoices.get(key) ?? 'imported';
      if (choice === 'imported' && item.existing) {
        const existingId = item.existing.id;
        transactions = transactions.map((t) =>
          t.id === existingId
            ? { ...t, amount: item.imported, sourceParticulars: item.sourceParticulars, sourceRef: batchId }
            : t
        );
      }
    }
    // 'matches' → no-op, the ledger already agrees.
  });

  const investedAmount = transactions.reduce(
    (sum, t) => (t.type === 'withdrawal' ? sum - t.amount : sum + t.amount),
    0
  );

  return {
    ...working,
    assetMeta: { ...working.assetMeta, ppfTransactions: transactions },
    investedAmount: Math.max(0, investedAmount),
    updatedAt: Date.now()
  };
}
