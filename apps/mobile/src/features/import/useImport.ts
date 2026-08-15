import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  expenseCategoriesRepo,
  expensesRepo,
  accountsRepo,
  personsRepo,
  ledgerEntriesRepo
} from '@/core/db/repositories';
import type { ExpenseCategory, Account, AccountType, Person } from '@/core/db/types';
import { IOU_MANDATORY_CATEGORY_IDS } from '@/core/db/defaultCategories';
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
  buildResolvedPreviewRowsByIndex,
  applyConfirmedTransferPairs,
  type ResolvedPreviewRow,
  type RowOverride,
  type RowAction
} from '@/core/import/importPipeline';
import {
  resolveCategoriesDirectional,
  isDirectionalCategoryResolutionDecided,
  draftCategoryKey,
  type DirectionalCategoryResolution,
  type CategoryAction
} from '@/core/import/importCategoryResolution';
import {
  shouldSplitByCounterparty,
  splitByCounterparty,
  RESIDUAL_COUNTERPARTY_GROUP_KEY,
  RESIDUAL_COUNTERPARTY_LABEL
} from '@/core/import/importCounterpartySplit';
import {
  resolveAccounts,
  suggestCardAccountMerges,
  type AccountResolutionOrSkip,
  type AccountActionOrSkip,
  type CardAccountMergeSuggestion
} from '@/core/import/importAccountResolution';
import { findDuplicateAccountName } from '@/core/accounts/accountValidation';
import {
  detectSelfAccountMovementPairs,
  transferPairKey,
  type TransferPair
} from '@/core/import/importTransferPairing';
import { identifyRedundantCarryForwardRows } from '@/core/import/importCarryForward';
import {
  writeImportBatch,
  writeImportBatchDetailed,
  undoImportBatch,
  type FailedImportRow
} from '@/core/import/importWriter';
import { groupRowsForTransactionsStage, type TransactionRowTriage } from '@/core/import/importTransactionsGrouping';
import { useRepository } from '@/hooks/useRepository';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { loadRememberedSuggestions, rememberCategoryChoices } from './importCategoryMemory';

/** A transfer pair as shown on the review screen — every DETECTED pair is shown (never silently
 *  hidden), with `alreadyImported` set when either leg is a duplicate/skipped so the UI can mark it
 *  "Already imported" instead of removing it from the list. Accounting (write path,
 *  `actualTransactionCount`) still only ever uses the ready-only subset — see `confirmedTransferPairs`
 *  below — this type only affects what's DISPLAYED. */
export interface DisplayTransferPair extends TransferPair {
  alreadyImported: boolean;
}

/** 2026-08-14 (CSV-import redesign): the wizard's full 6-stage shape (docs/plans/csv-expense-import-
 *  redesign.md §3) — `'accounts'` (Chunk A) resolves every distinct account/card; `'categories'`/
 *  `'transactions'` (Chunk B) replace the old single `'review'` step, splitting what it used to do
 *  (category resolution + row-level triage) into two real stages, reached in that order since
 *  Transactions triage assumes categories are already resolved. */
type Step = 'upload' | 'mapColumns' | 'accounts' | 'categories' | 'transactions' | 'done';
export type RowTriage = TransactionRowTriage;

/** The 'done' step's own internal sub-state (2026-08-14, Import Progress screen — redesign §14 item 8).
 *  'done' absorbs what used to be a single blind `commitAndImport()` call fired straight from
 *  Transactions stage's Import button (no guard against navigating away mid-write, a real bug found in
 *  testing) — it's now reached the INSTANT that button is tapped, before anything is written, and moves
 *  through three sub-states internally: 'preStart' (nothing written yet, back navigation still allowed)
 *  → 'importing' (the real write loop is running; back navigation locked everywhere — header, hardware
 *  back, swipe gesture) → 'complete' (`DoneStep.tsx`'s existing layout, reused verbatim). This is
 *  deliberately NOT a new distinct wizard `Step` — `WizardProgress.tsx`'s step count/labels are
 *  unaffected, since every substate still reports `step === 'done'`. */
export type ImportPhase = 'preStart' | 'importing' | 'complete';

/** One Categories-stage-resolved row-group — either a whole `DirectionalCategoryResolution` (not
 *  counterparty-split) or one `CounterpartyGroup` under a split resolution (`isSplitChild: true`). This
 *  is the single row identity both the Categories stage (one row per group) and the Transactions stage
 *  (one tile per group, via `importTransactionsGrouping.ts`) key off of. */
export interface CategoryRowGroup {
  fullKey: string;
  label: string;
  parentSourceName: string;
  type: 'expense' | 'income' | 'transfer';
  count: number;
  rowIndices: number[];
  isSplitChild: boolean;
  isTransferSuspect: boolean;
  isIouSuspect: boolean;
  isInvestmentMovement: boolean;
  confidence?: 'high' | 'low' | 'residual';
  personMatch?: { personId: string; personName: string };
  defaultSuggestion: CategoryAction;
  /** Pre-fill seed for the IOU person field (redesign doc §7's 2026-08-14 clarification) — the matched
   *  Person's name, or (for an unmatched-but-named low-confidence group) its own raw candidate text.
   *  Undefined for the residual group or a non-split resolution. */
  counterpartySeedName?: string;
}

/** `CategoryRowGroup` enriched with its CURRENT effective decision — the single shape both
 *  `CategoriesStage.tsx` and `TransactionsStage.tsx` render from. */
export interface TransactionsRowGroup extends CategoryRowGroup {
  effectiveSuggestion: CategoryAction;
  /** True once this group's CATEGORY decision (kind + transfer destination, where applicable) is
   *  settled — mirrors `isDirectionalCategoryResolutionDecided`. Does NOT factor in an IOU-mandatory
   *  category's still-missing person (see `transactionsReady`) — supplying the person is explicitly a
   *  Transactions-stage-only concern (redesign doc §3), not a Categories-stage gate. */
  decided: boolean;
  /** `decided` AND (not IOU-mandatory, or its person has been supplied) — the actual gate for whether
   *  this group's rows can be committed ("Staged") vs. still need attention. */
  transactionsReady: boolean;
}

