import { useCallback, useMemo, useState } from 'react';
import type { Account, Expense, Person, TransactionType } from '@/core/db/types';
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
  type MatchResult,
  type PossibleTransferSuggestion
} from '@/core/bank-import/matcher';
import { groupUnmatchedByMerchant } from '@/core/bank-import/grouping';
import { checkBalanceAgainstStatement } from '@/core/bank-import/balanceCheck';
import { inferPaymentMode } from '@/core/bank-import/paymentModeInference';
import { suggestCashTransfer, type CashTransferSuggestion } from '@/core/bank-import/cashWithdrawalCodes';
import { usePaymentModes } from '~/hooks/usePaymentModes';
import { useBankCashWithdrawalCodes } from '~/hooks/useBankCashWithdrawalCodes';
import type { BankImportStep, MatchedItem, PossibleItem, StagedNewTxn } from './types';

/** Pure helper (no hook state) — the parsed row with the latest date that actually carried a
 *  Balance-column value, i.e. the statement's own reported closing balance. Module-level rather than
 *  defined inside the hook so it has a stable identity and never needs to appear in a dependency
 *  array. */
function findClosingBalance(rows: ParsedStatementRow[]): number | undefined {
  let best: ParsedStatementRow | undefined;
  for (const r of rows) {
    if (r.balance !== undefined && (!best || r.date >= best.date)) best = r;
  }
  return best?.balance;
}

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
   *  same `parseError` banner the CSV path uses, rather than a separate error UI. */
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
    const mr = matchStatementRows(result.rows, accountId, allExpenses, RECONCILIATION_DESCRIPTION);
    setMatchResult(mr);
    setMatchedPairs(mr.matched.map((p) => ({ statementRow: p.statementRow, expense: p.expense })));
    setPossibleItems(mr.possible.map((p) => ({ statementRow: p.statementRow, candidates: p.candidates })));
    setUnmatchedRows(mr.unmatched);
    setStagedNewTxns([]);
    setLoneWolfDeletions(new Set());
    setStep('review');
  }, [mappingReady, mapping, tokenizedRows, headers, accountId, allExpenses, dateFormat]);

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
    return deriveLoneWolves(accountPool, referenced, parseResult.rows);
  }, [parseResult, matchedPairs, possibleItems, accountPool]);

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
    deletedCount: number;
    failedCount: number;
  } | null>(null);
  const [balanceNudge, setBalanceNudge] = useState<{ computed: number; statementClosing: number } | null>(null);

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
          createdAt: now
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

    // Every possible-match item the user resolved is already a `MatchedItem` by this point
    // (`resolvePossibleMatch` moves it there directly, see `readyCount`'s comment above) — so this one
    // loop covers both the matcher's own confident auto-pairs AND every user-resolved possible match.
    for (const pair of matchedPairs) {
      await linkRecord(pair.statementRow, pair.expense.id, pair.expense.type ?? 'expense');
    }
    for (const staged of stagedNewTxns) {
      try {
        await expensesRepo.put(staged.expense);
        createdExpenseIds.push(staged.expense.id);
        await linkRecord(staged.statementRow, staged.expense.id, staged.expense.type ?? 'expense');
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

    // Post-import balance-mismatch nudge (§11) — only if the mapped statement had its own Balance
    // column, purely a confidence check, never auto-corrects anything.
    let nudge: { computed: number; statementClosing: number } | null = null;
    if (account && confirmedMapping?.balance && parseResult) {
      const closing = findClosingBalance(parseResult.rows);
      if (closing !== undefined) {
        const freshExpenses = await expensesRepo.getAll();
        const forAccount = freshExpenses.filter((e) => e.accountId === accountId || e.toAccountId === accountId);
        const check = checkBalanceAgainstStatement(account, forAccount, closing);
        if (!check.matches) nudge = { computed: check.computed, statementClosing: check.statementClosing };
      }
    }

    setCommitResult({
      newCount: createdExpenseIds.length,
      linkedCount,
      deletedCount: loneWolfDeletions.size,
      failedCount
    });
    setBalanceNudge(nudge);
    setCommitted(true);
    setCommitting(false);
    setStep('done');
  }, [accountId, overrides, stagedNewTxns, matchedPairs, loneWolfDeletions, account, confirmedMapping, parseResult]);

  return {
    step,
    setStep,
    account,
    accounts,
    cashAccounts,
    suggestCashTransferFor,
    suggestPossibleTransferFor,
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
    resolvePossibleMatch,
    dismissPossibleAsNew,
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
    balanceNudge,
    commitAndImport
  };
}

export type UseBankImportReturn = ReturnType<typeof useBankImport>;
