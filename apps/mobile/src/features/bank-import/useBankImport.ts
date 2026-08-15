import { useCallback, useMemo, useState } from 'react';
import type { Account, Expense, ImportBatchSummary, Person, TransactionType } from '@/core/db/types';
import type { AccountInput } from '~/hooks/useAccountForm';
import {
  accountsRepo,
  expensesRepo,
  expenseCategoriesRepo,
  hashtagsRepo,
  bankStatementImportsRepo,
  bankNarrationOverridesRepo,
  paymentModesRepo,
  personsRepo,
  ledgerEntriesRepo
} from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { logActivityAwaited } from '@/core/db/activityLog';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { notifyBankImportsChanged } from '@/hooks/useDataRefresh';
import { RECONCILIATION_DESCRIPTION } from '@/core/expenses/cashFlowSummary';
import {
  BANK_PRESETS,
  CUSTOM_PRESET_ID,
  EMPTY_CUSTOM_MAPPING,
  getBankPreset,
  resolveMappingAgainstHeaders
} from '@/core/bank-import/presets';
import {
  tokenizeCsv,
  extractHeaderRow,
  parseStatementRows,
  detectDateFormat,
  DEFAULT_DATE_FORMAT
} from '@/core/bank-import/csvParser';
import { parseXlsxToGrid, XlsxParseError } from '@/core/bank-import/xlsxParser';
import type { BankPresetId, ColumnMapping, ParsedStatementRow, StatementParseResult } from '@/core/bank-import/types';
import { normalizeNarration } from '@/core/bank-import/normalization';
import {
  matchStatementRows,
  deriveLoneWolves,
  suggestPossibleTransfer,
  suggestAmbiguousTransferCandidates,
  convertCandidateToTransfer,
  type MatchResult,
  type PossibleTransferSuggestion
} from '@/core/bank-import/matcher';
import { groupUnmatchedByMerchant } from '@/core/bank-import/grouping';
import { attachCheckpoint, reconcileMatchedExpense } from '@/core/bank-import/checkpoint';
import {
  computeDaySequence,
  countOtherUnexplainedByDay,
  groupResolutionsByDay,
  type DayResolution
} from '@/core/bank-import/reconciledSeq';
import { countSkippedRows, detectCoverageGap } from '@/core/bank-import/coverage';
import {
  backDerivedOpeningBalance,
  computeAnchorShiftCheck,
  currentAnchorDate,
  deriveOpeningBalanceSuggestion,
  isAnchorShiftImport,
  isFirstEverImport,
  rowsAsCandidateTxns,
  type AnchorShiftCheck
} from '@/core/bank-import/openingBalanceAnchor';
import { inferPaymentMode } from '@/core/expenses/paymentModeInference';
import {
  applyCashTransferConversion,
  suggestCashTransfer,
  suggestRetroactiveCashTransfer,
  type CashTransferSuggestion
} from '@/core/bank-import/cashWithdrawalCodes';
import { usePaymentModes } from '~/hooks/usePaymentModes';
import { useBankCashWithdrawalCodes } from '~/hooks/useBankCashWithdrawalCodes';
import type { BankImportStep, MatchedItem, PendingOpeningBalanceUpdate, PossibleItem, StagedNewTxn } from './types';

/**
 * Bank Statement Import (docs/plans/bank-statement-import.md) — a single hook owning the whole
 * step-driven wizard, mirroring `features/import/useImport.ts`'s overall shape (one hook, a thin
 * page component switching on `step`, dumb per-step components) but a genuinely SEPARATE module —
 * per the plan's §4, this must never share code or import from `features/import/` (bank formats and
 * other-apps' export formats evolve independently; a bug in one must never regress the other). Every
 * piece of actual parsing/matching/normalization/merchant-memory/balance-check logic lives in
 * `packages/core/src/core/bank-import/` (already built, read-only from here) — this hook is purely
 * the UI-facing state machine + staging model on top of it.
 *
 * Commit model (§10b): nothing is written to the real vault until `commitAndImport()` — every
 * resolution during review (a confirmed/reassigned match, a bulk-categorized group, an individually
 * recorded new transaction, a lone-wolf delete) only mutates this hook's own in-memory staged state.
 */