/**
 * RN port of apps/web-react/src/features/import/useImport.ts. This hook is pure business-logic/state
 * (React state + useMemo, no DOM APIs). Owns the CSV-import wizard's full 6-stage flow
 * (docs/plans/csv-expense-import-redesign.md) — Upload → MapColumns → Accounts → Categories →
 * Transactions → Done. Nothing is written to the encrypted DB until `commitAndImport()`, the single
 * final action (§3.1/§3.2) — every account/category/transaction resolution up to that point lives
 * purely in memory (in-memory "draft" objects, referenced by name/key, materialized only at commit).
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
  /** Rows the user explicitly discarded from `UnparsedRows.tsx` (2026-08-14, redesign §9.1/Issue #1) —
   *  permanently excluded, distinct from just leaving a row unfixed. Tracked only for the Done step's
   *  "N discarded" summary (the row itself is already removed from `rejectedRows` when discarded). */
  const [discardedRejectedRowIndices, setDiscardedRejectedRowIndices] = useState<Set<number>>(new Set());

  const [accountResolutions, setAccountResolutions] = useState<AccountResolutionOrSkip[]>([]);
  /** Source names the user has explicitly acted on (2026-08-14, manual-testing gap #2) — mirrors
   *  `categoryTouchedKeys`' own doc comment: a fresh, untouched 'create' guess counts as "Needs Review"
   *  in the Accounts stage's new bucket grouping; 'existing'/'skip' are decided from the start regardless
   *  (same as categories). Marked touched by `updateAccountResolution`/`acknowledgeAccountResolution`
   *  below; a merged card counts as "Ready" unconditionally (it fully tracks its target — see
   *  `cardMergeTargets`), independent of this set. */
  const [accountTouchedSourceNames, setAccountTouchedSourceNames] = useState<Set<string>>(new Set());
  const [singleAccountId, setSingleAccountId] = useState<string | null>(null);
  const [singleAccountCreate, setSingleAccountCreate] = useState<{ name: string; type: AccountType } | null>(null);
  /** Payment mode derived from an ACCEPTED card→account merge (2026-08-14, redesign doc §9.7), keyed by
   *  the card's own source name. Applied to that source name's rows (only when a row doesn't already
   *  carry its own parsed `paymentMode`) via `effectiveParsedRows` below. */
  const [accountPaymentModeOverrides, setAccountPaymentModeOverrides] = useState<Map<string, string>>(new Map());
  /** Source names the user has explicitly dismissed a card→account merge suggestion for (2026-08-14). */
  const [dismissedCardMerges, setDismissedCardMerges] = useState<Set<string>>(new Set());
  /** Accepted card→account merges (code-review fix), keyed by the CARD's own source name, valued by the
   *  TARGET's source name — a live pointer, never a copied snapshot. `acceptCardAccountMerge()` used to
   *  copy `target.suggestion` by value onto the card's own resolution at accept-time; if the user then
   *  edited the target's kind/name/type afterward (fully possible — the row stays editable), the card's
   *  stale copy didn't follow, and the two could diverge back into separate accounts at commit
   *  (recreating Issue #9 via a different path). `effectiveAccountResolutions` below resolves the card's
   *  suggestion LIVE from the target's CURRENT resolution every time it's read instead. */
  const [cardMergeTargets, setCardMergeTargets] = useState<Map<string, string>>(new Map());

  /** Per-`CategoryRowGroup.fullKey` override of its `defaultSuggestion` — the Categories stage's core
   *  "draft, materialized only at commit" state (§3.1). Absent for a group means it's still showing its
   *  auto-suggested default. */
  const [categoryDecisions, setCategoryDecisions] = useState<Map<string, CategoryAction>>(new Map());
  /** Keys the user has explicitly acted on (mirrors the old `touchedCategorySources`, now per fullKey —
   *  see `isDirectionalCategoryResolutionDecided`'s doc comment for why a fresh 'create' guess doesn't
   *  count as decided until touched, while 'existing'/'transfer'-with-destination do from the start). */
  const [categoryTouchedKeys, setCategoryTouchedKeys] = useState<Set<string>>(new Set());
  /** Optional custom tag per group, keyed by fullKey. */
  const [categoryTagsByKey, setCategoryTagsByKey] = useState<Map<string, string>>(new Map());
  /** IOU (Lent/Borrowed) person name per group, keyed by fullKey (2026-08-14, redesign §9.6) — supplied
   *  via the Transactions-stage tile's `ImportCategorizeModal`, pre-filled from
   *  `CategoryRowGroup.counterpartySeedName` the first time that tile's modal opens. Only meaningful for
   *  a row that is STILL a member of its group (no `RowOverride`) — see `rowIouPersonNames` below for
   *  the row that was moved out via a partial-selection override. */
  const [iouPersonNames, setIouPersonNames] = useState<Map<string, string>>(new Map());
  /** IOU (Lent/Borrowed) person name PER ROW INDEX (2026-08-14, code-review fix) — set when the
   *  Lent/Borrowed panel is filled in during a PARTIAL-selection apply (`ImportCategorizeModal`'s
   *  `onApplyPartial`, reachable via `CategoryTile`'s bulk-select + "Categorize N selected"), which moves
   *  only the checked subset to a different EXISTING category via a `RowOverride` — never the whole
   *  group. `iouPersonNames` (keyed by fullKey) genuinely cannot represent this: it would either silently
   *  drop the person for the moved-out rows (group-level check never fires for them again) or leak it
   *  onto every other row still in the original group. Checked at commit (`commitAndImport`) for any row
   *  index that has an active `RowOverride`, taking precedence over the group-level map for that row —
   *  mirrors `buildResolvedPreviewRowsByIndex`'s own "an override always wins" precedence. */
  const [rowIouPersonNames, setRowIouPersonNamesState] = useState<Map<number, string>>(new Map());
  /** Counterparty sub-split groups the user has manually corrected into the residual bucket
   *  (2026-08-14, redesign §7's "move a wrongly-detected group into the residual bucket" mechanism) —
   *  keyed by the group's own fullKey, checked when building `categoryRowGroups` below. Scoped to a
   *  whole GROUP (not arbitrary per-row reassignment across groups) — a deliberate, narrower reading of
   *  §7's correction mechanism, flagged explicitly in this task's write-up. */
  const [manuallyResidualGroupKeys, setManuallyResidualGroupKeys] = useState<Set<string>>(new Set());
  /** Per-row overrides (2026-08-06), keyed by index into `parsedRows` — lets the user bulk-select an
   *  arbitrary SUBSET of one tile's rows and either move just those to a different EXISTING category,
   *  and/or tag just those, without disturbing the rest of the group or its own group-level decision. */
  const [rowOverrides, setRowOverrides] = useState<Map<number, RowOverride>>(new Map());
  /** Rows the user explicitly un-flagged via "Not a duplicate — import anyway" (2026-08-14, redesign
   *  §8/Issue #7) — forces `preview[i].duplicate` back to `false` regardless of the dedup-key check. */
  const [unflaggedDuplicateIndices, setUnflaggedDuplicateIndices] = useState<Set<number>>(new Set());
  /** Detected self-account-movement pairs the user has explicitly un-paired via "Not a transfer — log
   *  separately" — keyed by `transferPairKey(outgoingIndex, incomingIndex)`. */
  const [unpairedTransferKeys, setUnpairedTransferKeys] = useState<Set<string>>(new Set());
  /** "Remembered — {categoryName}" suggestions (2026-08-13), keyed by source category name. */
  const [rememberedSuggestions, setRememberedSuggestions] = useState<
    Map<string, { categoryId: string; categoryName: string }>
  >(new Map());

  const [importing, setImporting] = useState(false);
  // Import Progress screen (2026-08-14, redesign §14 item 8) — see `ImportPhase`'s own doc comment.
  const [importPhase, setImportPhase] = useState<ImportPhase>('preStart');
  const [importProgress, setImportProgress] = useState({ completed: 0, total: 0 });
  /** Timestamp the write loop actually started (set right when 'importing' begins) — the Import
   *  Progress screen derives its own rolling ms/row estimate from `Date.now() - importStartedAt`
   *  against `importProgress.completed`, re-derived fresh on every progress update rather than via a
   *  separate ticking timer (progress updates already re-render often enough on their own). */
  const [importStartedAt, setImportStartedAt] = useState<number | null>(null);
  /** Set once the write loop actually stops early via `requestCancelImport()` — distinct from a genuine
   *  per-row write failure (`importResult.failed`); drives the Complete state's "stopped" (warning,
   *  not danger) framing instead of a normal full finish. */
  const [importCancelled, setImportCancelled] = useState(false);
  /** Only meaningful when `importCancelled` — how many of THIS run's writable rows were never attempted
   *  because the loop stopped early (computed from the LAST `onProgress` tick actually reported, not
   *  `succeededCount`, since a genuine per-row failure before the cancel point must not double-count as
   *  "still remaining" too). */
  const [cancelledRemainingCount, setCancelledRemainingCount] = useState(0);
  /** Set only if `commitAndImport()` itself throws something genuinely UNEXPECTED — never for an
   *  already-handled per-row write failure (`importResult.failed`, caught inside
   *  `writeImportBatchDetailed`'s own loop) or a deliberate `requestCancelImport()` (`importCancelled`).
   *  Found in verification (2026-08-14): without this, an unhandled throw anywhere in
   *  `commitAndImport()` (e.g. a `repo.put()` for category/account/IOU-person creation failing) would
   *  leave `importPhase` stuck at `'importing'` forever — exactly the phase back-navigation (header,
   *  hardware back, swipe gesture) is locked on, with no way to leave short of force-quitting. Reusing
   *  `DoneStep.tsx`'s existing layout for this too (a new highest-priority framing there, distinct from
   *  its `cancelled`/`hasFailures` cases) rather than inventing a whole separate error screen — the user
   *  still needs to land somewhere they can actually act from, per this repo's reliability rule (never
   *  let an exception throw uncaught, always show what went wrong). */
  const [importError, setImportError] = useState<string | null>(null);
  // A ref, not state — `shouldCancel` is polled synchronously between row writes inside the write loop's
  // own closure (captured once, when `commitAndImport` starts); a ref's `.current` is always the latest
  // value no matter when it's read, unlike a `useState` value captured at closure-creation time.
  const cancelRequestedRef = useRef(false);
  const [importResult, setImportResult] = useState<{ succeededCount: number; failed: FailedImportRow[] }>({
    succeededCount: 0,
    failed: []
  });
  const [activityLogId, setActivityLogId] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  /** Captured once, right before `setStep('done')` — the Done step's own state (`attentionRowCount`/
   *  `rejectedRows`) keeps changing shape after commit as other state resets, so the summary line
   *  (redesign §9.1: "N discarded, N still unresolved"; manual-testing gap #1: "N excluded — account
   *  skipped") needs a stable snapshot. */
  const [doneSummary, setDoneSummary] = useState({
    discardedCount: 0,
    stillUnresolvedCount: 0,
    accountSkippedCount: 0
  });

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [txnCountByCategory, setTxnCountByCategory] = useState<Map<string, number>>(new Map());
  const [categoriesLoadError, setCategoriesLoadError] = useState(false);
  /** IOU (Lent/Borrowed) person autocomplete — live subscription, same as `useBankImport.ts`'s own
   *  `iouPersons`. */
  const { items: persons } = useRepository(personsRepo);

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

  function importFromText(text: string) {
    setParseError('');
    setRawText(text);
    try {
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
      goToAccountsStage(rows, accounts);
    } catch {
      setParseError("Couldn't read this file — it may be corrupted or not a real CSV. Try a different file.");
    }
  }

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
    goToAccountsStage(rows, accounts);
  }

  /** Step 1/2 → 'accounts' — resets every piece of per-import state fresh for the new file. Account
   *  resolution is computed here since it's needed immediately; category resolution
   *  (`resolveCategoriesDirectional`) is a pure `useMemo` off `parsedRows`/`categories` below, so it's
   *  already available for `rowTriage`'s stats even before the Categories stage is reached. */
  function goToAccountsStage(rows: ParsedRow[], accts: Account[]) {
    const accountRes = resolveAccounts(rows, accts);
    setAccountResolutions(accountRes);
    setSingleAccountId(accountRes.length === 0 ? (accts[0]?.id ?? null) : null);
    setAccountTouchedSourceNames(new Set());
    setAccountPaymentModeOverrides(new Map());
    setDismissedCardMerges(new Set());
    setCardMergeTargets(new Map());
    setCategoryDecisions(new Map());
    setCategoryTouchedKeys(new Set());
    setCategoryTagsByKey(new Map());
    setIouPersonNames(new Map());
    setRowIouPersonNamesState(new Map());
    setManuallyResidualGroupKeys(new Set());
    setRowOverrides(new Map());
    setUnflaggedDuplicateIndices(new Set());
    setUnpairedTransferKeys(new Set());
    setDiscardedRejectedRowIndices(new Set());
    setRememberedSuggestions(new Map());
    setStep('accounts');
  }

  function updateAccountResolution(sourceName: string, suggestion: AccountActionOrSkip) {
    setAccountResolutions((prev) => prev.map((r) => (r.sourceName === sourceName ? { ...r, suggestion } : r)));
    setAccountTouchedSourceNames((prev) => (prev.has(sourceName) ? prev : new Set(prev).add(sourceName)));
  }

  /** "Looks good, use this" for an account row (2026-08-14, manual-testing gap #2) — mirrors
   *  `acknowledgeCategoryDecision`: marks an unconfirmed 'create' suggestion reviewed-and-accepted-as-is,
   *  WITHOUT changing it. */
  function acknowledgeAccountResolution(sourceName: string) {
    setAccountTouchedSourceNames((prev) => (prev.has(sourceName) ? prev : new Set(prev).add(sourceName)));
  }

  const cardMergeSuggestions: CardAccountMergeSuggestion[] = useMemo(
    () =>
      suggestCardAccountMerges(parsedRows, accountResolutions).filter(
        (s) => !dismissedCardMerges.has(s.cardSourceName)
      ),
    [parsedRows, accountResolutions, dismissedCardMerges]
  );

  /** `accountResolutions`, with any accepted card→account merge's `suggestion` LIVE-MIRRORED from its
   *  current target resolution (code-review fix — see `cardMergeTargets`' own doc comment). Every
   *  consumer below that cares about a resolution's SUGGESTION (not its raw source-name identity) reads
   *  this instead of the raw state, so editing the target after accepting a merge is reflected
   *  everywhere the merge itself is, with nothing to fall out of sync at commit. */
  const effectiveAccountResolutions: AccountResolutionOrSkip[] = useMemo(() => {
    if (cardMergeTargets.size === 0) return accountResolutions;
    return accountResolutions.map((r) => {
      const targetName = cardMergeTargets.get(r.sourceName);
      if (!targetName) return r;
      const target = accountResolutions.find((t) => t.sourceName === targetName);
      return target ? { ...r, suggestion: target.suggestion } : r;
    });
  }, [accountResolutions, cardMergeTargets]);

  /** Merges a card-type source account into the target it shares a Bank Name with (redesign doc §9.7) —
   *  stores a live pointer to the target's sourceName (`cardMergeTargets`), never a snapshot of its
   *  `suggestion`; see that state's own doc comment for the bug this fixes. */
  function acceptCardAccountMerge(cardSourceName: string, targetSourceName: string, paymentMode: string) {
    setCardMergeTargets((prev) => new Map(prev).set(cardSourceName, targetSourceName));
    setAccountPaymentModeOverrides((prev) => new Map(prev).set(cardSourceName, paymentMode));
    setDismissedCardMerges((prev) => new Set(prev).add(cardSourceName));
  }

  function dismissCardAccountMerge(cardSourceName: string) {
    setDismissedCardMerges((prev) => new Set(prev).add(cardSourceName));
  }

  /** Reverses an accepted card→account merge (code-review fix) — the card's row goes back to showing
   *  its own original auto-suggested resolution (never mutated by `acceptCardAccountMerge` in the first
   *  place — the raw `accountResolutions` entry for it was always left alone), and the merge suggestion
   *  itself becomes offerable again (removed from `dismissedCardMerges`). */
  function unmergeCardAccount(cardSourceName: string) {
    setCardMergeTargets((prev) => {
      const next = new Map(prev);
      next.delete(cardSourceName);
      return next;
    });
    setAccountPaymentModeOverrides((prev) => {
      const next = new Map(prev);
      next.delete(cardSourceName);
      return next;
    });
    setDismissedCardMerges((prev) => {
      const next = new Set(prev);
      next.delete(cardSourceName);
      return next;
    });
  }

  const effectiveParsedRows = useMemo(() => {
    if (accountPaymentModeOverrides.size === 0) return parsedRows;
    return parsedRows.map((row) => {
      const override = row.account ? accountPaymentModeOverrides.get(row.account) : undefined;
      return override && !row.paymentMode ? { ...row, paymentMode: override } : row;
    });
  }, [parsedRows, accountPaymentModeOverrides]);

  const noAccountColumn = accountResolutions.length === 0;
  /** Whether every account resolution is genuinely DECIDED, not just "has a plausible auto-suggestion" —
   *  mirrors `isCategoryResolutionDecided`'s exact pattern (`packages/core/src/core/import/
   *  importCategoryResolution.ts`): a `'create'` kind additionally requires
   *  `accountTouchedSourceNames.has(r.sourceName)`. Found missing in manual testing (2026-08-14) — the
   *  check used to be `!!r.suggestion.suggestedName.trim()` alone, true from the moment the auto-
   *  suggestion first appears, before the user has looked at it at all, making the Accounts stage's
   *  advance-gate a no-op even though (unlike Categories, deliberately loosened) Accounts was meant to
   *  stay strict — a user could advance with accounts still sitting untouched in "Needs Review". */
  const accountsResolved = useMemo(() => {
    if (noAccountColumn) return !!singleAccountId || !!singleAccountCreate?.name.trim();
    return effectiveAccountResolutions.every((r) => {
      // 'skip' (manual-testing gap #1) is always immediately decided — same treatment 'existing' gets.
      if (r.suggestion.kind === 'skip') return true;
      if (r.suggestion.kind === 'existing') return !!r.suggestion.accountId;
      return !!r.suggestion.suggestedName.trim() && accountTouchedSourceNames.has(r.sourceName);
    });
  }, [noAccountColumn, effectiveAccountResolutions, singleAccountId, singleAccountCreate, accountTouchedSourceNames]);

  /** Distinct final accounts, deduped by their EFFECTIVE (live-mirrored) suggestion — a merged card
   *  naturally collapses into the same dedup key as its target here, with no separate "skip merged
   *  cards" special case needed. A 'skip'-kind resolution never creates/references a real account, so
   *  it's excluded from this count entirely (gap #1). */
  const confirmedAccountCount = useMemo(() => {
    const ids = new Set<string>();
    for (const r of effectiveAccountResolutions) {
      if (r.suggestion.kind === 'skip') continue;
      if (r.suggestion.kind === 'existing') ids.add(`existing:${r.suggestion.accountId}`);
      else ids.add(`create:${r.suggestion.suggestedName.trim().toLowerCase()}|${r.suggestion.suggestedType}`);
    }
    return ids.size;
  }, [effectiveAccountResolutions]);

  /** Source account names resolved as `'skip'` (manual-testing gap #1) — every row belonging to one of
   *  these must be filtered out of the pipeline entirely BEFORE Categories-stage grouping, since it's
   *  never being imported and shouldn't need a category resolved at all. */
  const skippedAccountSourceNames = useMemo(
    () => new Set(effectiveAccountResolutions.filter((r) => r.suggestion.kind === 'skip').map((r) => r.sourceName)),
    [effectiveAccountResolutions]
  );
  const isRowAccountSkipped = useCallback(
    (row: ParsedRow): boolean => !!row.account && skippedAccountSourceNames.has(row.account),
    [skippedAccountSourceNames]
  );
  /** How many parsed rows belong to a skipped account — surfaced on the Done step ("N transactions
   *  excluded — account skipped") so this is never silent, same principle as the existing discarded/
   *  still-unresolved counts. */
  const accountSkippedRowCount = useMemo(
    () => parsedRows.filter(isRowAccountSkipped).length,
    [parsedRows, isRowAccountSkipped]
  );

  // ─── Categories stage — direction-aware resolution + counterparty sub-split ──────────────────────

  /** `parsedRows` with every skipped-account row filtered out — the earliest sensible point to scope
   *  the pipeline down, since `resolveCategoriesDirectional`'s OUTPUT (a suggestion per distinct
   *  `${sourceName}::${type}`) has no per-row identity of its own; nothing downstream should ever see a
   *  category-resolution row for a source category whose rows all belong to a skipped account. Row
   *  INDEX stability into the original `parsedRows` (relied on everywhere else — `rowOverrides`,
   *  `transferPairs`, IOU maps, etc.) is preserved separately, via `rowIndicesByDirectionalKey` below
   *  excluding skipped-account rows rather than this filtered copy ever being used for anything that
   *  returns indices. */
  const rowsForCategorization = useMemo(
    () => (skippedAccountSourceNames.size === 0 ? parsedRows : parsedRows.filter((row) => !isRowAccountSkipped(row))),
    [parsedRows, skippedAccountSourceNames, isRowAccountSkipped]
  );

  const directionalResolutions: DirectionalCategoryResolution[] = useMemo(
    () => resolveCategoriesDirectional(rowsForCategorization, categories),
    [rowsForCategorization, categories]
  );

  useEffect(() => {
    if (directionalResolutions.length === 0) return;
    const sourceNames = [...new Set(directionalResolutions.map((r) => r.sourceName))];
    void loadRememberedSuggestions(sourceNames, categories).then(setRememberedSuggestions);
    // `directionalResolutions` is itself a `useMemo` derived from exactly `[parsedRows, categories]`
    // (see above), so listing it here fires this effect on precisely the same occasions the previous
    // `[parsedRows, categories]`-only list did — no extra recomputation, just a correct dependency list
    // instead of a suppressed lint warning.
  }, [directionalResolutions, categories]);

  /** Every NON-skipped-account row's `${sourceName}::${type}` key, computed once per `parsedRows`
   *  change (code-review perf fix) — `categoryRowGroups` below used to re-scan the ENTIRE `parsedRows`
   *  array once PER resolution (both its own non-split branch's `.forEach`, and internally inside
   *  `splitByCounterparty` for every split-eligible resolution) — O(rows × resolutions), flagged as
   *  potentially slow on the ~9,384-row/79-category real file this whole redesign was built against.
   *  This single pass groups every row's index by its key up front, so both the non-split branch (an
   *  O(1) map lookup instead of an O(rows) scan) and each `splitByCounterparty` call (via its new
   *  optional `candidateIndices` param, scanning only that resolution's own rows instead of every row in
   *  the file) become O(rows) TOTAL across the whole computation, not O(rows) EACH. Indices are into the
   *  ORIGINAL `parsedRows` (never `rowsForCategorization`) — a skipped-account row is simply never added
   *  here at all (gap #1), which is what keeps it out of every Categories-stage row-group without ever
   *  needing to renumber indices anywhere else in the pipeline. */
  const rowIndicesByDirectionalKey = useMemo(() => {
    const map = new Map<string, number[]>();
    parsedRows.forEach((row, i) => {
      if (isRowAccountSkipped(row)) return;
      const key = `${row.categoryName.trim() || 'Other'}::${row.type}`;
      const list = map.get(key);
      if (list) list.push(i);
      else map.set(key, [i]);
    });
    return map;
  }, [parsedRows, isRowAccountSkipped]);

  /** One row per Categories-stage-resolvable unit — a plain `DirectionalCategoryResolution`, or (for a
   *  transfer/IOU-suspect category) its `CounterpartyGroup` children, with any manually-corrected
   *  ("move to residual") groups folded back into the one residual row. */
  const categoryRowGroups: CategoryRowGroup[] = useMemo(() => {
    const groups: CategoryRowGroup[] = [];
    for (const r of directionalResolutions) {
      if (shouldSplitByCounterparty(r)) {
        const candidateIndices = rowIndicesByDirectionalKey.get(r.key) ?? [];
        const subGroups = splitByCounterparty(parsedRows, r, persons, candidateIndices);
        const residualIndices: number[] = [];
        for (const g of subGroups) {
          const fullKey = `${g.parentKey}::${g.groupKey}`;
          if (g.groupKey === RESIDUAL_COUNTERPARTY_GROUP_KEY || manuallyResidualGroupKeys.has(fullKey)) {
            residualIndices.push(...g.rowIndices);
            continue;
          }
          groups.push({
            fullKey,
            label: g.displayLabel,
            parentSourceName: r.sourceName,
            type: r.type,
            count: g.count,
            rowIndices: g.rowIndices,
            isSplitChild: true,
            isTransferSuspect: r.isTransferSuspect,
            isIouSuspect: r.isIouSuspect,
            isInvestmentMovement: r.isInvestmentMovement,
            confidence: g.confidence,
            ...(g.personMatch && { personMatch: g.personMatch }),
            defaultSuggestion: g.suggestion,
            ...(g.personMatch?.personName || g.confidence === 'low'
              ? { counterpartySeedName: g.personMatch?.personName ?? g.displayLabel }
              : {})
          });
        }
        if (residualIndices.length > 0) {
          groups.push({
            fullKey: `${r.key}::${RESIDUAL_COUNTERPARTY_GROUP_KEY}`,
            label: RESIDUAL_COUNTERPARTY_LABEL,
            parentSourceName: r.sourceName,
            type: r.type,
            count: residualIndices.length,
            rowIndices: residualIndices,
            isSplitChild: true,
            isTransferSuspect: r.isTransferSuspect,
            isIouSuspect: r.isIouSuspect,
            isInvestmentMovement: r.isInvestmentMovement,
            confidence: 'residual',
            defaultSuggestion: r.suggestion
          });
        }
      } else {
        // O(1) lookup instead of an O(rows) re-scan — see `rowIndicesByDirectionalKey`'s doc comment.
        const rowIndices = rowIndicesByDirectionalKey.get(r.key) ?? [];
        groups.push({
          fullKey: r.key,
          label: r.sourceName,
          parentSourceName: r.sourceName,
          type: r.type,
          count: rowIndices.length,
          rowIndices,
          isSplitChild: false,
          isTransferSuspect: r.isTransferSuspect,
          isIouSuspect: r.isIouSuspect,
          isInvestmentMovement: r.isInvestmentMovement,
          defaultSuggestion: r.suggestion
        });
      }
    }
    return groups;
  }, [directionalResolutions, parsedRows, persons, manuallyResidualGroupKeys, rowIndicesByDirectionalKey]);

  function updateCategoryDecision(fullKey: string, suggestion: CategoryAction) {
    setCategoryDecisions((prev) => new Map(prev).set(fullKey, suggestion));
    setCategoryTouchedKeys((prev) => (prev.has(fullKey) ? prev : new Set(prev).add(fullKey)));
  }

  /** "Looks good, use this" — marks an unconfirmed 'create' suggestion reviewed-and-accepted-as-is,
   *  without changing it. */
  function acknowledgeCategoryDecision(fullKey: string) {
    setCategoryTouchedKeys((prev) => (prev.has(fullKey) ? prev : new Set(prev).add(fullKey)));
  }

  function setCategoryTagForKey(fullKey: string, tag: string) {
    setCategoryTagsByKey((prev) => {
      const next = new Map(prev);
      if (tag) next.set(fullKey, tag);
      else next.delete(fullKey);
      return next;
    });
  }

  function setIouPersonNameForKey(fullKey: string, name: string) {
    setIouPersonNames((prev) => {
      const next = new Map(prev);
      if (name) next.set(fullKey, name);
      else next.delete(fullKey);
      return next;
    });
  }

  /** IOU person name for a PARTIAL-selection apply (2026-08-14, code-review fix) — see
   *  `rowIouPersonNames`' own doc comment for why this must be keyed by row index, not fullKey. */
  function setRowIouPersonNames(rowIndices: number[], name: string) {
    setRowIouPersonNamesState((prev) => {
      const next = new Map(prev);
      for (const i of rowIndices) {
        if (name) next.set(i, name);
        else next.delete(i);
      }
      return next;
    });
  }

  /** "Move to residual" (2026-08-14, redesign §7's correction mechanism, scoped to a whole group — see
   *  `manuallyResidualGroupKeys`'s doc comment). */
  function moveCounterpartyGroupToResidual(fullKey: string) {
    setManuallyResidualGroupKeys((prev) => new Set(prev).add(fullKey));
  }

  function moveRowsToCategory(rowIndices: number[], categoryId: string, categoryName: string) {
    setRowOverrides((prev) => {
      const next = new Map(prev);
      for (const i of rowIndices) next.set(i, { ...next.get(i), categoryId, categoryName });
      return next;
    });
  }

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

  function unpairTransfer(outgoingIndex: number, incomingIndex: number) {
    setUnpairedTransferKeys((prev) => new Set(prev).add(transferPairKey(outgoingIndex, incomingIndex)));
  }

  function unflagDuplicate(rowIndex: number) {
    setUnflaggedDuplicateIndices((prev) => new Set(prev).add(rowIndex));
  }

  function discardRejectedRow(rowIndex: number) {
    setRejectedRows((prev) => prev.filter((r) => r.rowIndex !== rowIndex));
    setDiscardedRejectedRowIndices((prev) => new Set(prev).add(rowIndex));
  }

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

  // ─── Self-account-movement pairing (§7.1 — broader than a plain "transfer-suspect" keyword match) ──

  const transferPairs: TransferPair[] = useMemo(
    () =>
      detectSelfAccountMovementPairs(parsedRows).filter(
        (p) => !unpairedTransferKeys.has(transferPairKey(p.outgoingIndex, p.incomingIndex))
      ),
    [parsedRows, unpairedTransferKeys]
  );

  // ─── Row-action map (keyed by row index — see buildResolvedPreviewRowsByIndex's doc comment for why
  // the old per-sourceName ConfirmedCategoryMap can't represent this new direction/counterparty model) ─

  const rowActions: Map<number, RowAction> = useMemo(() => {
    const actions = new Map<number, RowAction>();
    for (const g of categoryRowGroups) {
      const suggestion = categoryDecisions.get(g.fullKey) ?? g.defaultSuggestion;
      const tag = categoryTagsByKey.get(g.fullKey);
      let action: RowAction;
      if (suggestion.kind === 'existing') {
        action = { categoryId: suggestion.categoryId, categoryName: suggestion.categoryName, ...(tag && { tag }) };
      } else if (suggestion.kind === 'transfer') {
        action = {
          categoryId: suggestion.categoryId,
          categoryName: suggestion.categoryName,
          type: 'transfer',
          ...(suggestion.toAccountId && { toAccountId: suggestion.toAccountId }),
          ...(tag && { tag })
        };
      } else if (suggestion.kind === 'create') {
        // Placeholder id, deduped by draft key — good enough for the live preview; the real id is only
        // created (once per distinct draft key) inside commitAndImport().
        action = {
          categoryId: `preview-cat:${draftCategoryKey(suggestion)}`,
          categoryName: suggestion.suggestedName,
          ...(tag && { tag })
        };
      } else {
        action = { categoryId: '', categoryName: g.label, skip: true, ...(tag && { tag }) };
      }
      for (const i of g.rowIndices) actions.set(i, action);
    }
    // Every skipped-account row (gap #1) — never a member of any `categoryRowGroups` entry above (see
    // `rowIndicesByDirectionalKey`'s doc comment), so without this explicit pass
    // `buildResolvedPreviewRowsByIndex` would fall back to its "no action found" default (`cat-other`,
    // NOT skipped) instead of correctly excluding the row from being written at all.
    if (skippedAccountSourceNames.size > 0) {
      parsedRows.forEach((row, i) => {
        if (isRowAccountSkipped(row)) actions.set(i, { categoryId: '', categoryName: 'Account skipped', skip: true });
      });
    }
    return actions;
  }, [
    categoryRowGroups,
    categoryDecisions,
    categoryTagsByKey,
    parsedRows,
    skippedAccountSourceNames,
    isRowAccountSkipped
  ]);

  const preview: ResolvedPreviewRow[] = useMemo(() => {
    const placeholderAccountIds = new Map<string, string>();
    for (const r of effectiveAccountResolutions) {
      if (r.suggestion.kind === 'create') placeholderAccountIds.set(r.sourceName, `preview-acc:${r.sourceName}`);
    }
    const resolveAccountId = (row: ParsedRow): string => {
      if (row.account) {
        // Redirect a merged card's own raw source name to its target's — see `cardMergeTargets`' doc
        // comment. `placeholderAccountIds` is keyed by sourceName too, so this also looks up the
        // TARGET's placeholder (the card's own placeholder, if any, is never referenced by any row).
        const lookupName = cardMergeTargets.get(row.account) ?? row.account;
        const r = effectiveAccountResolutions.find((a) => a.sourceName === lookupName);
        if (r?.suggestion.kind === 'existing') return r.suggestion.accountId;
        if (r?.suggestion.kind === 'create') return placeholderAccountIds.get(lookupName) ?? '';
      }
      if (singleAccountId) return singleAccountId;
      if (singleAccountCreate?.name.trim()) return 'preview-acc:__single__';
      return '';
    };
    const rows = buildResolvedPreviewRowsByIndex(
      effectiveParsedRows,
      rowActions,
      resolveAccountId,
      existingKeys,
      rowOverrides
    );
    if (unflaggedDuplicateIndices.size === 0) return rows;
    return rows.map((row, i) => (unflaggedDuplicateIndices.has(i) ? { ...row, duplicate: false } : row));
  }, [
    effectiveParsedRows,
    rowActions,
    effectiveAccountResolutions,
    cardMergeTargets,
    singleAccountId,
    singleAccountCreate,
    existingKeys,
    rowOverrides,
    unflaggedDuplicateIndices
  ]);

  const confirmedTransferPairs = useMemo(
    () =>
      transferPairs.filter((p) => {
        const out = preview[p.outgoingIndex];
        const inc = preview[p.incomingIndex];
        return !!out && !!inc && !out.duplicate && !out.skipped && !inc.duplicate && !inc.skipped;
      }),
    [transferPairs, preview]
  );

  /** Group fullKeys whose 'transfer' decision needs no explicit `toAccountId` because every one of its
   *  rows is already either a duplicate or part of a confirmed transfer pair — same reasoning as the
   *  pre-Chunk-B `fullyAutoResolvedTransferSources`, just keyed by fullKey now. */
  const fullyAutoResolvedTransferKeys = useMemo(() => {
    const pairedIndices = new Set<number>();
    for (const p of confirmedTransferPairs) {
      pairedIndices.add(p.outgoingIndex);
      pairedIndices.add(p.incomingIndex);
    }
    const result = new Set<string>();
    for (const g of categoryRowGroups) {
      const suggestion = categoryDecisions.get(g.fullKey) ?? g.defaultSuggestion;
      if (suggestion.kind !== 'transfer' || suggestion.toAccountId) continue;
      if (g.rowIndices.length === 0) continue;
      const allAutoHandled = g.rowIndices.every((i) => pairedIndices.has(i) || preview[i]?.duplicate);
      if (allAutoHandled) result.add(g.fullKey);
    }
    return result;
  }, [categoryRowGroups, categoryDecisions, confirmedTransferPairs, preview]);

  /** Every Categories-stage row-group, enriched with its current effective decision + readiness — the
   *  single shape both `CategoriesStage.tsx` and `TransactionsStage.tsx` render from. */
  const transactionsRowGroups: TransactionsRowGroup[] = useMemo(
    () =>
      categoryRowGroups.map((g) => {
        const effectiveSuggestion = categoryDecisions.get(g.fullKey) ?? g.defaultSuggestion;
        const resolution: DirectionalCategoryResolution = {
          key: g.fullKey,
          sourceName: g.parentSourceName,
          type: g.type,
          count: g.count,
          suggestion: effectiveSuggestion,
          isTransferSuspect: g.isTransferSuspect,
          isIouSuspect: g.isIouSuspect,
          isInvestmentMovement: g.isInvestmentMovement
        };
        const decided = isDirectionalCategoryResolutionDecided(
          resolution,
          categoryTouchedKeys,
          fullyAutoResolvedTransferKeys
        );
        const iouSatisfied =
          !(
            effectiveSuggestion.kind === 'existing' && IOU_MANDATORY_CATEGORY_IDS.has(effectiveSuggestion.categoryId)
          ) || !!iouPersonNames.get(g.fullKey)?.trim();
        return { ...g, effectiveSuggestion, decided, transactionsReady: decided && iouSatisfied };
      }),
    [categoryRowGroups, categoryDecisions, categoryTouchedKeys, fullyAutoResolvedTransferKeys, iouPersonNames]
  );

  const categoriesDecidedCount = useMemo(
    () => transactionsRowGroups.filter((g) => g.decided).length,
    [transactionsRowGroups]
  );
  const categoriesAllDecided = transactionsRowGroups.every((g) => g.decided);

  const carryForwardExcludedIndices = useMemo(() => identifyRedundantCarryForwardRows(parsedRows), [parsedRows]);
  const carryForwardExcludedRows = useMemo(
    () => parsedRows.filter((_, i) => carryForwardExcludedIndices.has(i)),
    [parsedRows, carryForwardExcludedIndices]
  );

  /** Per-row triage — used both by `AccountsStage.tsx`'s per-account stats (decided only by category
   *  KIND, not IOU-completeness — irrelevant that early) and as `groupRowsForTransactionsStage`'s own
   *  duplicate-detection input. */
  const fullKeyByRowIndex = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of categoryRowGroups) for (const i of g.rowIndices) map.set(i, g.fullKey);
    return map;
  }, [categoryRowGroups]);
  const transactionsRowGroupByKey = useMemo(
    () => new Map(transactionsRowGroups.map((g) => [g.fullKey, g])),
    [transactionsRowGroups]
  );
  const rowTriage: RowTriage[] = useMemo(() => {
    return preview.map((row, i) => {
      if (row.duplicate) return 'duplicate';
      if (rowOverrides.has(i)) return 'ready';
      const fullKey = fullKeyByRowIndex.get(i);
      const group = fullKey ? transactionsRowGroupByKey.get(fullKey) : undefined;
      return group && !group.decided ? 'attention' : 'ready';
    });
  }, [preview, rowOverrides, fullKeyByRowIndex, transactionsRowGroupByKey]);

  /** Whether row `i` is genuinely eligible to be WRITTEN this run (2026-08-14, partial-commit gate fix)
   *  — an override is itself an explicit decision (same rule `rowTriage` uses); otherwise the row's own
   *  group must be `transactionsReady` (kind decided AND, if IOU-mandatory, a person supplied). This is
   *  DELIBERATELY distinct from `rowTriage`'s own 'attention'/'ready' (which stays IOU-agnostic on
   *  purpose — see that memo's doc comment) since THIS check is what actually gates `readyRows`/
   *  `commitAndImport()` itself, where IOU-completeness genuinely must matter (no ledger entry can be
   *  written for a supposedly-lent/borrowed row with no person). A row belonging to NO group at all
   *  (e.g. already excluded elsewhere) is treated as writable — this check only ever narrows, never
   *  overrides, the existing duplicate/skipped/carry-forward exclusions. */
  const isRowWritable = useCallback(
    (i: number): boolean => {
      if (rowOverrides.has(i)) return true;
      const fullKey = fullKeyByRowIndex.get(i);
      const group = fullKey ? transactionsRowGroupByKey.get(fullKey) : undefined;
      return !group || group.transactionsReady;
    },
    [rowOverrides, fullKeyByRowIndex, transactionsRowGroupByKey]
  );

  const carryForwardExcludedSet = carryForwardExcludedIndices;
  /** Rows that will ACTUALLY be written if commit runs right now (2026-08-14, partial-commit gate fix —
   *  manual-testing gap: the commit path used to attempt to write EVERY row regardless of whether its
   *  category was ever confirmed, masked only by the old all-or-nothing button gate that never let
   *  `commitAndImport()` run at all while anything was undecided). Adding `isRowWritable` here is what
   *  makes `readyCount`/`actualTransactionCount` — and therefore the button's own "Import N now" label
   *  and disabled state — correctly reflect ONLY what this run will really write; `commitAndImport()`
   *  itself applies the identical check when building `finalRowActions`, so the two can never drift
   *  apart. */
  const readyRows = useMemo(
    () => preview.filter((r, i) => !r.duplicate && !r.skipped && !carryForwardExcludedSet.has(i) && isRowWritable(i)),
    [preview, carryForwardExcludedSet, isRowWritable]
  );
  const readyCount = readyRows.length;
  const totalRowsRead = parsedRows.length + rejectedRows.length;
  const actualTransactionCount = readyCount - confirmedTransferPairs.length;

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

  // ─── Transactions stage — per-tile grouping (buckets: Needs input / Staged / Skipped / Already
  // imported), built once Categories has already resolved every group above ──────────────────────────

  const tileForExistingCategoryId = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of transactionsRowGroups) {
      if (g.effectiveSuggestion.kind === 'existing' && !map.has(g.effectiveSuggestion.categoryId)) {
        map.set(g.effectiveSuggestion.categoryId, g.fullKey);
      }
    }
    return map;
  }, [transactionsRowGroups]);

  const transactionsGrouping = useMemo(
    () =>
      groupRowsForTransactionsStage(
        parsedRows,
        rowTriage,
        confirmedTransferPairs,
        categoryRowGroups.map((g) => ({ fullKey: g.fullKey, rowIndices: g.rowIndices })),
        tileForExistingCategoryId,
        rowOverrides
      ),
    [parsedRows, rowTriage, confirmedTransferPairs, categoryRowGroups, tileForExistingCategoryId, rowOverrides]
  );

  /** Rows genuinely still needing attention — a group not yet `transactionsReady` (and not itself
   *  skipped), counted by however many of ITS rows actually remain in this stage's grouping (excludes
   *  any already claimed by a transfer pair or moved elsewhere). 2026-08-14 (manual-testing gap — the
   *  commit-gate bug): this is a ROW count, deliberately — it must NEVER gate `commitAndImport` on its
   *  own anymore (§3.2's whole point is that "needs input" rows are left OUT of a run, not a reason to
   *  block the rest of it); see `TransactionsStage.tsx`'s button, which now only disables on "nothing at
   *  all is ready to write". Also the bucket-badge/summary-text count-MISMATCH root cause found in
   *  manual testing: `TransactionsStage.tsx`'s "Needs your input" bucket badge used to show
   *  `needsInputGroups.length` (a TILE/category count) right next to this same value used in the
   *  blocking message text (a ROW count) — two different units shown side by side with no indication
   *  they measured different things, not a double-counting bug. Both now render from this one row-count
   *  value. */
  const attentionCount = useMemo(() => {
    let count = 0;
    for (const g of transactionsRowGroups) {
      if (g.effectiveSuggestion.kind === 'skip' || g.transactionsReady) continue;
      count += (transactionsGrouping.rowsByFullKey.get(g.fullKey) ?? []).length;
    }
    return count;
  }, [transactionsRowGroups, transactionsGrouping]);

  const skippedCount = useMemo(() => {
    let count = 0;
    for (const g of transactionsRowGroups) {
      if (g.effectiveSuggestion.kind !== 'skip') continue;
      count += (transactionsGrouping.rowsByFullKey.get(g.fullKey) ?? []).length;
    }
    return count;
  }, [transactionsRowGroups, transactionsGrouping]);

  /** Row count for the "Staged" bucket badge (2026-08-14, same bucket-badge/row-count consistency fix
   *  as `attentionCount`/`skippedCount` above) — every `transactionsReady`, non-skip group's rows, plus
   *  every synthetic ("moved row, no existing group") tile's rows, which are always ready by
   *  definition (a row-level override is itself an explicit decision). */
  const stagedRowCount = useMemo(() => {
    let count = 0;
    for (const g of transactionsRowGroups) {
      if (g.effectiveSuggestion.kind === 'skip' || !g.transactionsReady) continue;
      count += (transactionsGrouping.rowsByFullKey.get(g.fullKey) ?? []).length;
    }
    for (const key of transactionsGrouping.syntheticTiles.keys()) {
      count += (transactionsGrouping.rowsByFullKey.get(key) ?? []).length;
    }
    return count;
  }, [transactionsRowGroups, transactionsGrouping]);

  const duplicateCount = transactionsGrouping.duplicateRows.length;

  /** Creates any brand-new categories/accounts the user confirmed (explicit, one-time, never silent —
   *  the ONLY point in the whole wizard that writes to the DB before this), writes the IOU
   *  `ledger_entries` for any IOU-mandatory-category row, then writes the import batch. */
  /** Enters the 'done' step's Pre-start sub-state (2026-08-14, Import Progress screen) — reached the
   *  instant Transactions stage's Import button is tapped, before anything is written. Replaces that
   *  button's old direct `void commitAndImport()` call, which used to start writing immediately with no
   *  guard against navigating away mid-write (a real bug found in testing). The actual write now only
   *  starts once the new screen's own "Start Import" button calls `commitAndImport()` below. */
  function enterImportProgress() {
    cancelRequestedRef.current = false;
    setImportPhase('preStart');
    setImportProgress({ completed: 0, total: 0 });
    setImportCancelled(false);
    setCancelledRemainingCount(0);
    setImportError(null);
    setStep('done');
  }

  /** Confirmed via the Importing sub-state's Cancel dialog — stops the write loop before its next row,
   *  checked inside `commitAndImport`'s own `shouldCancel` closure below. A ref (not state) so the
   *  already-running loop reads the latest value immediately, without needing `commitAndImport` itself
   *  to be re-created. */
  function requestCancelImport() {
    cancelRequestedRef.current = true;
  }

  async function commitAndImport() {
    setImporting(true);
    setImportPhase('importing');
    setImportStartedAt(Date.now());
    setImportError(null);

    // Mutable, read back from the `catch` block below (severe bug found in verification, 2026-08-14) —
    // if something throws partway through, whatever these already reflect at that point (e.g. a
    // successful `writeImportBatchDetailed` result, even if a LATER step like the IOU ledger loop is
    // what actually throws) must still be reported accurately, not defaulted back to zero. Whatever
    // already wrote successfully stays written either way — this function never rolls anything back.
    let succeededCount = 0;
    let failedRows: FailedImportRow[] = [];
    let writtenActivityLogId: string | null = null;
    let wasCancelled = false;
    let totalWritable = 0;
    let lastReportedCompleted = 0;
    // Rows excluded because their account was a not-yet-confirmed 'create' resolution (2026-08-14,
    // manual-testing finding, part b) — see `notReadyAccountSourceNames` below. Folded into
    // `stillUnresolvedCount` (both the success and catch paths) so these rows are never silently dropped
    // from the Done summary — same reliability rule every other exclusion in this function follows.
    let notReadyAccountRowCount = 0;

    try {
      // 1. Draft categories — deduped by draftCategoryKey (§3.1's mechanic, extended to categories:
      // multiple groups independently choosing 'create' with the same name+group collapse into ONE real
      // category, mirroring accounts' own createdAccountsByKey dedup below). Gated on `transactionsReady`
      // (2026-08-14, partial-commit write-path fix) — a group the user never actually confirmed must
      // never get a real category created for it just because commit ran on a batch where OTHER groups
      // happened to be ready; its rows are excluded entirely below (see the `finalRowActions` loop) and
      // wait for a later re-upload pass instead, per §3.2.
      const createdCategoryIdByDraftKey = new Map<string, string>();
      const createdCategoryIdByFullKey = new Map<string, string>();
      for (const g of transactionsRowGroups) {
        if (g.effectiveSuggestion.kind !== 'create' || !g.transactionsReady) continue;
        const draftKey = draftCategoryKey(g.effectiveSuggestion);
        let id = createdCategoryIdByDraftKey.get(draftKey);
        if (!id) {
          id = crypto.randomUUID();
          const now = Date.now();
          await expenseCategoriesRepo.put({
            id,
            name: g.effectiveSuggestion.suggestedName,
            icon: 'ti-tag',
            color: '#6b7280',
            isDefault: false,
            intentGroup: g.effectiveSuggestion.suggestedIntentGroup,
            createdAt: now
          });
          createdCategoryIdByDraftKey.set(draftKey, id);
        }
        createdCategoryIdByFullKey.set(g.fullKey, id);
      }

      // Fire-and-forget — must never block or delay the actual import write below. Only ready groups are
      // worth remembering (2026-08-14) — nothing meaningful was actually confirmed for a held-back group.
      const readyGroupsForMemory = transactionsRowGroups.filter((g) => g.transactionsReady);
      void rememberCategoryChoices(
        readyGroupsForMemory.map((g) => ({ sourceName: g.parentSourceName, suggestion: g.effectiveSuggestion })),
        (sourceName) => {
          const g = readyGroupsForMemory.find((x) => x.parentSourceName === sourceName);
          if (!g) return undefined;
          if (g.effectiveSuggestion.kind === 'existing') {
            return { categoryId: g.effectiveSuggestion.categoryId, categoryName: g.effectiveSuggestion.categoryName };
          }
          if (g.effectiveSuggestion.kind === 'create') {
            const id = createdCategoryIdByFullKey.get(g.fullKey);
            return id ? { categoryId: id, categoryName: g.effectiveSuggestion.suggestedName } : undefined;
          }
          return undefined;
        }
      );

      // 2. Accounts — iterates `effectiveAccountResolutions` (not raw `accountResolutions`), so a merged
      // card's LIVE-mirrored suggestion (see `effectiveAccountResolutions`' doc comment) shares the exact
      // same dedup key as its target below, collapsing them into ONE real account write — no separate
      // "skip merged cards" special case needed, since the existing name+type dedup already handles it.
      //
      // GATED on `accountTouchedSourceNames.has(r.sourceName)` for a `'create'` kind (2026-08-14,
      // manual-testing finding) — mirrors the category-creation loop's own `g.transactionsReady` gate
      // directly above it exactly: a `'create'` account the user never actually looked at must never get
      // a real account created for it just because commit ran on a batch where OTHER accounts happened to
      // be ready. Defense in depth, not the only guard — `accountsResolved` (this file, the Accounts
      // stage's own advance-gate) was ALSO fixed the same day to require this, which should already
      // prevent reaching commit with an unready account in the normal flow. Relying on only one layer is
      // exactly what caused this same bug's category-side equivalent (manual-testing gap #5) — this
      // write-path gate exists independently, same reasoning. A not-ready account's rows are excluded from
      // this write below (see the `notReadyAccountSourceNames` pass near `finalRowActions`), deferred to a
      // later re-upload pass — never silently written with no real account, and never silently dropped
      // either (folded into `stillUnresolvedCount`).
      const createdAccountIds = new Map<string, string>();
      const createdAccountsByKey = new Map<string, string>();
      const notReadyAccountSourceNames = new Set<string>();
      for (const r of effectiveAccountResolutions) {
        if (r.suggestion.kind !== 'create') continue;
        if (!accountTouchedSourceNames.has(r.sourceName)) {
          notReadyAccountSourceNames.add(r.sourceName);
          continue;
        }
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
          // `effectiveAccountResolutions` (not raw) — a merged card's suggestion is only correctly
          // 'existing'/its real target id via the live mirror; the card's own raw entry is never mutated
          // (see `acceptCardAccountMerge`'s doc comment) and would otherwise still look like an unrelated
          // 'create'.
          const r = effectiveAccountResolutions.find((a) => a.sourceName === row.account);
          if (r?.suggestion.kind === 'existing') return r.suggestion.accountId;
          if (r?.suggestion.kind === 'create') return createdAccountIds.get(row.account) ?? '';
        }
        return resolvedSingleAccountId ?? '';
      };

      // 3. Final row actions (real category ids, not preview placeholders). GATED on `g.transactionsReady`
      // (2026-08-14, partial-commit write-path fix — the actual bug manual testing found): a group the
      // user never confirmed — an untouched 'create' guess, an unresolved counterparty sub-split, a
      // 'transfer' with no destination account, or an 'existing' IOU-mandatory category still missing its
      // person — must NEVER be written using its own (unconfirmed) suggestion. Previously this loop wrote
      // every group's `effectiveSuggestion` unconditionally, regardless of readiness; the only reason
      // nothing broke visibly is that the OLD commit button was disabled while ANY group was unready, so
      // this path was never actually reachable with an unready group present. A row-level `RowOverride`
      // (bulk "move N checked rows to an existing category") still wins regardless — that's applied by
      // `buildResolvedPreviewRowsByIndex` itself afterward, independent of what's set here.
      const finalRowActions = new Map<number, RowAction>();
      for (const g of transactionsRowGroups) {
        const tag = categoryTagsByKey.get(g.fullKey);
        let action: RowAction;
        if (!g.transactionsReady) {
          // Left out of THIS run entirely (§3.2) — picked up on a later re-upload pass instead.
          action = { categoryId: '', categoryName: 'Needs review — not yet resolved', skip: true };
        } else if (g.effectiveSuggestion.kind === 'existing') {
          action = {
            categoryId: g.effectiveSuggestion.categoryId,
            categoryName: g.effectiveSuggestion.categoryName,
            ...(tag && { tag })
          };
        } else if (g.effectiveSuggestion.kind === 'transfer') {
          action = {
            categoryId: g.effectiveSuggestion.categoryId,
            categoryName: g.effectiveSuggestion.categoryName,
            type: 'transfer',
            ...(g.effectiveSuggestion.toAccountId && { toAccountId: g.effectiveSuggestion.toAccountId }),
            ...(tag && { tag })
          };
        } else if (g.effectiveSuggestion.kind === 'create') {
          action = {
            categoryId: createdCategoryIdByFullKey.get(g.fullKey) ?? '',
            categoryName: g.effectiveSuggestion.suggestedName,
            ...(tag && { tag })
          };
        } else {
          action = { categoryId: '', categoryName: g.label, skip: true, ...(tag && { tag }) };
        }
        for (const i of g.rowIndices) finalRowActions.set(i, action);
      }
      // Same explicit skip pass as the live-preview `rowActions` memo above — a skipped-account row is
      // never a member of `transactionsRowGroups` and must never silently fall back to a real category.
      // ALSO excludes a not-yet-confirmed 'create' account's rows (2026-08-14, manual-testing finding,
      // part b — see `notReadyAccountSourceNames` above): without this, a row whose account never got a
      // real id created for it would fall back to `resolveAccountId`'s own `?? ''` default and get
      // written with an EMPTY accountId instead of being excluded — deferred to a later re-upload pass
      // instead, exactly like an unready category's rows already are.
      parsedRows.forEach((row, i) => {
        if (isRowAccountSkipped(row)) {
          finalRowActions.set(i, { categoryId: '', categoryName: 'Account skipped', skip: true });
        } else if (row.account && notReadyAccountSourceNames.has(row.account)) {
          finalRowActions.set(i, { categoryId: '', categoryName: 'Account not yet confirmed', skip: true });
          notReadyAccountRowCount++;
        }
      });

      // IOU info, keyed by dedupKey ref (survives `applyConfirmedTransferPairs`, which spreads the
      // outgoing leg's fields) — a SEPARATE pass over every row (not `g.rowIndices`), because a row's
      // actual destination category can differ from its group's own decision: `RowOverride` (a
      // partial-selection "move N checked rows to an existing category" apply) always wins, exactly the
      // same precedence `buildResolvedPreviewRowsByIndex` itself applies. Without this, a row moved OUT of
      // an IOU-mandatory group via an override still got a phantom ledger entry (the group-level check
      // fired regardless of the override), and a row moved INTO an IOU-mandatory category via an override
      // never got one at all (it isn't a member of that category's own `g.rowIndices`) — found in review.
      const iouInfoByRef = new Map<string, { personName: string; kind: 'lent' | 'borrowed' }>();
      parsedRows.forEach((row, i) => {
        const override = rowOverrides.get(i);
        const effectiveCategoryId = override?.categoryId ?? finalRowActions.get(i)?.categoryId;
        if (!effectiveCategoryId || !IOU_MANDATORY_CATEGORY_IDS.has(effectiveCategoryId)) return;
        // A category-move override never changes the row's own expense/income direction — same rule
        // `buildResolvedPreviewRowsByIndex` uses for `type`.
        const kind: 'lent' | 'borrowed' = row.type === 'income' ? 'borrowed' : 'lent';
        // An overridden row's person comes from its own per-row capture (`rowIouPersonNames`, set by the
        // partial-selection apply that created this exact override) — the group-level `iouPersonNames`
        // value belongs to whichever OTHER rows are still ungrouped members, not to this one.
        const personName = override?.categoryId
          ? rowIouPersonNames.get(i)?.trim()
          : iouPersonNames.get(fullKeyByRowIndex.get(i) ?? '')?.trim();
        if (!personName) return;
        iouInfoByRef.set(dedupKey(row.date, row.amount, row.description), { personName, kind });
      });

      const finalRows = buildResolvedPreviewRowsByIndex(
        effectiveParsedRows,
        finalRowActions,
        resolveAccountId,
        existingKeys,
        rowOverrides
      );
      const unflaggedRows =
        unflaggedDuplicateIndices.size === 0
          ? finalRows
          : finalRows.map((row, i) => (unflaggedDuplicateIndices.has(i) ? { ...row, duplicate: false } : row));

      // Redundant carry-forward rows must never be written — tracked by object reference (not index)
      // since applyConfirmedTransferPairs below reorders the array.
      const carryForwardExcludedRowRefs = new Set(unflaggedRows.filter((_, i) => carryForwardExcludedIndices.has(i)));
      const rowsToWrite = applyConfirmedTransferPairs(unflaggedRows, confirmedTransferPairs).filter(
        (row) => !carryForwardExcludedRowRefs.has(row)
      );

      // Live progress + cancellation (2026-08-14, Import Progress screen) — `totalWritable` matches
      // exactly what `writeRows` itself will attempt (duplicate/skipped rows excluded, never counted at
      // all). `lastReportedCompleted` is read back below to compute how many rows were never attempted
      // if this run gets cancelled — NOT `result.succeededCount`, since a genuine per-row write failure
      // before the cancel point must not also get double-counted as "still remaining".
      totalWritable = rowsToWrite.filter((row) => !row.duplicate && !row.skipped).length;
      setImportProgress({ completed: 0, total: totalWritable });
      const result = await writeImportBatchDetailed(rowsToWrite, {
        onProgress: (completed, total) => {
          lastReportedCompleted = completed;
          setImportProgress({ completed, total });
        },
        shouldCancel: () => cancelRequestedRef.current
      });
      succeededCount = result.succeededCount;
      failedRows = result.failed;
      writtenActivityLogId = result.activityLogId;
      wasCancelled = result.cancelled;
      setImportCancelled(wasCancelled);
      setCancelledRemainingCount(wasCancelled ? totalWritable - lastReportedCompleted : 0);

      // IOU (Lent/Borrowed) — commit-time Person resolution + ledger_entries write, mirroring
      // useBankImport.ts's identical commit-time equivalent (2026-08-14, redesign §9.6).
      if (iouInfoByRef.size > 0) {
        const now = Date.now();
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
        for (const { row, expenseId } of result.succeededRows) {
          const info = iouInfoByRef.get(row.sourceRef);
          if (!info) continue;
          const person = await resolvePerson(info.personName);
          await ledgerEntriesRepo.put({
            id: crypto.randomUUID(),
            personId: person.id,
            kind: info.kind,
            amount: row.amount,
            date: row.date,
            origin: 'expense',
            linkedTxnId: expenseId,
            createdAt: now,
            updatedAt: now,
            ...(row.description && { description: row.description })
          });
        }
      }

      setImportResult({ succeededCount, failed: failedRows });
      setActivityLogId(writtenActivityLogId);
      // Per §3.2 — only "Staged"/"Skipped" rows were ever written; a "Needs input" row (attentionCount)
      // and any still-broken rejected row are left for a later re-upload pass, never silently dropped.
      setDoneSummary({
        discardedCount: discardedRejectedRowIndices.size,
        stillUnresolvedCount: attentionCount + rejectedRows.length + notReadyAccountRowCount,
        accountSkippedCount: accountSkippedRowCount
      });
      if (succeededCount > 0) notifyTxnChanged();
    } catch (err) {
      // Severe bug found in verification (2026-08-14) — this function used to have NO try/catch at all;
      // an unhandled throw anywhere above (a `repo.put()` for category/account/IOU-person creation
      // failing, or any other bug in these loops) left `importPhase` stuck at `'importing'` forever —
      // exactly the phase back-navigation is locked on everywhere (header, Android hardware back, swipe
      // gesture) — with literally no way to leave short of force-quitting the app. Never silently
      // swallowed (this repo's reliability rule): `importError` surfaces a distinct, highest-priority
      // "something went wrong" framing on the Complete state (see `DoneStep.tsx`). Whatever succeeded
      // before the throw (tracked in the mutable variables above as the run progresses, not just
      // defaulted to zero) stays written and is still reported accurately — this function has never
      // rolled anything back, on this path either.
      setImportResult({ succeededCount, failed: failedRows });
      setActivityLogId(writtenActivityLogId);
      setImportCancelled(wasCancelled);
      setCancelledRemainingCount(wasCancelled ? totalWritable - lastReportedCompleted : 0);
      setDoneSummary({
        discardedCount: discardedRejectedRowIndices.size,
        stillUnresolvedCount: attentionCount + rejectedRows.length + notReadyAccountRowCount,
        accountSkippedCount: accountSkippedRowCount
      });
      setImportError(err instanceof Error ? err.message : 'Something unexpected went wrong while importing.');
      if (succeededCount > 0) notifyTxnChanged();
    } finally {
      setImporting(false);
      // Always released, whether commit succeeded, was cancelled, or threw — `finally` is exactly what
      // guarantees this fires on every path, closing off the "stuck on Importing forever" bug at its
      // root rather than only patching the specific path that was found. Already on the 'done' step
      // (`enterImportProgress` moved there before this ever started running), so this is only ever
      // advancing its own internal sub-state, never `setStep` again.
      setImportPhase('complete');
    }
  }

  /** Retries just the rows that failed to write last time. Known limitation: an IOU-mandatory row that
   *  fails and is later retried here does NOT get a second ledger_entries write attempt (the IOU info
   *  map only exists inside `commitAndImport`'s own closure) — flagged as a real gap, not fixed in this
   *  chunk given how rare "transient write failure + IOU row" double-edge is in practice. */
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

  function reportUploadError(message: string) {
    setParseError(message);
  }

  return {
    format,
    setFormat,
    step,
    setStep,
    parseError,
    reportUploadError,
    header,
    mapping,
    parsedRows,
    rejectedRows,
    discardedCount: discardedRejectedRowIndices.size,
    discardRejectedRow,
    fixRejectedRow,

    // Externally, "the account resolutions" means the effective (live-mirrored) view — see
    // `effectiveAccountResolutions`' doc comment. `updateAccountResolution` below still writes to the
    // raw state directly (by sourceName), which is exactly right: editing any row, including a merged
    // card's own displayed (mirrored) row, always targets ITS OWN raw entry.
    accountResolutions: effectiveAccountResolutions,
    cardMergeSuggestions,
    cardMergeTargets,
    acceptCardAccountMerge,
    dismissCardAccountMerge,
    unmergeCardAccount,
    noAccountColumn,
    singleAccountId,
    setSingleAccountId,
    singleAccountCreate,
    setSingleAccountCreate,
    accountsResolved,
    confirmedAccountCount,
    updateAccountResolution,
    accountTouchedSourceNames,
    acknowledgeAccountResolution,

    categories,
    accounts,
    persons,
    txnCountByCategory,
    categoriesLoadError,
    retryLoadReferenceData: loadReferenceData,

    categoryRowGroups,
    transactionsRowGroups,
    categoriesDecidedCount,
    categoriesAllDecided,
    rememberedSuggestions,
    updateCategoryDecision,
    acknowledgeCategoryDecision,
    categoryTagsByKey,
    setCategoryTagForKey,
    iouPersonNames,
    setIouPersonNameForKey,
    rowIouPersonNames,
    setRowIouPersonNames,
    moveCounterpartyGroupToResidual,

    rowOverrides,
    moveRowsToCategory,
    tagRows,
    unflagDuplicate,
    transactionsGrouping,
    transferPairs: displayTransferPairs,
    unpairTransfer,

    preview,
    rowTriage,
    readyRows,
    readyCount,
    attentionCount,
    duplicateCount,
    skippedCount,
    stagedRowCount,
    carryForwardExcludedRows,
    totalRowsRead,
    actualTransactionCount,

    importing,
    importResult,
    activityLogId,
    undone,
    doneSummary,

    // Import Progress screen (2026-08-14, redesign §14 item 8) — see `ImportPhase`'s own doc comment.
    importPhase,
    importProgress,
    importStartedAt,
    importCancelled,
    cancelledRemainingCount,
    importError,
    enterImportProgress,
    requestCancelImport,

    importFromText,
    confirmMapping,
    commitAndImport,
    retryFailed,
    undoImport
  };
}
