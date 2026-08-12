import { useCallback, useEffect, useMemo, useState } from 'react';
import { expenseCategoriesRepo, expensesRepo, accountsRepo } from '@/core/db/repositories';
import type { ExpenseCategory, Account, AccountType } from '@/core/db/types';
import {
  parseByFormat,
  parseWithMapping,
  guessMappingForFormat,
  validateMappingForFormat,
  readHeader,
  type ImportFormat,
  type ParsedRow,
  type RejectedRow
} from '@/core/import/importParsers';
import { parseFlexibleDate, type ColumnMapping } from '@/core/import/importMatcher';
import {
  dedupKey,
  buildResolvedPreviewRows,
  toConfirmedCategoryMap,
  applyConfirmedTransferPairs,
  type ResolvedPreviewRow,
  type RowOverride
} from '@/core/import/importPipeline';
import {
  resolveCategories,
  isCategoryResolutionDecided,
  type CategoryResolution,
  type CategoryAction
} from '@/core/import/importCategoryResolution';
import { resolveAccounts, type AccountResolution, type AccountAction } from '@/core/import/importAccountResolution';
import { findDuplicateAccountName } from '@/core/accounts/accountValidation';
import { detectTransferPairs, type TransferPair } from '@/core/import/importTransferPairing';
import { identifyRedundantCarryForwardRows } from '@/core/import/importCarryForward';
import { writeImportBatch, undoImportBatch, type FailedImportRow } from '@/core/import/importWriter';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';

/** A transfer pair as shown on the review screen — every DETECTED pair is shown (never silently
 *  hidden), with `alreadyImported` set when either leg is a duplicate/skipped so the UI can mark it
 *  "Already imported" instead of removing it from the list. Accounting (write path,
 *  `actualTransactionCount`) still only ever uses the ready-only subset — see `confirmedTransferPairs`
 *  below — this type only affects what's DISPLAYED. */
export interface DisplayTransferPair extends TransferPair {
  alreadyImported: boolean;
}

type Step = 'upload' | 'mapColumns' | 'review' | 'done';
export type RowTriage = 'ready' | 'attention' | 'duplicate';

/**
 * RN port of apps/web-react/src/features/import/useImport.ts. This hook is pure business-logic/state
 * (React state + useMemo, no DOM APIs), so it ports essentially verbatim — the only platform seam is
 * `importFromText()`'s input, which both platforms feed with already-decoded file text (web via
 * `FileReader`, mobile via `expo-document-picker` + `expo-file-system`'s `File.text()` in
 * `UploadStep.tsx`). See that file's doc comment for the reading mechanism.
 *
 * Owns the CSV-import wizard. The former separate `resolve` and `preview` steps are merged into one
 * `review` step: the user adjusts category/account resolutions while looking at a LIVE preview, instead
 * of confirming once and only then seeing the result. The preview (`preview`, `rowTriage`, per-account/
 * per-category stats) is computed reactively via useMemo off `categoryResolutions` / `accountResolutions`
 * / `parsedRows` — recomputed on every resolution change — rather than built once by an explicit
 * "confirm" action. New categories/accounts are NOT created in the DB on every keystroke: that write only
 * happens in `commitAndImport()`, the single final action, immediately before the batch is written.
 */