export function useBankImport(accountId: string) {
  const [step, setStep] = useState<BankImportStep>('setup');

  // ── Data (loaded once, read fresh at commit time where it matters) ──────────────────────────────
  const { items: accounts } = useRepository(accountsRepo);
  const { items: allExpenses } = useRepository(expensesRepo);
  const { items: categories } = useRepository(expenseCategoriesRepo);
  const { items: hashtags } = useRepository(hashtagsRepo);
  const { items: importRecords } = useRepository(bankStatementImportsRepo);
  const { items: overrides } = useRepository(bankNarrationOverridesRepo);
  const { modes: allPaymentModes } = usePaymentModes();
  const { items: iouPersons } = useRepository(personsRepo);
  // Seeded here (not just in the settings screen) so the researched defaults exist the first time
  // *any* import happens, even if the user never visits Settings → Cash-withdrawal codes first.
  const { codes: cashWithdrawalCodes } = useBankCashWithdrawalCodes();

  const account = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);
  const expensesById = useMemo(() => new Map(allExpenses.map((e) => [e.id, e])), [allExpenses]);
  const cashAccounts = useMemo(() => accounts.filter((a) => a.type === 'cash'), [accounts]);
  // Feeds `CategoryPickerModal`'s "Frequent" quick-pick row (its own `txnCountByCategory` prop,
  // independent of `manager` — bulk-categorize never passes a full `CategoryManager`) — same shape
  // `useExpenses.ts`'s `categoryManager.txnCountByCategory` builds for the normal Expenses flow.
  const txnCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of allExpenses) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
    return counts;
  }, [allExpenses]);

  // ── Step 'bank' ───────────────────────────────────────────────────────────────────────────────
  const [presetId, setPresetId] = useState<BankPresetId | null>(null);
  const preset = useMemo(() => {
    if (presetId === null) return null;
    return presetId === CUSTOM_PRESET_ID ? EMPTY_CUSTOM_MAPPING : (getBankPreset(presetId) ?? EMPTY_CUSTOM_MAPPING);
  }, [presetId]);

  /** Auto cash-withdrawal detection (2026-08-05) — narration codes like ATW/NWD/SELF suggest a
   *  statement row is actually a transfer to the user's cash account, not a plain expense. Bank
   *  context comes from `presetId` (falls back to `'any'` before a bank is even chosen, so only the
   *  bank-agnostic codes apply yet). Both review buckets (`PossibleBucket`/`UnmatchedBucket`) call
   *  this instead of duplicating the lookup. */
  const suggestCashTransferFor = useCallback(
    (rawNarration: string): CashTransferSuggestion | null =>
      suggestCashTransfer(rawNarration, presetId ?? 'any', cashWithdrawalCodes, cashAccounts),
    [presetId, cashWithdrawalCodes, cashAccounts]
  );

  /** Retroactive sibling to `suggestCashTransferFor` above (docs/plans/bank-balance-sync.md §3
   *  decision #2, §17 Finding 1, §7 Stage 7) — for a Bucket 1 (Matched) pair whose statement row
   *  carries a cash-withdrawal code but resolved against an already-existing plain expense, rather
   *  than a brand-new row. `MatchedBucket.tsx` is the only caller. Returns `null` (no chip shown) when
   *  there's no cash account to convert into at all — a bare "convert to transfer" affordance with
   *  nowhere to point `toAccountId` at isn't actionable from this lightweight inline chip (unlike the
   *  full `ExpenseForm` new-row flow, which can fall through to its own general account picker). */
  const suggestRetroactiveCashTransferFor = useCallback(
    (pair: MatchedItem): CashTransferSuggestion | null => {
      if (cashAccounts.length === 0) return null;
      return suggestRetroactiveCashTransfer(
        pair.expense,
        pair.statementRow.rawNarration,
        presetId ?? 'any',
        cashWithdrawalCodes,
        cashAccounts
      );
    },
    [presetId, cashWithdrawalCodes, cashAccounts]
  );

  /** Cross-account "possible internal transfer" suggestion (2026-08-05) — a softer, amount/date-only
   *  signal than `suggestCashTransferFor` above (no narration code involved): flags a statement row
   *  that might be the other leg of a transfer already recorded, unlinked, on a different account. See
   *  `suggestPossibleTransfer`'s own doc comment for why this only ever returns a single confident
   *  candidate or nothing — never a guess among ties. */
  const suggestPossibleTransferFor = useCallback(
    (row: ParsedStatementRow): PossibleTransferSuggestion | null =>
      suggestPossibleTransfer(row, accountId, allExpenses, accounts, RECONCILIATION_DESCRIPTION),
    [accountId, allExpenses, accounts]
  );

  /** Sibling to `suggestPossibleTransferFor` above (docs/plans/bank-balance-sync.md §13, §7 Stage 6) —
   *  returns the full tied candidate set when the cross-account heuristic finds a genuine ambiguity
   *  (2+ equally-plausible candidates), so the UI can surface an explicit choice instead of silently
   *  dropping it (which is what `suggestPossibleTransferFor` alone does today — it returns `null` for
   *  both "no candidate" and "too many candidates to guess among"). `null` here means "not ambiguous"
   *  (0 or 1 candidate) — never means "surface nothing to the user." */
  const suggestAmbiguousTransferCandidatesFor = useCallback(
    (row: ParsedStatementRow): PossibleTransferSuggestion[] | null =>
      suggestAmbiguousTransferCandidates(row, accountId, allExpenses, accounts, RECONCILIATION_DESCRIPTION),
    [accountId, allExpenses, accounts]
  );

  // ── Step 'upload' ─────────────────────────────────────────────────────────────────────────────
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [delimiter, setDelimiter] = useState(',');
  const [parseError, setParseError] = useState('');
  // Excel support (2026-08-05, issue #4) — `null` while the current file is CSV (or nothing's been
  // uploaded yet), an already-parsed grid once an .xlsx file has been read. `tokenizedRows` below
  // picks whichever source actually produced the current file, so every downstream consumer
  // (`headers`, `mappingPreview`, `confirmMapping`, `detectedDateFormat`) stays format-agnostic — an
  // Excel file behaves exactly like a CSV from that point on. There is no delimiter concept for a
  // workbook already parsed into cells (`isXlsxSource` lets `MappingEditModal` hide that picker).
  const [xlsxRows, setXlsxRows] = useState<string[][] | null>(null);
  const isXlsxSource = xlsxRows !== null;

  // Draft column mapping — every field a plain string, '' meaning "not mapped yet" (unlike core's
  // `ColumnMapping`, whose `date`/`narration` are required non-empty strings — this looser shape is
  // what the still-being-edited confirmation screen needs before a final mapping is confirmed).
  const [mapping, setMapping] = useState({ date: '', narration: '', debit: '', credit: '', balance: '' });

  // Date format (2026-08-05, reworked same day from a narrower day-first/month-first toggle after
  // direct user feedback — see `csvParser.ts`'s `parseStatementDate` doc comment) — `null` means
  // "follow the smart-detected/preset value," set once the user explicitly edits the format field in
  // `MappingEditModal`. Reset on a new preset/file so a manual override from a previous unrelated
  // upload never silently carries over.
  const [dateFormatOverride, setDateFormatOverride] = useState<string | null>(null);

  // Opening-balance / anchor-shift flow (docs/plans/bank-balance-sync.md §3 decision #10/§10a/§14, §7
  // Stage 3) — `openingBalanceOverrideText` is the user's own typed value, only ever needed when no
  // suggestion could be derived from the statement's own first row (no mapped Balance column, or that
  // row had no value under it); `''` means "nothing typed, fall back to the derived suggestion if any"
  // (mirrors `dateFormatOverride`'s own null-means-"use the detected value" convention just above).
  // Reset on a new upload, same reasoning. `pendingOpeningBalanceUpdate` stages whichever
  // `Account.openingBalance`/`openingBalanceAsOfDate`/`anchorReference` write the user's choice on
  // this screen implies — nothing is written to the real vault until `commitAndImport()` (§10b's commit
  // model, unchanged by this addition), so this is staged state exactly like `matchedPairs`/
  // `stagedNewTxns` already are.
  const [openingBalanceOverrideText, setOpeningBalanceOverrideText] = useState('');
  const [pendingOpeningBalanceUpdate, setPendingOpeningBalanceUpdate] = useState<PendingOpeningBalanceUpdate | null>(
    null
  );

  // Bank, upload, and column-mapping review all live on the single 'setup' screen (merged
  // 2026-08-03, per explicit user feedback — no step change on selecting a preset). Declared after
  // `dateFormatOverride`'s own `useState` (not up near `presetId`/`preset` above) — it closes over
  // `setDateFormatOverride`, which didn't exist yet at that point in the file.
  const selectPreset = useCallback((id: BankPresetId) => {
    setPresetId(id);
    setDateFormatOverride(null);
  }, []);

  const tokenizedRows = useMemo(
    () => xlsxRows ?? (rawText ? tokenizeCsv(rawText, delimiter) : []),
    [xlsxRows, rawText, delimiter]
  );
  const headers = useMemo(() => extractHeaderRow(tokenizedRows), [tokenizedRows]);

  /** Confident whenever a known bank preset is active (every one declares its own `dateFormat`) —
   *  otherwise guessed from the actual chosen date column's real values via `detectDateFormat()`,
   *  which is only confident if the file itself contains unambiguous evidence for exactly one
   *  candidate shape. */
  const detectedDateFormat = useMemo((): { format: string; confident: boolean } => {
    if (preset && presetId !== CUSTOM_PRESET_ID) return { format: preset.dateFormat, confident: true };
    if (!mapping.date) return { format: DEFAULT_DATE_FORMAT, confident: false };
    const dateColIdx = headers.indexOf(mapping.date);
    if (dateColIdx < 0) return { format: DEFAULT_DATE_FORMAT, confident: false };
    const rawDates = tokenizedRows.slice(1).map((r) => r[dateColIdx]);
    return detectDateFormat(rawDates);
  }, [preset, presetId, mapping.date, headers, tokenizedRows]);

  const dateFormat = dateFormatOverride ?? detectedDateFormat.format;
  const dateFormatConfident = dateFormatOverride !== null || detectedDateFormat.confident;
  const setDateFormat = useCallback((format: string) => setDateFormatOverride(format), []);

  /** Shared by both file formats once a tokenized `string[][]` grid exists (from `tokenizeCsv()` or
   *  `parseXlsxToGrid()`) — resolves the header row against the active preset's own column names, or
   *  leaves every field unmapped for Custom. Stays on 'setup' — the mapping review renders inline on
   *  the same screen once headers exist. */
  const applyTokenizedRows = useCallback(
    (tokenized: string[][], name: string, emptyMessage: string) => {
      setParseError('');
      setFileName(name);
      setDateFormatOverride(null);
      // Opening-balance / anchor-shift flow (docs/plans/bank-balance-sync.md §7 Stage 3) — a manual
      // override typed against a previous file must never silently carry over to a new upload, same
      // reasoning as `dateFormatOverride`'s own reset just above.
      setOpeningBalanceOverrideText('');
      setPendingOpeningBalanceUpdate(null);
      const hdrs = extractHeaderRow(tokenized);
      if (hdrs.length === 0) {
        setParseError(emptyMessage);
        return;
      }
      if (preset && presetId !== CUSTOM_PRESET_ID) {
        const resolved = resolveMappingAgainstHeaders(preset, hdrs);
        setMapping({
          date: resolved.date ?? '',
          narration: resolved.narration ?? '',
          debit: resolved.debit ?? '',
          credit: resolved.credit ?? '',
          balance: resolved.balance ?? ''
        });
      } else {
        // Custom preset: no fuzzy auto-detection, per the plan's explicit instruction — every field
        // starts unmapped and the user maps all of them by hand.
        setMapping({ date: '', narration: '', debit: '', credit: '', balance: '' });
      }
    },
    [preset, presetId]
  );

  const importFromText = useCallback(
    (text: string, name: string) => {
      setXlsxRows(null);
      setRawText(text);
      const delim = preset?.delimiter ?? ',';
      setDelimiter(delim);
      const tokenized = tokenizeCsv(text, delim);
      applyTokenizedRows(tokenized, name, 'Could not read this file. Make sure it is a valid CSV with a header row.');
    },
    [preset, applyTokenizedRows]
  );

  /** Excel support (2026-08-05, issue #4) — `bytes` are the raw file contents (never a path/base64
   *  string, keeping this hook's own I/O-free shape); parsing itself is `parseXlsxToGrid()`'s job
   *  (`core/bank-import/xlsxParser.ts`). A parse failure (corrupted/unrecognized file) surfaces the
   *  same `parseError` banner the CSV path uses, rather than a separate error UI — including a
   *  password-protected file, which now throws a specifically-worded `XlsxPasswordRequiredError`
   *  (2026-08-08) surfaced through this same banner rather than a generic message. */
  const importFromXlsx = useCallback(
    (bytes: Uint8Array, name: string) => {
      setRawText('');
      let tokenized: string[][];
      try {
        tokenized = parseXlsxToGrid(bytes);
      } catch (err) {
        setFileName(name);
        setXlsxRows([]);
        setParseError(err instanceof XlsxParseError ? err.message : 'Could not read this Excel file.');
        return;
      }
      setXlsxRows(tokenized);
      applyTokenizedRows(tokenized, name, 'Could not read this Excel file. Make sure it has a header row.');
    },
    [applyTokenizedRows]
  );

  // ── Step 'mapping' ────────────────────────────────────────────────────────────────────────────
  const setMappingField = useCallback((field: keyof typeof mapping, value: string) => {
    setMapping((prev) => ({ ...prev, [field]: value }));
  }, []);

  const mappingReady = !!mapping.date && !!mapping.narration && (!!mapping.debit || !!mapping.credit);

  /** Live preview (row count + date range) as the user adjusts the mapping — best-effort, not the
   *  real parse (that only happens once, on `confirmMapping()`). */
  const mappingPreview = useMemo<StatementParseResult | null>(() => {
    if (!mappingReady) return null;
    const cm: ColumnMapping = {
      date: mapping.date,
      narration: mapping.narration,
      ...(mapping.debit && { debit: mapping.debit }),
      ...(mapping.credit && { credit: mapping.credit }),
      ...(mapping.balance && { balance: mapping.balance }),
      dateFormat
    };
    return parseStatementRows(tokenizedRows, headers, cm);
  }, [mappingReady, mapping, tokenizedRows, headers, dateFormat]);

  const [confirmedMapping, setConfirmedMapping] = useState<ColumnMapping | null>(null);
  const [parseResult, setParseResult] = useState<StatementParseResult | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  // ── Step 'review' — staged state ─────────────────────────────────────────────────────────────
  const [matchedPairs, setMatchedPairs] = useState<MatchedItem[]>([]);
  const [possibleItems, setPossibleItems] = useState<PossibleItem[]>([]);
  const [unmatchedRows, setUnmatchedRows] = useState<ParsedStatementRow[]>([]);
  const [stagedNewTxns, setStagedNewTxns] = useState<StagedNewTxn[]>([]);
  const [loneWolfDeletions, setLoneWolfDeletions] = useState<Set<string>>(new Set());

  const confirmMapping = useCallback(() => {
    if (!mappingReady) return;
    const cm: ColumnMapping = {
      date: mapping.date,
      narration: mapping.narration,
      ...(mapping.debit && { debit: mapping.debit }),
      ...(mapping.credit && { credit: mapping.credit }),
      ...(mapping.balance && { balance: mapping.balance }),
      dateFormat
    };
    setConfirmedMapping(cm);
    const result = parseStatementRows(tokenizedRows, headers, cm);
    setParseResult(result);
    // Two-tier matching (docs/plans/bank-balance-sync.md §5/§17) — `importRecords`/`overrides` feed
    // Tier 1's exact-provenance lookup; Tier 2's checkpoint exclusion reads `Expense.statementBalance`
    // directly off `allExpenses`, no extra argument needed for that half. `account?.coveredStatementRanges`
    // (Stage 2, §12) feeds deferred lone-wolf escalation — every OTHER already-completed import batch
    // for this account, which by construction never yet includes the one being parsed right now.
    const mr = matchStatementRows(
      result.rows,
      accountId,
      allExpenses,
      RECONCILIATION_DESCRIPTION,
      importRecords,
      overrides,
      account?.coveredStatementRanges ?? []
    );
    setMatchResult(mr);
    setMatchedPairs(mr.matched.map((p) => ({ statementRow: p.statementRow, expense: p.expense })));
    setPossibleItems(mr.possible.map((p) => ({ statementRow: p.statementRow, candidates: p.candidates })));
    setUnmatchedRows(mr.unmatched);
    setStagedNewTxns([]);
    setLoneWolfDeletions(new Set());
    setStep('review');
  }, [
    mappingReady,
    mapping,
    tokenizedRows,
    headers,
    accountId,
    allExpenses,
    dateFormat,
    importRecords,
    overrides,
    account
  ]);

  /** Gap-detection warning (docs/plans/bank-balance-sync.md §5/§11b, plan §7 Stage 2) — compares this
   *  not-yet-confirmed mapping's own live preview date range against the account's existing covered
   *  ranges. Lives on `mappingPreview` (not `parseResult`) so it's visible on `SetupStep` itself, before
   *  the user even taps "Continue to review" — advisory only, never blocks. */
  const coverageGap = useMemo(() => {
    if (!mappingPreview || mappingPreview.rows.length === 0) return null;
    const dates = mappingPreview.rows.map((r) => r.date);
    const range = { start: Math.min(...dates), end: Math.max(...dates) };
    return detectCoverageGap(range, account?.coveredStatementRanges ?? []);
  }, [mappingPreview, account]);

  /** Expense-first nudge (advisory only) — checks whether this statement's own date range has
   *  little/no existing expense coverage for THIS account (either side — `accountId` or `toAccountId`,
   *  same "touches this account" convention `anchorShiftCheck`'s own `existingInWindow` filter uses
   *  below), so we can recommend logging expenses for the period before importing the statement for it.
   *  Gated on the statement's own account only, never a global check. Lives on `mappingPreview` so it's
   *  visible on `SetupStep` before "Continue to review", same timing as `coverageGap` above. */
  const expenseCoverageWarning = useMemo(() => {
    if (!mappingPreview || mappingPreview.rows.length === 0) return null;
    const dates = mappingPreview.rows.map((r) => r.date);
    const rangeStart = Math.min(...dates);
    const rangeEnd = Math.max(...dates);
    const existingCount = allExpenses.filter(
      (e) => (e.accountId === accountId || e.toAccountId === accountId) && e.date >= rangeStart && e.date <= rangeEnd
    ).length;
    const statementCount = mappingPreview.rows.length;
    const lowCoverage = existingCount === 0 || existingCount < statementCount * 0.15;
    return lowCoverage ? { statementCount, existingCount, rangeStart, rangeEnd } : null;
  }, [mappingPreview, allExpenses, accountId]);

  // ── Opening-balance confirm / anchor-shift (docs/plans/bank-balance-sync.md §3 decision #10/§10a/
  // §14, §7 Stage 3) ────────────────────────────────────────────────────────────────────────────────
  // Scoped to `bank` accounts only (§3 decision 1/§16 Finding 2 — same gate Stage 1's checkpoint
  // attachment already uses), and only once this file's own live preview has at least one row —
  // mirrors `coverageGap`'s own "visible on SetupStep before 'Continue to review'" timing.
  const openingBalanceTrigger = useMemo((): 'first-import' | 'anchor-shift' | null => {
    if (!account || account.type !== 'bank' || !mappingPreview || mappingPreview.rows.length === 0) return null;
    if (isFirstEverImport(account.coveredStatementRanges)) return 'first-import';
    const newRangeStart = Math.min(...mappingPreview.rows.map((r) => r.date));
    return isAnchorShiftImport(newRangeStart, account) ? 'anchor-shift' : null;
  }, [account, mappingPreview]);

  /** A suggestion to prefill the confirm prompt, derived from this file's own chronologically-first
   *  row — `undefined` when no Balance column was mapped (or that row had no value under it), the
   *  mockup's "nothing parseable" manual-entry state. Never auto-applied — see
   *  `openingBalanceAnchor.ts`'s own doc comment. */
  const openingBalanceSuggestion = useMemo(() => {
    if (!openingBalanceTrigger || !mappingPreview) return undefined;
    return deriveOpeningBalanceSuggestion(mappingPreview.rows);
  }, [openingBalanceTrigger, mappingPreview]);

  const overrideNum = openingBalanceOverrideText.trim() === '' ? null : Number(openingBalanceOverrideText);
  /** The value that will actually be used if the user proceeds — the typed override if there is a
   *  valid one, otherwise the derived suggestion, otherwise nothing yet (gates "Continue to review"
   *  for the first-import manual-entry state, and gates whether an anchor-shift check can run at all). */
  const effectiveOpeningBalance =
    overrideNum !== null && !Number.isNaN(overrideNum)
      ? overrideNum
      : (openingBalanceSuggestion?.suggestedOpeningBalance ?? null);
  const effectiveAsOfDate =
    openingBalanceSuggestion?.asOfDate ??
    (mappingPreview && mappingPreview.rows.length > 0 ? Math.min(...mappingPreview.rows.map((r) => r.date)) : null);

  /** §14a/§14b's disagreement check — only computable once `effectiveOpeningBalance` exists (a
   *  suggestion, or a manually-typed value when the earlier statement had no Balance column at all).
   *  `null` while that's still missing, which is exactly when the UI should show a bare manual-entry
   *  field with no outcome below it yet — a case the v2 mockup's §6 frames don't depict (both of its
   *  worked examples assume a derivable suggestion) but a straightforward, documented extension of the
   *  same pattern. */
  const anchorShiftCheck = useMemo((): AnchorShiftCheck | null => {
    if (openingBalanceTrigger !== 'anchor-shift' || !account || !mappingPreview) return null;
    if (effectiveOpeningBalance === null || effectiveAsOfDate === null) return null;
    const oldAnchorDate = currentAnchorDate(account);
    if (oldAnchorDate === undefined) return null; // unreachable given the trigger's own gating, kept total
    // Window is [newAnchorDate, oldAnchorDate) — new-anchor-date inclusive, old-anchor-date exclusive,
    // see `openingBalanceAnchor.ts`'s own doc comment for why. Combines whatever Penny already had
    // recorded for the account in that window with THIS file's own not-yet-staged rows (the newly
    // backfilled statement's real contribution) — see `computeAnchorShiftCheck`'s doc comment for the
    // documented Stage 3 simplification this implies (no de-dup against a future match, left for Stage
    // 4's full engine).
    const existingInWindow = allExpenses.filter(
      (e) =>
        (e.accountId === accountId || e.toAccountId === accountId) &&
        e.date >= effectiveAsOfDate &&
        e.date < oldAnchorDate
    );
    const rowsInWindow = mappingPreview.rows.filter((r) => r.date >= effectiveAsOfDate && r.date < oldAnchorDate);
    return computeAnchorShiftCheck(
      accountId,
      effectiveOpeningBalance,
      effectiveAsOfDate,
      account.openingBalance,
      oldAnchorDate,
      [...existingInWindow, ...rowsAsCandidateTxns(rowsInWindow, accountId)]
    );
  }, [
    openingBalanceTrigger,
    account,
    mappingPreview,
    effectiveOpeningBalance,
    effectiveAsOfDate,
    allExpenses,
    accountId
  ]);

  /** First-ever-import confirm, or an §14a clean anchor-shift's own single "Continue to review" —
   *  stages the anchor move and proceeds into the normal mapping-confirm flow. */
  const confirmOpeningBalanceAndProceed = useCallback(() => {
    if (effectiveOpeningBalance === null || effectiveAsOfDate === null) return;
    setPendingOpeningBalanceUpdate({
      openingBalance: effectiveOpeningBalance,
      openingBalanceAsOfDate: effectiveAsOfDate
    });
    confirmMapping();
  }, [effectiveOpeningBalance, effectiveAsOfDate, confirmMapping]);

  /** §14b's "Accept — shift everything by ₹X" choice — trusts the newly-backfilled statement over the
   *  original, never-independently-verified anchor guess. Deliberately does NOT call `confirmMapping()`
   *  itself (unlike the other two §14b choices below) — the mockup shows this specific choice landing
   *  on its own confirmation frame ("Opening balance updated to ₹52,000 ... Continue to review") before
   *  actually proceeding, so the UI calls `confirmMapping()` separately once that frame's own button is
   *  tapped, using `pendingOpeningBalanceUpdate` (returned below) to know whether to render it. */
  const acceptAnchorShift = useCallback(() => {
    if (!anchorShiftCheck) return;
    setPendingOpeningBalanceUpdate({
      openingBalance: anchorShiftCheck.newOpeningBalance,
      openingBalanceAsOfDate: anchorShiftCheck.newAnchorDate
    });
  }, [anchorShiftCheck]);

  /** §14b's "Keep the original ₹X, flag for later" choice — the anchor DATE still always moves to the
   *  new, earlier date (found + fixed 2026-08-09: leaving it pinned at the OLD date here, while
   *  committing transactions dated before it, silently let `computeBalance()` double-count the entire
   *  backfilled period on top of the kept opening balance) — only the anchor VALUE stays with what the
   *  OLD, still-trusted anchor implies, via `backDerivedOpeningBalance()` (pure algebra on
   *  `anchorShiftCheck`, reproducing the OLD anchor's own value exactly when projected forward). Never
   *  auto-resolved; persists the disagreement as `Account.anchorReference` — an immutable historical
   *  fact only, re-compared against LIVE data every time verification status is computed
   *  (`accountVerification.ts`'s `recomputeAnchorAgreement`), not a frozen snapshot — so a later
   *  corrective import that actually fixes the ledger makes the finding disappear on its own. */
  const flagAnchorDisagreement = useCallback(() => {
    if (!anchorShiftCheck) return;
    setPendingOpeningBalanceUpdate({
      openingBalance: backDerivedOpeningBalance(anchorShiftCheck),
      openingBalanceAsOfDate: anchorShiftCheck.newAnchorDate,
      reference: {
        oldOpeningBalance: anchorShiftCheck.oldOpeningBalance,
        oldAnchorDate: anchorShiftCheck.oldAnchorDate,
        // The backfill's own un-back-derived claim — frozen here specifically because `openingBalance`
        // above is deliberately back-derived to reproduce `oldOpeningBalance`, not to preserve this value
        // (found + fixed 2026-08-09, second pass, on-device: without this, the live disagreement check
        // had nothing independent left to compare against and always trivially agreed — see
        // `recomputeAnchorAgreement`'s own doc comment).
        newOpeningBalance: anchorShiftCheck.newOpeningBalance,
        detectedAt: Date.now()
      }
    });
    confirmMapping();
  }, [anchorShiftCheck, confirmMapping]);

  /** §14b's "Review the new import's rows first" choice — makes no ACTIVE trust decision (doesn't say
   *  "I believe the backfill" or "I believe the old anchor"), just proceeds into the normal review
   *  screen so the user can inspect the actual matched/new/excluded rows first (§10c's own reasoning: a
   *  real backfill defect is only visible there, never from balance arithmetic alone). Still must move
   *  the anchor DATE correctly (same double-count bug as `flagAnchorDisagreement` above) even with no
   *  active decision made — behaviorally identical to it otherwise: a conservative default that keeps
   *  the OLD anchor's own value (via `backDerivedOpeningBalance()`) and flags the disagreement for
   *  later, since there's nothing else to trust yet either. */
  const deferAnchorDecision = useCallback(() => {
    flagAnchorDisagreement();
  }, [flagAnchorDisagreement]);

  const merchantGroups = useMemo(() => groupUnmatchedByMerchant(unmatchedRows, overrides), [unmatchedRows, overrides]);

  /** Same pool `matchStatementRows()` itself draws from (any recorded transaction touching this
   *  account, either direction, excluding synthetic Reconcile adjustments) — recomputed here (not
   *  read off the frozen `matchResult`) so lone-wolf detection below can react to live review state. */
  const accountPool = useMemo(() => {
    if (!account) return [];
    const accId = account.id;
    return allExpenses.filter(
      (e) => e.description !== RECONCILIATION_DESCRIPTION && (e.accountId === accId || e.toAccountId === accId)
    );
  }, [allExpenses, account]);

  /** Bucket 4 (Recorded, not in statement) — deliberately NOT read from the frozen `matchResult.
   *  loneWolves` (computed once, at parse time, by `matchStatementRows`). Per docs/plans/bank-
   *  statement-import.md §6's own explicit principle — "never silently hide or silently decide
   *  something uncertain" — an expense that becomes unclaimed *during* review (bumped by a manual
   *  reassignment's "trust the user" cascade, or freed up when a possible-match item is resolved to a
   *  different candidate or dismissed as new) must actually resurface here, not vanish from the
   *  review entirely. Recomputed via the same pure `deriveLoneWolves()` the one-shot matcher itself
   *  uses internally, fed with a LIVE "referenced" set built from current staged state — every expense
   *  currently claimed by a confirmed match, plus every candidate still listed on an unresolved
   *  possible-match item (not yet claimed, but not orphaned either — those items shrink/disappear as
   *  they're resolved, and this memo naturally follows). */
  const loneWolves = useMemo(() => {
    if (!parseResult) return [];
    const referenced = new Set<string>();
    for (const p of matchedPairs) referenced.add(p.expense.id);
    for (const item of possibleItems) for (const c of item.candidates) referenced.add(c.id);
    return deriveLoneWolves(accountPool, referenced, parseResult.rows, account?.coveredStatementRanges ?? []);
  }, [parseResult, matchedPairs, possibleItems, accountPool, account]);

  /** Removes `expenseId`'s current claim, wherever it is (§5's "trust the user" cascade) — the
   *  bumped statement line reverts to unresolved (folded back into "Not yet logged", which is the
   *  normal review flow for a statement row with no confirmed match; no automatic re-match attempt).
   *  Not itself part of the hook's public return — an internal step shared by the two mutators below. */
  const unclaimExpenseEverywhere = useCallback(
    (expenseId: string) => {
      const claimedPair = matchedPairs.find((p) => p.expense.id === expenseId);
      if (claimedPair) {
        setMatchedPairs((prev) => prev.filter((p) => p.expense.id !== expenseId));
        setUnmatchedRows((prev) => [...prev, claimedPair.statementRow]);
      }
    },
    [matchedPairs]
  );

  /** Bucket 1 (Matched) manual override — "Disagree with a match? Tap any pair to re-choose". */
  const reassignMatchedPair = useCallback(
    (statementRow: ParsedStatementRow, expense: Expense) => {
      unclaimExpenseEverywhere(expense.id);
      setMatchedPairs((prev) => {
        const idx = prev.findIndex((p) => p.statementRow.rowIndex === statementRow.rowIndex);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { statementRow, expense };
          return next;
        }
        return [...prev, { statementRow, expense }];
      });
    },
    [unclaimExpenseEverywhere]
  );

  /** Bucket 1 (Matched) retroactive cash-transfer conversion (§17 Finding 1, §7 Stage 7) — accepting
   *  `suggestRetroactiveCashTransferFor`'s chip on a matched pair. Mutates the staged pair's own
   *  `expense` in place (same staging model every other bucket mutator here already follows — nothing
   *  is written to the real vault until `commitAndImport()`, which already calls
   *  `reconcileMatchedExpense()` on every `matchedPairs` entry and preserves whatever `type`/
   *  `toAccountId` it finds there). Mirrors `applyCashTransferConversion`'s own doc comment: only
   *  `type`/`toAccountId` change, nothing else about the expense is touched. `alreadyConverted: true`
   *  (found + fixed 2026-08-09 — see `MatchedItem`'s own doc comment) forces `commitAndImport()` to
   *  actually persist this conversion even when date/amount/checkpoint are otherwise unchanged, which
   *  `reconcileMatchedExpense()` alone can't detect. */
  const convertMatchedPairToTransfer = useCallback((statementRow: ParsedStatementRow, toAccountId: string) => {
    setMatchedPairs((prev) =>
      prev.map((p) =>
        p.statementRow.rowIndex === statementRow.rowIndex
          ? { ...p, expense: applyCashTransferConversion(p.expense, toAccountId, Date.now()), alreadyConverted: true }
          : p
      )
    );
  }, []);

  /** Bucket 2 (Possible matches) — user picks a candidate (or a completely different transaction via
   *  search); resolves into a confirmed Matched pair. */
  const resolvePossibleMatch = useCallback(
    (statementRow: ParsedStatementRow, expense: Expense) => {
      unclaimExpenseEverywhere(expense.id);
      setPossibleItems((prev) => prev.filter((p) => p.statementRow.rowIndex !== statementRow.rowIndex));
      setMatchedPairs((prev) => [...prev, { statementRow, expense }]);
    },
    [unclaimExpenseEverywhere]
  );

  /** Bucket 2's "No match — add as new" fallback — the row falls through into the normal "Not yet
   *  logged" flow instead (grouped by merchant, bulk-categorize or the statementPreset form). */
  const dismissPossibleAsNew = useCallback((statementRow: ParsedStatementRow) => {
    setPossibleItems((prev) => prev.filter((p) => p.statementRow.rowIndex !== statementRow.rowIndex));
    setUnmatchedRows((prev) => [...prev, statementRow]);
  }, []);

  /** Absorbs an already-recorded cross-account expense as the OTHER leg of this statement row, instead
   *  of creating a duplicate (found + fixed 2026-08-09 — see `convertCandidateToTransfer`'s own doc
   *  comment: two separate records both debiting the source account for the same real-world transfer,
   *  corrupting that account's own already-verified checkpoint history). `candidate` is the already-
   *  recorded expense found by `suggestPossibleTransferFor`/`suggestAmbiguousTransferCandidatesFor` (an
   *  unlinked plain expense/income on a DIFFERENT account) — converted in place and staged as a normal
   *  matched pair, same staging model as every other bucket mutator here: nothing written until
   *  `commitAndImport()`. Removes the row from both `unmatchedRows` and `possibleItems` defensively —
   *  in practice it's only ever in one of the two by the time this is called, mirroring
   *  `resolvePossibleMatch`/`dismissPossibleAsNew`'s own filter predicates. */
  const linkAsCrossAccountTransfer = useCallback(
    (statementRow: ParsedStatementRow, candidate: Expense) => {
      const converted = convertCandidateToTransfer(candidate, accountId, Date.now());
      // `alreadyConverted: true` (found + fixed 2026-08-09 — see `MatchedItem`'s own doc comment): without
      // it, this conversion silently never reaches the database at all whenever the candidate's own
      // date/amount already agree with the statement row (the common case — that's exactly why it matched
      // in the first place), since `reconcileMatchedExpense()` has no way to see the type/account change.
      setMatchedPairs((prev) => [...prev, { statementRow, expense: converted, alreadyConverted: true }]);
      setUnmatchedRows((prev) => prev.filter((r) => r.rowIndex !== statementRow.rowIndex));
      setPossibleItems((prev) => prev.filter((p) => p.statementRow.rowIndex !== statementRow.rowIndex));
    },
    [accountId]
  );

  /** Bucket 3 (Not yet logged) bulk-categorize — one shared category/description/tags applied to
   *  every checked occurrence in a merchant group; each keeps its own date/amount AND its own
   *  independently-inferred payment mode (docs/plans/bank-statement-import.md §7 lists only
   *  category/description/tags as bulk-shared; §8 infers payment mode per statement line from its
   *  own narration — different occurrences of the same merchant can legitimately arrive via different
   *  rails, e.g. UPI one month, NEFT the next). Checked rows leave `unmatchedRows` (the group shrinks
   *  for an immediate second pass on the rest, §7). */
  const resolveMerchantGroup = useCallback(
    (
      rows: ParsedStatementRow[],
      fields: {
        description: string;
        categoryId: string;
        tags: string[];
        /** Carries the inline Set Aside choice for any brand-new tag through to commit-time hashtag
         *  creation — same shape as `ExpenseForm`'s own `newTagSetAside` save argument. */
        newTagSetAside?: Record<string, boolean>;
        /** Bulk-shared "Lent to" / "Borrowed from" name from the IOU panel, if filled in. */
        iouPersonName?: string;
        /** Set instead of description/categoryId/tags/iouPersonName when `BulkCategorizeModal`'s
         *  "Mark as transfer" toggle is on (2026-08-05, generalized from the original cash-only
         *  version) — every row in the group becomes a Transfer with this account rather than a
         *  categorized expense/income. The picked account can be any of the user's own accounts now,
         *  not just a cash one. */
        asTransferToAccountId?: string;
      }
    ) => {
      const now = Date.now();
      const iouPersonName = fields.iouPersonName?.trim();
      // Computed once per group (same target account for every row) rather than per row — description
      // reflects the destination account, not each row's own narration, same as the single-row
      // statementPreset transfer flow keeps its own description field open/editable.
      const transferAccount = fields.asTransferToAccountId
        ? accounts.find((a) => a.id === fields.asTransferToAccountId)
        : undefined;
      const transferDescription = transferAccount
        ? transferAccount.type === 'cash'
          ? 'Cash withdrawal'
          : `Transfer · ${transferAccount.name}`
        : 'Transfer';
      const newTxns: StagedNewTxn[] = rows.map((row) =>
        fields.asTransferToAccountId
          ? {
              statementRow: row,
              expense: {
                id: crypto.randomUUID(),
                amount: row.amount,
                categoryId: 'cat-tr-bank',
                description: transferDescription,
                date: row.date,
                hashtags: [],
                isRecurring: false,
                paymentMode: inferPaymentMode(row.rawNarration).id,
                type: 'transfer',
                // Direction swap, mirroring `ExpenseForm`'s own credit-row fix (2026-08-05): a debit row
                // means money left this account (source), a credit row means it arrived here
                // (destination) — `asTransferToAccountId` is always "the other account" regardless of
                // direction, so which schema field it fills in depends on the row's own direction.
                ...(row.direction === 'debit'
                  ? { accountId, toAccountId: fields.asTransferToAccountId }
                  : { accountId: fields.asTransferToAccountId, toAccountId: accountId }),
                source: 'bank_sync',
                createdAt: now,
                updatedAt: now
              }
            }
          : {
              statementRow: row,
              expense: {
                id: crypto.randomUUID(),
                amount: row.amount,
                categoryId: fields.categoryId,
                description: fields.description,
                date: row.date,
                hashtags: fields.tags,
                isRecurring: false,
                paymentMode: inferPaymentMode(row.rawNarration).id,
                type: row.direction === 'debit' ? 'expense' : 'income',
                accountId,
                source: 'bank_sync',
                createdAt: now,
                updatedAt: now
              },
              ...(fields.newTagSetAside ? { newTagSetAside: fields.newTagSetAside } : {}),
              ...(iouPersonName ? { iouPersonName } : {})
            }
      );
      setStagedNewTxns((prev) => [...prev, ...newTxns]);
      const resolvedIndices = new Set(rows.map((r) => r.rowIndex));
      setUnmatchedRows((prev) => prev.filter((r) => !resolvedIndices.has(r.rowIndex)));
    },
    [accountId, accounts]
  );

  /** Stages a fully-formed `Expense` built by the real `ExpenseForm` (statementPreset mode) — used by
   *  the "no match — add as new" single-row flow. Nothing is written yet; commit still happens only
   *  at the final Import tap, same as the bulk path above. `newTagSetAside` mirrors `ExpenseForm`'s own
   *  save argument, threaded through so a brand-new tag's Set Aside choice isn't silently dropped. */
  const stageNewTxnFromForm = useCallback(
    (expense: Expense, statementRow: ParsedStatementRow, newTagSetAside?: Record<string, boolean>) => {
      setStagedNewTxns((prev) => [...prev, { expense, statementRow, ...(newTagSetAside ? { newTagSetAside } : {}) }]);
      setUnmatchedRows((prev) => prev.filter((r) => r.rowIndex !== statementRow.rowIndex));
    },
    []
  );

  // ── Bucket 4 (lone wolves) ────────────────────────────────────────────────────────────────────
  const markLoneWolfForDeletion = useCallback((expenseId: string) => {
    setLoneWolfDeletions((prev) => new Set(prev).add(expenseId));
  }, []);
  const unmarkLoneWolfForDeletion = useCallback((expenseId: string) => {
    setLoneWolfDeletions((prev) => {
      const next = new Set(prev);
      next.delete(expenseId);
      return next;
    });
  }, []);
  /** "Edit transaction" on a lone wolf — an immediate, non-staged write (this is just the normal
   *  edit-an-existing-transaction action, independent of the import batch's staging model). */
  const saveEditedLoneWolf = useCallback(async (expense: Expense) => {
    await expensesRepo.put(expense);
  }, []);

  // ── Account/category/merchant plumbing the reused `ExpenseForm` needs ────────────────────────────
  const saveAccountForForm = useCallback(async (data: AccountInput, editing: Account | null): Promise<Account> => {
    const now = Date.now();
    const record: Account = editing
      ? { ...editing, ...data, updatedAt: now }
      : { id: crypto.randomUUID(), ...data, isArchived: false, createdAt: now, updatedAt: now };
    await accountsRepo.put(record);
    return record;
  }, []);

  // `matchedPairs` already includes every possible-match item the user has resolved (`resolvePossibleMatch`
  // moves it here directly rather than leaving a "resolved" marker behind in `possibleItems`), so it
  // alone accounts for every confirmed pairing — no separate term for `possibleItems` is needed.
  const readyCount = matchedPairs.length + stagedNewTxns.length + loneWolfDeletions.size;

  // ── Step 'done' / commit ──────────────────────────────────────────────────────────────────────
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    newCount: number;
    linkedCount: number;
    /** Confirmed matches against an existing transaction (auto or user-resolved) — distinct from
     *  `linkedCount`, which also counts every brand-new row's own provenance record. */
    matchedCount: number;
    deletedCount: number;
    failedCount: number;
    /** §11a — rows the file contained that never became a confirmed match or a staged new
     *  transaction. */
    skippedCount: number;
    /** Total rows the file actually contained, for the "N found, M handled, K skipped" line. */
    totalRows: number;
  } | null>(null);

  /** The single final write (§10b) — everything staged during review, all at once. Each row is its
   *  own try/catch (mirroring `core/import/importWriter.ts`'s `writeImportBatch`) so one bad row can't
   *  abort the whole batch. */
  const commitAndImport = useCallback(async () => {
    setCommitting(true);
    const batchId = crypto.randomUUID();
    const now = Date.now();
    const createdExpenseIds: string[] = [];
    let linkedCount = 0;
    let failedCount = 0;

    async function linkRecord(row: ParsedStatementRow, linkedTxnId: string, type: TransactionType) {
      try {
        await bankStatementImportsRepo.put({
          id: crypto.randomUUID(),
          batchId,
          accountId,
          rawNarration: row.rawNarration,
          normalizedKey: normalizeNarration(row.rawNarration, overrides),
          date: row.date,
          amount: row.amount,
          type,
          linkedTxnId,
          createdAt: now,
          // 2026-08-11 — the file's own 1-based line number, carried forward so Full Ledger Phase 2's
          // relink/unmatch/resolve actions can tell apart two genuinely separate transactions that
          // happen to share identical narration/date/amount (see the type's own doc comment).
          sourceRowIndex: row.rowIndex
        });
        linkedCount++;
      } catch {
        failedCount++;
      }
    }

    // Payment mode is a real, creatable entity (`PaymentMode`, `payment_modes` store, seeded with the
    // 5 built-ins) — some inferred rails (NEFT/IMPS/RTGS/Cheque) aren't among them. Resolve the
    // batch's distinct set of genuinely-new candidates once, against a FRESH read of what already
    // exists (not this hook's own possibly-stale `allPaymentModes` state — some other part of the
    // session could have created one since this screen mounted), then write each exactly once — never
    // once per transaction (10 NEFT lines must not attempt to create "NEFT" 10 times). Mirrors
    // `core/import/importAccountResolution.ts`'s resolve-once/write-once account-creation shape.
    const existingModeIds = new Set((await paymentModesRepo.getAll()).map((m) => m.id));
    const createdThisBatch = new Set<string>();
    for (const staged of stagedNewTxns) {
      const modeId = staged.expense.paymentMode;
      if (!modeId || existingModeIds.has(modeId) || createdThisBatch.has(modeId)) continue;
      // The candidate that would have produced this id — recomputed from the statement line's own
      // narration (deterministic/pure), so no extra state needs to be carried just for label/icon/
      // color. Covers every reachable path in this feature's UI (the bulk modal and the single-row
      // ExpenseForm both only ever offer an already-real id, or this inferred one, as a choice).
      const candidate = inferPaymentMode(staged.statementRow.rawNarration);
      if (candidate.id === modeId) {
        try {
          await paymentModesRepo.put({ ...candidate, isDefault: false, createdAt: now, updatedAt: now });
          createdThisBatch.add(modeId);
        } catch {
          failedCount++;
        }
      }
    }

    // Hashtag usage bookkeeping — same shape as `useExpenses.ts`'s `saveExpenseWithHashtags`, just
    // batched: an existing tag's usage count increments, a brand-new one gets created with whatever
    // Set Aside choice was made inline (`newTagSetAside`, ignored for tags that already exist — their
    // classification only ever changes via Manage Tags). Resolved against a fresh read + a local cache
    // so N occurrences of the same new tag in one batch create it exactly once, not N times.
    const hashtagCache = new Map((await hashtagsRepo.getAll()).map((h) => [h.name, h]));
    async function ensureHashtag(tag: string, setAside: boolean) {
      const existing = hashtagCache.get(tag);
      if (existing) {
        const updated = { ...existing, usageCount: existing.usageCount + 1 };
        await hashtagsRepo.put(updated);
        hashtagCache.set(tag, updated);
      } else {
        const created = {
          id: crypto.randomUUID(),
          name: tag,
          usageCount: 1,
          setAside,
          hideInSafeMode: setAside,
          createdAt: now
        };
        await hashtagsRepo.put(created);
        hashtagCache.set(tag, created);
      }
    }

    // IOU (Lent/Borrowed) — `BulkCategorizeModal`'s optional bulk-shared person field. Resolved the
    // same way `useExpenses.ts`'s `getOrCreatePerson` does (case-insensitive match, un-archive if
    // needed), against a fresh read + local cache so the same name across many rows in one batch
    // resolves to one `Person`, not one per row.
    const personCache = new Map((await personsRepo.getAll()).map((p) => [p.name.toLowerCase(), p]));
    async function resolvePerson(name: string): Promise<Person> {
      const key = name.trim().toLowerCase();
      const cached = personCache.get(key);
      if (cached && !cached.isArchived) return cached;
      const person: Person = cached
        ? { ...cached, isArchived: false, updatedAt: now }
        : { id: crypto.randomUUID(), name: name.trim(), createdAt: now, updatedAt: now };
      await personsRepo.put(person);
      personCache.set(key, person);
      return person;
    }

    // Checkpoint attachment (docs/plans/bank-balance-sync.md §5/§7) — scoped to `bank`-type accounts
    // only (plan §3/§16, Finding 2: credit cards are explicitly out of scope for the whole checkpoint
    // mechanism, an explicit gate here rather than something assumed to fall out naturally). Date/
    // amount correction on a matched pair (§8) is NOT gated by account type — it's a general
    // match-quality fix, independent of the balance-sync guarantee itself.
    const attachesCheckpoints = !!confirmedMapping?.balance && account?.type === 'bank';

    // Intra-day sequencing (docs/plans/bank-balance-sync.md §3 decision #6, §7 Stage 5, §9) —
    // piggybacks on this same checkpoint-attaching commit pass, same account-type/balance-column gate
    // as `attachesCheckpoints` above (a `reconciledSeq` with no checkpoint to order is pointless).
    // Computed once, per calendar day this import's own rows touch, BEFORE either write loop runs
    // below, since both loops need to know the resulting `expenseId -> reconciledSeq` for their own
    // rows. Also doubles as the "re-check forward" hook (§9's own wording): a day left unsequenced by
    // an earlier import gets re-derived here too, the moment THIS import's own rows also touch it and
    // happen to complete it — no separate mechanism needed, since this always re-derives from scratch
    // rather than trusting any previously-stored value.
    const reconciledSeqByExpenseId = new Map<string, number>();
    if (attachesCheckpoints) {
      const resolvedThisImport: DayResolution[] = [
        ...matchedPairs.map((pair) => ({ statementRow: pair.statementRow, expenseId: pair.expense.id })),
        ...stagedNewTxns.map((staged) => ({ statementRow: staged.statementRow, expenseId: staged.expense.id }))
      ];
      const resolvedIds = new Set(resolvedThisImport.map((r) => r.expenseId));
      const otherUnexplainedByDay = countOtherUnexplainedByDay(accountId, allExpenses, resolvedIds, loneWolfDeletions);
      for (const [dayKey, entries] of groupResolutionsByDay(resolvedThisImport)) {
        const { fullyExplained, sequenceByExpenseId } = computeDaySequence(
          entries,
          otherUnexplainedByDay.get(dayKey) ?? 0
        );
        if (fullyExplained) {
          for (const [id, seq] of sequenceByExpenseId) reconciledSeqByExpenseId.set(id, seq);
        }
      }
    }

    // Every possible-match item the user resolved is already a `MatchedItem` by this point
    // (`resolvePossibleMatch` moves it there directly, see `readyCount`'s comment above) — so this one
    // loop covers both the matcher's own confident auto-pairs AND every user-resolved possible match.
    for (const pair of matchedPairs) {
      const reconciled = reconcileMatchedExpense(pair.expense, pair.statementRow, attachesCheckpoints, now, accountId);
      const seq = reconciledSeqByExpenseId.get(pair.expense.id);
      // `reconcileMatchedExpense` only ever compares `pair.expense` against the STATEMENT ROW's own
      // date/amount/balance — it has no way to see a type/account-field conversion already baked into
      // `pair.expense` in memory (`convertMatchedPairToTransfer`/`linkAsCrossAccountTransfer`), since
      // those never touch date/amount/checkpoint. Without `pair.alreadyConverted` forcing a write here,
      // that conversion would silently never reach the database whenever date/amount/checkpoint happen to
      // already agree — the common case, since a matched pair's date/amount already agreed by definition
      // (found + fixed 2026-08-09, see `MatchedItem`'s own doc comment).
      const converted = pair.alreadyConverted ? { ...pair.expense, updatedAt: now } : undefined;
      const base = reconciled ?? converted;
      // A freshly (re-)derived `reconciledSeq` still needs writing even when nothing else about the
      // matched pair changed, so this can't just piggyback on `base`'s own truthiness.
      const toWrite: Expense | undefined =
        seq !== undefined && (base ?? pair.expense).reconciledSeq !== seq
          ? { ...(base ?? pair.expense), reconciledSeq: seq, updatedAt: now }
          : base;
      if (toWrite) {
        try {
          await expensesRepo.put(toWrite);
        } catch {
          failedCount++;
        }
      }
      await linkRecord(pair.statementRow, pair.expense.id, pair.expense.type ?? 'expense');
    }
    for (const staged of stagedNewTxns) {
      try {
        let expenseToSave = attachCheckpoint(staged.expense, staged.statementRow, attachesCheckpoints, accountId);
        const seq = reconciledSeqByExpenseId.get(staged.expense.id);
        if (seq !== undefined) expenseToSave = { ...expenseToSave, reconciledSeq: seq };
        await expensesRepo.put(expenseToSave);
        createdExpenseIds.push(expenseToSave.id);
        await linkRecord(staged.statementRow, expenseToSave.id, expenseToSave.type ?? 'expense');
        for (const tag of staged.expense.hashtags ?? []) {
          await ensureHashtag(tag, staged.newTagSetAside?.[tag] ?? false);
        }
        if (staged.iouPersonName) {
          const person = await resolvePerson(staged.iouPersonName);
          const kind: 'lent' | 'borrowed' = staged.expense.type === 'income' ? 'borrowed' : 'lent';
          await ledgerEntriesRepo.put({
            id: crypto.randomUUID(),
            personId: person.id,
            kind,
            amount: staged.expense.amount,
            date: staged.expense.date,
            origin: 'expense',
            linkedTxnId: staged.expense.id,
            createdAt: now,
            updatedAt: now,
            ...(staged.expense.description ? { description: staged.expense.description } : {})
          });
        }
      } catch {
        failedCount++;
      }
    }
    for (const id of loneWolfDeletions) {
      try {
        await expensesRepo.delete(id);
      } catch {
        failedCount++;
      }
    }

    // Covered-range tracking (docs/plans/bank-balance-sync.md §5/§11a/§11b, plan §7 Stage 2) — one
    // `ImportBatchSummary` per completed batch, appended to `Account.coveredStatementRanges`. Built for
    // every statement-importable account type (bank AND credit_card — the mockup's own "batch-level
    // facts, not checkpoint facts" distinction, docs/mockups/proposals/bank-balance-sync-v2.html §1);
    // only checkpoint attachment itself (`statementBalance`) stays gated to `bank`, above. Skipped rows
    // are whatever's still sitting in `possibleItems`/`unmatchedRows` at commit time — every row the
    // file actually contained that never became a confirmed match or a staged new transaction (§11a: a
    // durable, visible record of what was skipped, not silence; `direction` added 2026-08-10 so the
    // Full Ledger view can render a correctly-signed amount for a still-unresolved row).
    const totalRows = parseResult?.rows.length ?? 0;
    const skippedCount = countSkippedRows(totalRows, matchedPairs.length, stagedNewTxns.length);
    if (account && parseResult && totalRows > 0) {
      const dates = parseResult.rows.map((r) => r.date);
      const skippedRows = [...possibleItems.map((p) => p.statementRow), ...unmatchedRows].map((r) => ({
        rawNarration: r.rawNarration,
        date: r.date,
        amount: r.amount,
        direction: r.direction,
        // 2026-08-11 — see `ImportBatchSummary.skippedRows`' own doc comment on `rowIndex`: tells
        // apart two genuinely separate skipped rows that happen to share identical
        // narration/date/amount, rather than relying on those values alone.
        rowIndex: r.rowIndex
      }));
      const batchSummary: ImportBatchSummary = {
        batchId,
        start: Math.min(...dates),
        end: Math.max(...dates),
        importedAt: now,
        fileName,
        matchedCount: matchedPairs.length,
        addedCount: stagedNewTxns.length,
        skippedCount,
        skippedRows
      };
      // Opening-balance confirm / anchor-shift write (docs/plans/bank-balance-sync.md §3 decision
      // #10/§10a/§14, §7 Stage 3, redesigned 2026-08-09) — staged by
      // `confirmOpeningBalanceAndProceed`/`acceptAnchorShift`/`flagAnchorDisagreement`/
      // `deferAnchorDecision` on the Setup screen, applied here alongside the batch's own
      // `coveredStatementRanges` write, same "nothing written until commit" invariant as everything else
      // in this function. There is no more `'move'`/`'pin'` distinction (see `PendingOpeningBalanceUpdate`'s
      // own doc comment, `./types.ts`) — every branch always writes both fields; `reference` is only
      // present for the two §14b choices that leave a disagreement worth remembering. Explicitly clears
      // any STALE prior `anchorReference` when this fresh decision carries none (an "Accept"/first-import
      // confirm made after an earlier flagged disagreement must not leave that old flag behind silently).
      const openingBalanceFields: Partial<Account> = pendingOpeningBalanceUpdate
        ? {
            openingBalance: pendingOpeningBalanceUpdate.openingBalance,
            openingBalanceAsOfDate: pendingOpeningBalanceUpdate.openingBalanceAsOfDate,
            ...(pendingOpeningBalanceUpdate.reference
              ? { anchorReference: pendingOpeningBalanceUpdate.reference }
              : { anchorReference: undefined })
          }
        : {};
      try {
        await accountsRepo.put({
          ...account,
          coveredStatementRanges: [...(account.coveredStatementRanges ?? []), batchSummary],
          ...openingBalanceFields,
          updatedAt: now
        });
      } catch {
        failedCount++;
      }
    }

    if (createdExpenseIds.length > 0 || linkedCount > 0) {
      // Awaited (not the usual fire-and-forget logActivity()) — matches importWriter.ts's
      // writeImportBatch(): the Timeline screen's durable "Undo" action (added 2026-08-06) can be
      // tapped well after this resolves (a reload of the screen, or a tap shortly after import), and
      // needs the activity-log entry to definitely already exist rather than racing a background write.
      await logActivityAwaited({
        action: 'IMPORT',
        entityType: 'expense',
        entityId: 'bank-import',
        summary: `Imported ${createdExpenseIds.length} transaction${createdExpenseIds.length === 1 ? '' : 's'} from a bank statement`,
        entityCount: createdExpenseIds.length,
        snapshot: JSON.stringify(createdExpenseIds)
      });
      notifyTxnChanged();
    }

    // `bankStatementImportsRepo` was just written to above (`linkRecord`, once per matched/staged row)
    // — every OTHER already-mounted `useRepository(bankStatementImportsRepo)` consumer (chiefly
    // `useAccountVerification.ts`, which underlies the persistent "unverified account" badge on the
    // Accounts screen this import's own Accounts-stack ancestor never unmounts) needs telling, the same
    // way `notifyTxnChanged()`/`notifyAccountsChanged()` already do for their own repos. Missing this
    // was a real bug found via on-device testing 2026-08-09: the badge's standing-gap sweep ran against
    // a stale, pre-commit (often empty) `importRecords` array, so every transaction this exact import
    // had just linked looked unlinked to it and got flagged as a 100%-of-batch "standing gap".
    if (linkedCount > 0) notifyBankImportsChanged();

    setCommitResult({
      newCount: createdExpenseIds.length,
      linkedCount,
      matchedCount: matchedPairs.length,
      deletedCount: loneWolfDeletions.size,
      failedCount,
      skippedCount,
      totalRows
    });
    setCommitted(true);
    setCommitting(false);
    setStep('done');
  }, [
    accountId,
    overrides,
    stagedNewTxns,
    matchedPairs,
    loneWolfDeletions,
    account,
    confirmedMapping,
    parseResult,
    possibleItems,
    unmatchedRows,
    fileName,
    pendingOpeningBalanceUpdate,
    allExpenses
  ]);

  return {
    step,
    setStep,
    account,
    accounts,
    cashAccounts,
    suggestCashTransferFor,
    suggestRetroactiveCashTransferFor,
    suggestPossibleTransferFor,
    suggestAmbiguousTransferCandidatesFor,
    txnCountByCategory,
    categories,
    hashtags,
    allPaymentModes,
    iouPersons,
    overrides,
    importRecords,
    expensesById,

    // bank preset
    presetId,
    banks: BANK_PRESETS,
    selectPreset,

    // upload
    fileName,
    parseError,
    importFromText,
    importFromXlsx,
    isXlsxSource,

    // mapping
    mapping,
    setMappingField,
    headers,
    mappingReady,
    mappingPreview,
    delimiter,
    setDelimiter,
    isCustomPreset: presetId === CUSTOM_PRESET_ID,
    confirmMapping,
    dateFormat,
    dateFormatConfident,
    setDateFormat,
    coverageGap,
    expenseCoverageWarning,

    // opening-balance confirm / anchor-shift (plan §7 Stage 3)
    openingBalanceTrigger,
    openingBalanceSuggestion,
    openingBalanceOverrideText,
    setOpeningBalanceOverrideText,
    effectiveOpeningBalance,
    effectiveAsOfDate,
    anchorShiftCheck,
    pendingOpeningBalanceUpdate,
    confirmOpeningBalanceAndProceed,
    acceptAnchorShift,
    flagAnchorDisagreement,
    deferAnchorDecision,

    // review
    parseResult,
    matchResult,
    matchedPairs,
    possibleItems,
    unmatchedRows,
    merchantGroups,
    stagedNewTxns,
    loneWolves,
    loneWolfDeletions,
    readyCount,
    reassignMatchedPair,
    convertMatchedPairToTransfer,
    resolvePossibleMatch,
    dismissPossibleAsNew,
    linkAsCrossAccountTransfer,
    resolveMerchantGroup,
    stageNewTxnFromForm,
    markLoneWolfForDeletion,
    unmarkLoneWolfForDeletion,
    saveEditedLoneWolf,
    saveAccountForForm,

    // done / commit
    committing,
    committed,
    commitResult,
    commitAndImport
  };
}

export type UseBankImportReturn = ReturnType<typeof useBankImport>;