export function useImport() {
  const [format, setFormat] = useState<ImportFormat>('penny');
  const [step, setStep] = useState<Step>('upload');
  const [parseError, setParseError] = useState('');
  const [rawText, setRawText] = useState('');

  const [header, setHeader] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [rejectedRows, setRejectedRows] = useState<RejectedRow[]>([]);

  const [categoryResolutions, setCategoryResolutions] = useState<CategoryResolution[]>([]);
  const [accountResolutions, setAccountResolutions] = useState<AccountResolution[]>([]);
  const [singleAccountId, setSingleAccountId] = useState<string | null>(null);
  const [singleAccountCreate, setSingleAccountCreate] = useState<{ name: string; type: AccountType } | null>(null);
  /** Source category names the user has explicitly acted on — see the "N of M decided" doc comment on
   *  `categoriesDecidedCount` below for why a fresh 'create' suggestion doesn't count as decided until
   *  touched, while a confident 'existing'/'transfer' match does from the start. */
  const [touchedCategorySources, setTouchedCategorySources] = useState<Set<string>>(new Set());
  /** Optional custom tag per source category name — e.g. "Jaipur Expenses" → "goa-trip" — applied to
   *  every transaction under that source category on top of its own parsed hashtags (see
   *  toConfirmedCategoryMap/buildResolvedPreviewRows). Independent of which category kind the source
   *  resolves to. */
  const [categoryTags, setCategoryTags] = useState<Map<string, string>>(new Map());
  /** Per-row overrides (2026-08-06), keyed by index into `parsedRows` — lets the user bulk-select an
   *  arbitrary SUBSET of one CategoryTile's rows (never spanning multiple source categories — see
   *  `RowOverride`'s doc comment for why the resolution model can't support that) and move just that
   *  subset to a different existing category, and/or tag just that subset, without disturbing the rest
   *  of the group or its own group-level resolution. */
  const [rowOverrides, setRowOverrides] = useState<Map<number, RowOverride>>(new Map());

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ succeededCount: number; failed: FailedImportRow[] }>({
    succeededCount: 0,
    failed: []
  });
  const [activityLogId, setActivityLogId] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  /** Per-category existing-transaction counts, fed straight into `CategoryPickerModal`'s own
   *  `txnCountByCategory` prop (via ReviewStep → PreviewSection → CategoryTile) for its "Frequent"
   *  quick-pick row — same shape/purpose as `useBankImport.ts`'s identically-named memo for the other
   *  import flow, just derived here from the one-shot `expensesRepo.getAll()` fetch below instead of a
   *  live `useRepository` subscription. */
  const [txnCountByCategory, setTxnCountByCategory] = useState<Map<string, number>>(new Map());
  /** Set only once every retry attempt below has been exhausted — lets the review screen show a small
   *  "Couldn't load categories — tap to retry" affordance instead of silently leaving `categories`/
   *  `accounts` empty for the rest of the session (see `loadReferenceData`'s doc comment). */
  const [categoriesLoadError, setCategoriesLoadError] = useState(false);

  /** Fetches categories/expenses/accounts, retrying on failure before giving up. This is a one-shot
   *  load (mirroring the original effect), but `expenseCategoriesRepo.getAll()` decrypts via
   *  `keystore.getMasterKey()`, which throws synchronously if the encryption session isn't unlocked yet
   *  — a real, transient race (e.g. a privacy/PIN re-lock timer firing right as the user navigates into
   *  Import). The original effect had no retry and a silently-swallowed `catch`, so hitting that race
   *  once left `categories`/`accounts` permanently empty for the whole Import session (found
   *  2026-08-06). Retries 3 times with backoff before surfacing `categoriesLoadError` so the UI can
   *  offer a manual retry too. */
  const loadReferenceData = useCallback(async () => {
    const retryDelaysMs = [300, 800, 1500];
    for (let attempt = 0; ; attempt++) {
      try {
        const [cats, exps, accts] = await Promise.all([
          expenseCategoriesRepo.getAll(),
          expensesRepo.getAll(),
          accountsRepo.getAll()
        ]);
        setCategories(cats);
        setAccounts(accts);
        setExistingKeys(new Set(exps.map((e) => dedupKey(e.date, e.amount, e.description))));
        const counts = new Map<string, number>();
        for (const e of exps) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
        setTxnCountByCategory(counts);
        setCategoriesLoadError(false);
        return;
      } catch {
        if (attempt >= retryDelaysMs.length) {
          setCategoriesLoadError(true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
      }
    }
  }, []);

  // State is only set inside the timeout (never directly in the effect body) to satisfy
  // react-hooks/set-state-in-effect — same `setTimeout(..., 0)`-wrap convention used by
  // ChooseHandleScreen.tsx/LetUsKnowYouScreen.tsx/useLivePrice.ts elsewhere in apps/mobile.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) void loadReferenceData();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [loadReferenceData]);

  /** Step 1 → 2/3: reads the file's header. Known formats parse immediately and go straight to
   *  Review; Custom shows the Map-columns step first with a pre-filled (never blank) guess. */
  function importFromText(text: string) {
    setParseError('');
    setRawText(text);
    const h = readHeader(text);
    if (!h) {
      setParseError('Could not read the file. Make sure it is a valid CSV.');
      return;
    }
    setHeader(h);

    if (format === 'custom') {
      setMapping(guessMappingForFormat(text, 'custom'));
      setStep('mapColumns');
      return;
    }

    const guessedMapping = guessMappingForFormat(text, format);
    // Always surface the guessed mapping to state, not just for 'custom' — RejectedRowEditor prefills
    // its Date/Amount/Description inputs from `mapping`.
    setMapping(guessedMapping);

    const mappingError = guessedMapping ? validateMappingForFormat(guessedMapping, format) : null;
    if (mappingError) {
      setParseError(mappingError);
      return;
    }

    const { rows, rejected } = parseByFormat(text, format);
    if (rows.length === 0 && rejected.length === 0) {
      setParseError('No valid rows found. Check the file format or that you selected the correct parser.');
      return;
    }
    setParsedRows(rows);
    setRejectedRows(rejected);
    goToReview(rows, categories, accounts);
  }

  /** Step 2 → 3 (Custom only): parses with the user-confirmed mapping. */
  function confirmMapping(confirmed: ColumnMapping) {
    setMapping(confirmed);
    const { rows, rejected } = parseWithMapping(rawText, confirmed, 'auto');
    if (rows.length === 0 && rejected.length === 0) {
      setParseError('No valid rows found with this column mapping. Check your selections and try again.');
      setStep('upload');
      return;
    }
    setParsedRows(rows);
    setRejectedRows(rejected);
    goToReview(rows, categories, accounts);
  }

  function goToReview(rows: ParsedRow[], cats: ExpenseCategory[], accts: Account[]) {
    setCategoryResolutions(resolveCategories(rows, cats));
    const accountRes = resolveAccounts(rows, accts);
    setAccountResolutions(accountRes);
    setSingleAccountId(accountRes.length === 0 ? (accts[0]?.id ?? null) : null);
    setTouchedCategorySources(new Set());
    setStep('review');
  }

  function updateCategoryResolution(sourceName: string, suggestion: CategoryAction) {
    setCategoryResolutions((prev) => prev.map((r) => (r.sourceName === sourceName ? { ...r, suggestion } : r)));
    setTouchedCategorySources((prev) => (prev.has(sourceName) ? prev : new Set(prev).add(sourceName)));
  }

  function updateAccountResolution(sourceName: string, suggestion: AccountAction) {
    setAccountResolutions((prev) => prev.map((r) => (r.sourceName === sourceName ? { ...r, suggestion } : r)));
  }

  function setCategoryTag(sourceName: string, tag: string) {
    setCategoryTags((prev) => {
      const next = new Map(prev);
      if (tag) next.set(sourceName, tag);
      else next.delete(sourceName);
      return next;
    });
  }

  /** Moves exactly the given `parsedRows` indices to a different EXISTING category — a bulk-select
   *  action scoped to one CategoryTile's own rows (never spanning multiple source categories; see
   *  `RowOverride`'s doc comment). Merges into any existing per-row tag override rather than clobbering
   *  it, so moving a subset that was already individually tagged keeps that tag. */
  function moveRowsToCategory(rowIndices: number[], categoryId: string, categoryName: string) {
    setRowOverrides((prev) => {
      const next = new Map(prev);
      for (const i of rowIndices) next.set(i, { ...next.get(i), categoryId, categoryName });
      return next;
    });
  }

  /** Tags exactly the given `parsedRows` indices — independent of any category-move override on the
   *  same rows. Clearing the tag (empty string) drops just the `tag` field of each row's override,
   *  removing the override entirely once it has neither a tag nor a category-move left. */
  function tagRows(rowIndices: number[], tag: string) {
    setRowOverrides((prev) => {
      const next = new Map(prev);
      for (const i of rowIndices) {
        const existing = next.get(i);
        if (tag) {
          next.set(i, { ...existing, tag });
        } else if (existing?.categoryId) {
          next.set(i, { categoryId: existing.categoryId, categoryName: existing.categoryName });
        } else {
          next.delete(i);
        }
      }
      return next;
    });
  }

  /** Fixes one previously-unparseable row inline and moves it into the ready-to-import set — the live
   *  preview recomputes automatically since it's derived from `parsedRows`. */
  function fixRejectedRow(rowIndex: number, fields: { date: string; amount: string; description: string }) {
    const date = parseFlexibleDate(fields.date, 'auto');
    const amount = Math.abs(parseFloat(fields.amount.replace(/[,₹\s]/g, '')) || 0);
    if (!date || !amount || !fields.description.trim()) return false;

    const fixed: ParsedRow = {
      date,
      amount,
      description: fields.description.trim(),
      categoryName: 'Other',
      type: 'expense',
      hashtags: []
    };
    setRejectedRows((prev) => prev.filter((r) => r.rowIndex !== rowIndex));
    setParsedRows((prev) => [...prev, fixed]);
    return true;
  }

  // ─── Live/reactive preview — recomputed on every resolution change, no DB writes ─────────────────

  /** Placeholder ids for categories/accounts that would be created — good enough for the live preview
   *  (counts, "Salary (new · Income)" labels) without writing anything until commitAndImport(). */
  const previewCategoryMap = useMemo(() => {
    const placeholderIds = new Map<string, string>();
    for (const r of categoryResolutions) {
      if (r.suggestion.kind === 'create') placeholderIds.set(r.sourceName, `preview-cat:${r.sourceName}`);
    }
    return toConfirmedCategoryMap(categoryResolutions, placeholderIds, categoryTags);
  }, [categoryResolutions, categoryTags]);

  const preview: ResolvedPreviewRow[] = useMemo(() => {
    const placeholderAccountIds = new Map<string, string>();
    for (const r of accountResolutions) {
      if (r.suggestion.kind === 'create') placeholderAccountIds.set(r.sourceName, `preview-acc:${r.sourceName}`);
    }
    const resolveAccountId = (row: ParsedRow): string => {
      if (row.account) {
        const r = accountResolutions.find((a) => a.sourceName === row.account);
        if (r?.suggestion.kind === 'existing') return r.suggestion.accountId;
        if (r?.suggestion.kind === 'create') return placeholderAccountIds.get(row.account) ?? '';
      }
      if (singleAccountId) return singleAccountId;
      if (singleAccountCreate?.name.trim()) return 'preview-acc:__single__';
      return '';
    };
    return buildResolvedPreviewRows(parsedRows, previewCategoryMap, resolveAccountId, existingKeys, rowOverrides);
  }, [
    parsedRows,
    previewCategoryMap,
    accountResolutions,
    singleAccountId,
    singleAccountCreate,
    existingKeys,
    rowOverrides
  ]);

  /** Per-row triage aligned index-for-index with `parsedRows`/`preview` (buildResolvedPreviewRows never
   *  reorders or drops rows). A row is 'attention' only when its category is still an unreviewed
   *  'create' guess — an 'existing'/'transfer' match, a touched/explicit resolution, or a row-level
   *  override (moving it to an existing category is itself an explicit decision) all count as ready. */
  const rowTriage: RowTriage[] = useMemo(() => {
    return preview.map((row, i) => {
      if (row.duplicate) return 'duplicate';
      if (rowOverrides.has(i)) return 'ready';
      const catKey = parsedRows[i]?.categoryName.trim() || 'Other';
      const res = categoryResolutions.find((r) => r.sourceName === catKey);
      const undecided = !!res && !isCategoryResolutionDecided(res, touchedCategorySources);
      return undecided ? 'attention' : 'ready';
    });
  }, [preview, parsedRows, categoryResolutions, touchedCategorySources, rowOverrides]);

  /** Indices (into `parsedRows`/`preview`, which stay index-aligned — see buildResolvedPreviewRows'
   *  doc comment) of MoneyView-style carry-forward markers ("Cash Forward" et al) that are redundant
   *  for their account — every occurrence except the chronologically-earliest one. These are real,
   *  successfully-parsed rows (never "rejected"/unparseable, never a plain user-driven category
   *  "skip") — a structurally distinct kind of exclusion, so it's tracked separately from `skipped`
   *  rather than overloading that flag. See `importCarryForward.ts`. */
  const carryForwardExcludedIndices = useMemo(() => identifyRedundantCarryForwardRows(parsedRows), [parsedRows]);
  /** The actual excluded rows, for the review screen's dedicated "carry-forward markers excluded"
   *  surfacing — never silently dropped, per the project's standing import-visibility principle. */
  const carryForwardExcludedRows = useMemo(
    () => parsedRows.filter((_, i) => carryForwardExcludedIndices.has(i)),
    [parsedRows, carryForwardExcludedIndices]
  );

  const readyRows = useMemo(
    () => preview.filter((r, i) => !r.duplicate && !r.skipped && !carryForwardExcludedIndices.has(i)),
    [preview, carryForwardExcludedIndices]
  );
  const duplicateCount = useMemo(() => rowTriage.filter((t) => t === 'duplicate').length, [rowTriage]);
  const attentionCount = useMemo(() => rowTriage.filter((t) => t === 'attention').length, [rowTriage]);
  const readyCount = readyRows.length;
  const skippedCount = useMemo(() => preview.filter((r) => r.skipped).length, [preview]);
  const totalRowsRead = parsedRows.length + rejectedRows.length;

  const transferPairs: TransferPair[] = useMemo(() => detectTransferPairs(parsedRows), [parsedRows]);
  /** Only pairs whose both rows are actually ready (not duplicate/skipped) get collapsed into a single
   *  "actual transaction" AND written as one merged transfer record — a pair with a duplicate/skipped
   *  side is left counted (and written) as normal independent rows. */
  const confirmedTransferPairs = useMemo(
    () =>
      transferPairs.filter((p) => {
        const out = preview[p.outgoingIndex];
        const inc = preview[p.incomingIndex];
        return !!out && !!inc && !out.duplicate && !out.skipped && !inc.duplicate && !inc.skipped;
      }),
    [transferPairs, preview]
  );
  const actualTransactionCount = readyCount - confirmedTransferPairs.length;

  /** ALL detected pairs, for display — a pair involving a duplicate/skipped leg is still shown, just
   *  marked "Already imported" instead of vanishing with zero explanation. */
  const displayTransferPairs: DisplayTransferPair[] = useMemo(
    () =>
      transferPairs.map((p) => {
        const out = preview[p.outgoingIndex];
        const inc = preview[p.incomingIndex];
        const alreadyImported = !out || !inc || out.duplicate || out.skipped || inc.duplicate || inc.skipped;
        return { ...p, alreadyImported };
      }),
    [transferPairs, preview]
  );

  const noAccountColumn = accountResolutions.length === 0;
  const accountsResolved = useMemo(() => {
    if (noAccountColumn) return !!singleAccountId || !!singleAccountCreate?.name.trim();
    return accountResolutions.every((r) =>
      r.suggestion.kind === 'existing' ? !!r.suggestion.accountId : !!r.suggestion.suggestedName.trim()
    );
  }, [noAccountColumn, accountResolutions, singleAccountId, singleAccountCreate]);

  /** Distinct final accounts the batch will end up with, after collapsing any "create" resolutions
   *  that share the same suggested name+type (e.g. via the merge-suggestion pill) into one. */
  const confirmedAccountCount = useMemo(() => {
    const ids = new Set<string>();
    for (const r of accountResolutions) {
      if (r.suggestion.kind === 'existing') ids.add(`existing:${r.suggestion.accountId}`);
      else ids.add(`create:${r.suggestion.suggestedName.trim().toLowerCase()}|${r.suggestion.suggestedType}`);
    }
    return ids.size;
  }, [accountResolutions]);

  /** "N of M decided" — see `isCategoryResolutionDecided`'s doc comment for exactly what counts:
   *  'existing'/'skip' from the start, 'create' once its tile has been touched, 'transfer' once a
   *  destination account has been picked. */
  const categoriesDecidedCount = useMemo(
    () => categoryResolutions.filter((r) => isCategoryResolutionDecided(r, touchedCategorySources)).length,
    [categoryResolutions, touchedCategorySources]
  );

  /** Import must stay blocked while any source category resolved as a transfer still has no destination
   *  account picked (2026-08-09 fix) — unlike an unreviewed 'create' guess (which can safely import
   *  using its current suggested name and be renamed later), an incomplete transfer would silently write
   *  with no `toAccountId`, debiting the source account with the money never landing anywhere. See
   *  `CategoryAction`'s 'transfer' variant doc comment. */
  const transfersResolved = useMemo(
    () => categoryResolutions.every((r) => r.suggestion.kind !== 'transfer' || !!r.suggestion.toAccountId),
    [categoryResolutions]
  );

  /** Creates any brand-new categories/accounts the user confirmed (explicit, one-time, never silent —
   *  this is the ONLY point in the review step that writes to the DB), then writes the import batch. */
  async function commitAndImport() {
    setImporting(true);

    const createdCategoryIds = new Map<string, string>();
    for (const r of categoryResolutions) {
      if (r.suggestion.kind !== 'create') continue;
      const id = crypto.randomUUID();
      const now = Date.now();
      await expenseCategoriesRepo.put({
        id,
        name: r.suggestion.suggestedName,
        icon: 'ti-tag',
        color: '#6b7280',
        isDefault: false,
        intentGroup: r.suggestion.suggestedIntentGroup,
        createdAt: now
      });
      createdCategoryIds.set(r.sourceName, id);
    }
    const categoryMap = toConfirmedCategoryMap(categoryResolutions, createdCategoryIds, categoryTags);

    const createdAccountIds = new Map<string, string>();
    const createdAccountsByKey = new Map<string, string>();
    for (const r of accountResolutions) {
      if (r.suggestion.kind !== 'create') continue;
      const key = `${r.suggestion.suggestedName.trim().toLowerCase()}|${r.suggestion.suggestedType}`;
      let id = createdAccountsByKey.get(key);
      if (!id) {
        const duplicate = findDuplicateAccountName(r.suggestion.suggestedName, accounts);
        if (duplicate) {
          id = duplicate.id;
        } else {
          id = crypto.randomUUID();
          const now = Date.now();
          await accountsRepo.put({
            id,
            name: r.suggestion.suggestedName,
            type: r.suggestion.suggestedType,
            openingBalance: 0,
            color: '#6b7280',
            icon: 'ti-wallet',
            includeInNetWorth: r.suggestion.suggestedType !== 'credit_card',
            isArchived: false,
            createdAt: now,
            updatedAt: now
          });
        }
        createdAccountsByKey.set(key, id);
      }
      createdAccountIds.set(r.sourceName, id);
    }

    let resolvedSingleAccountId = singleAccountId;
    if (noAccountColumn && singleAccountCreate) {
      const duplicate = findDuplicateAccountName(singleAccountCreate.name, accounts);
      if (duplicate) {
        resolvedSingleAccountId = duplicate.id;
      } else {
        const id = crypto.randomUUID();
        const now = Date.now();
        await accountsRepo.put({
          id,
          name: singleAccountCreate.name,
          type: singleAccountCreate.type,
          openingBalance: 0,
          color: '#6b7280',
          icon: 'ti-wallet',
          includeInNetWorth: singleAccountCreate.type !== 'credit_card',
          isArchived: false,
          createdAt: now,
          updatedAt: now
        });
        resolvedSingleAccountId = id;
      }
      setSingleAccountId(resolvedSingleAccountId);
    }

    const resolveAccountId = (row: ParsedRow): string => {
      if (row.account) {
        const r = accountResolutions.find((a) => a.sourceName === row.account);
        if (r?.suggestion.kind === 'existing') return r.suggestion.accountId;
        if (r?.suggestion.kind === 'create') return createdAccountIds.get(row.account) ?? '';
      }
      return resolvedSingleAccountId ?? '';
    };

    const finalRows = buildResolvedPreviewRows(parsedRows, categoryMap, resolveAccountId, existingKeys, rowOverrides);
    // Redundant carry-forward rows must never be written — tracked here by object reference (not
    // index) since applyConfirmedTransferPairs below reorders the array.
    const carryForwardExcludedRowRefs = new Set(finalRows.filter((_, i) => carryForwardExcludedIndices.has(i)));
    const rowsToWrite = applyConfirmedTransferPairs(finalRows, confirmedTransferPairs).filter(
      (row) => !carryForwardExcludedRowRefs.has(row)
    );
    const result = await writeImportBatch(rowsToWrite);
    setImportResult({ succeededCount: result.succeededCount, failed: result.failed });
    setActivityLogId(result.activityLogId);
    setImporting(false);
    setStep('done');
    // Broadcast the same way `useBankImport.ts`'s own commit does — without this, the Transactions
    // tab's own separately-mounted `useExpenses()` instance never reloads, so "Go to Expenses" lands on
    // a stale list until some unrelated action happens to trigger a reload (found + fixed 2026-08-09,
    // real on-device repro: newly-imported rows invisible after tapping "Go to Expenses").
    if (result.succeededCount > 0) notifyTxnChanged();
  }

  /** Retries just the rows that failed to write last time. */
  async function retryFailed() {
    setImporting(true);
    const retryRows = importResult.failed.map((f) => f.row);
    const result = await writeImportBatch(retryRows);
    setImportResult((prev) => ({
      succeededCount: prev.succeededCount + result.succeededCount,
      failed: result.failed
    }));
    setImporting(false);
    if (result.succeededCount > 0) notifyTxnChanged();
  }

  async function undoImport() {
    if (!activityLogId) return;
    const deletedCount = await undoImportBatch(activityLogId);
    setUndone(true);
    if (deletedCount > 0) notifyTxnChanged();
  }

  return {
    format,
    setFormat,
    step,
    setStep,
    parseError,
    header,
    mapping,
    parsedRows,
    categoryResolutions,
    accountResolutions,
    noAccountColumn,
    singleAccountId,
    setSingleAccountId,
    singleAccountCreate,
    setSingleAccountCreate,
    categories,
    accounts,
    txnCountByCategory,
    categoriesLoadError,
    retryLoadReferenceData: loadReferenceData,
    preview,
    rowTriage,
    readyRows,
    readyCount,
    attentionCount,
    duplicateCount,
    skippedCount,
    carryForwardExcludedRows,
    rejectedRows,
    totalRowsRead,
    transferPairs: displayTransferPairs,
    actualTransactionCount,
    accountsResolved,
    confirmedAccountCount,
    categoriesDecidedCount,
    transfersResolved,
    touchedCategorySources,
    categoryTags,
    rowOverrides,
    importing,
    importResult,
    activityLogId,
    undone,
    importFromText,
    confirmMapping,
    updateCategoryResolution,
    updateAccountResolution,
    setCategoryTag,
    moveRowsToCategory,
    tagRows,
    fixRejectedRow,
    commitAndImport,
    retryFailed,
    undoImport
  };
}
