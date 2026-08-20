import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  expenseCategoriesRepo,
  expensesRepo,
  accountsRepo,
  personsRepo,
  ledgerEntriesRepo,
  hashtagsRepo
} from '@/core/db/repositories';
import type { ExpenseCategory, Account, AccountType, Person, Expense } from '@/core/db/types';
import { IOU_MANDATORY_CATEGORY_IDS, DEFAULT_TRANSFER_CATEGORIES } from '@/core/db/defaultCategories';
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
  resolveAccounts,
  suggestCardAccountMerges,
  type AccountResolutionOrSkip,
  type AccountActionOrSkip,
  type CardAccountMergeSuggestion
} from '@/core/import/importAccountResolution';
import { findDuplicateAccountName } from '@/core/accounts/accountValidation';
import type { AccountInput } from '~/hooks/useAccountForm';
import {
  detectSelfAccountMovementPairs,
  isLikelyCashWithdrawal,
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
  /** The outgoing (expense) leg's raw CSV description — verbatim what the merged transfer row will
   *  actually be written with (see `importPipeline.ts`'s `applyConfirmedTransferPairs()`, the `...outgoing`
   *  spread — there's no synthesized text, just whatever that row's own narration says). Surfaced so the
   *  "Linked transfers" card shows exactly what the user will get before committing (2026-08-20, real-
   *  device testing pass). */
  description: string;
  /** The real matched Penny `Account` for `fromAccount`/`toAccount`'s raw CSV source name, resolved
   *  against the Accounts stage's own resolutions (`effectiveAccountResolutions`) — mirrors
   *  `AccountsSection.tsx`'s `resolveMergeTargetDisplayName()` pattern. Undefined when that source name
   *  hasn't been resolved to a real existing account yet, in which case the card falls back to the raw
   *  CSV label. */
  fromAccountResolved?: Account;
  toAccountResolved?: Account;
}

/** 2026-08-14 (CSV-import redesign): the wizard's stage shape (docs/plans/csv-expense-import-
 *  redesign.md §3) — `'accounts'` (Chunk A) resolves every distinct account/card; `'transactions'`
 *  (Chunk B) replaces the old single `'review'` step, doing both category resolution and row-level
 *  triage in one stage. A separate `'categories'` stage existed briefly (Categories-stage-resolved
 *  row groups, one row per source category) but was removed 2026-08-20 (item 41 flow redesign,
 *  real-device testing pass) — `TransactionsStage.tsx`'s `CategoryTile` already smart-pre-resolves
 *  each group via `effectiveSuggestion` (auto-suggested/remembered category) with its own "Categorize
 *  N selected ›" override, making a forced separate confirmation stage before it redundant. The
 *  underlying per-group resolution model (`CategoryRowGroup`/`TransactionsRowGroup` below) is
 *  unchanged — only the extra wizard stage that gated on it is gone. */
type Step = 'upload' | 'mapColumns' | 'accounts' | 'transactions' | 'done';
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

/** One category-resolution row-group — always a whole `DirectionalCategoryResolution` (2026-08-20,
 *  counterparty-split removal: a transfer/IOU-suspect category like "A/c to A/c" used to explode into
 *  one `CategoryRowGroup` PER detected counterparty, `isSplitChild: true`; per the approved
 *  `docs/mockups/proposals/csv-import-transaction-browser-v2.html` design, it now stays ONE group/tile
 *  — the counterparty info is preserved and shown PER-ROW inside `TransactionBrowserModal.tsx`'s popup
 *  instead of forking the group itself). This is the single row identity the Transactions stage (one
 *  tile per group, via `importTransactionsGrouping.ts`) keys off of. */
export interface CategoryRowGroup {
  fullKey: string;
  label: string;
  parentSourceName: string;
  type: 'expense' | 'income' | 'transfer';
  count: number;
  rowIndices: number[];
  isTransferSuspect: boolean;
  isIouSuspect: boolean;
  isInvestmentMovement: boolean;
  defaultSuggestion: CategoryAction;
}

/** `CategoryRowGroup` enriched with its CURRENT effective decision — the single shape
 *  `TransactionsStage.tsx` renders from. */
export interface TransactionsRowGroup extends CategoryRowGroup {
  effectiveSuggestion: CategoryAction;
  /** True once this group's CATEGORY decision (kind + transfer destination, where applicable) is
   *  settled — mirrors `isDirectionalCategoryResolutionDecided`. Does NOT factor in an IOU-mandatory
   *  category's still-missing person (see `transactionsReady`) — supplying the person is a separate,
   *  finer-grained gate handled entirely within the Transactions stage. */
  decided: boolean;
  /** `decided` AND (not IOU-mandatory, or its person has been supplied) — the actual gate for whether
   *  this group's rows can be committed ("Staged") vs. still need attention. */
  transactionsReady: boolean;
}

/** One "turn these into transfers to your Cash account?" suggestion (2026-08-20, real-device testing
 *  pass) — see `useImport.ts`'s "Cash-withdrawal → transfer" section for the detection/accept/dismiss
 *  logic this feeds. `count` is the group's row count MINUS any rows already claimed by a confirmed
 *  `transferPairs` pairing (so an already-linked-transfer row is never double-suggested here too); a
 *  group whose every row is already paired never appears here at all. */
export interface CashWithdrawalSuggestion {
  fullKey: string;
  label: string;
  count: number;
}

/** Fallback transfer category for an accepted cash-withdrawal suggestion — "Bank Transfer" reads best
 *  for money leaving a bank account to become cash, mirroring `suggestForName`'s/`suggestForNameDirectional`'s
 *  own "always a real, reviewable transfer category, never silently invented" fallback convention
 *  (importCategoryResolution.ts). Falls back to the first default transfer category in the vanishingly
 *  unlikely case `DEFAULT_TRANSFER_CATEGORIES` is ever reordered/renamed without updating this id. */
const CASH_WITHDRAWAL_TRANSFER_CATEGORY =
  DEFAULT_TRANSFER_CATEGORIES.find((c) => c.id === 'cat-tr-bank') ?? DEFAULT_TRANSFER_CATEGORIES[0];

/**
 * RN port of apps/web-react/src/features/import/useImport.ts. This hook is pure business-logic/state
 * (React state + useMemo, no DOM APIs). Owns the CSV-import wizard's full flow
 * (docs/plans/csv-expense-import-redesign.md, as amended 2026-08-20 by item 41's flow redesign) —
 * Upload → MapColumns → Accounts → Transactions → Done. (The Categories stage that used to sit between
 * Accounts and Transactions was removed — see the `Step` type's doc comment above.) Nothing is written
 * to the encrypted DB until `commitAndImport()`, the single
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
  /** Source names the user has explicitly CONFIRMED (2026-08-20, item 41 flow redesign — Accounts stage
   *  paired-match-card rework). Was previously "touched" in a looser sense (any edit at all counted, and
   *  only a 'create' guess needed it — 'existing'/'skip' were decided from the moment an auto-suggestion
   *  existed, with no confirm step). Per the approved redesign this is now a REQUIRED explicit Confirm tap
   *  for every row regardless of kind, including a confident 'existing' auto-match — see
   *  `acknowledgeAccountResolution` below, now the row's universal "Confirm" action. Picking (or
   *  re-picking) a different match via `updateAccountResolution` no longer marks a row touched — only an
   *  explicit Confirm does, so re-picking always drops back to needing a fresh Confirm (matches the
   *  approved mockup's `s2Pick` behavior). A merged card counts as "Ready" unconditionally (it fully
   *  tracks its target — see `cardMergeTargets`), independent of this set. */
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

  /** Per-`CategoryRowGroup.fullKey` override of its `defaultSuggestion` — the Transactions stage's core
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
   *  via the Transactions-stage tile's `ImportCategorizeModal`, blank the first time that tile's modal
   *  opens (2026-08-20, counterparty-split removal dropped the old per-group detected-counterparty seed
   *  — a merged multi-counterparty group like "A/c to A/c" has no single group-level name to seed from
   *  anymore; see `TransactionBrowserModal.tsx`'s per-row chip for where that detection now surfaces).
   *  Only meaningful for a row that is STILL a member of its group (no `RowOverride`) — see
   *  `rowIouPersonNames` below for the row that was moved out via a partial-selection override. */
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
  /** Accepted "cash withdrawal → transfer to my Cash account" suggestions (2026-08-20, real-device
   *  testing pass) — keyed by the `CategoryRowGroup.fullKey` of a cash/ATM-withdrawal-looking category
   *  (see `isLikelyCashWithdrawal`), valued by the real Cash-type `Account` the user explicitly picked
   *  as the transfer destination. Accepting ALSO writes a matching `categoryDecisions` entry (kind:
   *  'transfer', that same `toAccountId`) via `updateCategoryDecision` — the group then commits exactly
   *  like any other user-confirmed transfer, through the existing `rowActions`/`buildResolvedPreviewRowsByIndex`
   *  path, with no separate write-time logic needed. This map exists ONLY to drive
   *  `cashWithdrawalSuggestions`' own accepted/"Undo" UI state, never consulted by the write path
   *  directly. */
  const [cashWithdrawalTargets, setCashWithdrawalTargets] = useState<
    Map<string, { accountId: string; accountName: string }>
  >(new Map());
  /** Cash-withdrawal suggestion groups (by fullKey) the user explicitly dismissed via "Keep as separate
   *  expense category" — permanently hidden for the rest of this import session (same "no un-dismiss
   *  surfaced" precedent as `dismissedCardMerges`/`AccountsSection.tsx`'s "Keep separate" action). A
   *  dismissed group falls through to its normal default category resolution exactly as it worked
   *  before this feature existed — dismissing never touches `categoryDecisions`. */
  const [dismissedCashWithdrawalKeys, setDismissedCashWithdrawalKeys] = useState<Set<string>>(new Set());
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
  /** Per-`dedupKey` LIST of matching existing DB expense ids — not just a count, and not just a `Set` of
   *  which keys exist — see `buildResolvedPreviewRowsByIndex`'s own doc comment for the real
   *  over-counting bug this fixes (2026-08-16): a plain Set let one existing expense be "claimed" as a
   *  duplicate match by an unlimited number of re-uploaded file rows sharing its key. Keeping the actual
   *  ids (not just a count) is also what lets `preview[i].matchedExpenseId` point at a real expense —
   *  `expenseById` below resolves that id back to the full `Expense` for the "Already imported" bucket's
   *  side-by-side comparison UI. */
  const [existingKeys, setExistingKeys] = useState<Map<string, string[]>>(new Map());
  /** Every existing expense, by id — built alongside `existingKeys` from the same `loadReferenceData()`
   *  fetch (2026-08-16). Only consulted for rows `buildResolvedPreviewRowsByIndex` actually matched
   *  (`preview[i].matchedExpenseId`), never iterated wholesale by the UI. */
  const [expenseById, setExpenseById] = useState<Map<string, Expense>>(new Map());
  const [txnCountByCategory, setTxnCountByCategory] = useState<Map<string, number>>(new Map());
  const [categoriesLoadError, setCategoriesLoadError] = useState(false);
  /** IOU (Lent/Borrowed) person autocomplete — live subscription, same as `useBankImport.ts`'s own
   *  `iouPersons`. */
  const { items: persons } = useRepository(personsRepo);
  /** Tag suggestions for `ImportCategorizeModal`'s tag field (2026-08-20, item 41 real-device testing
   *  pass) — live subscription, same shape as `persons` above; threaded through TransactionsStage.tsx →
   *  CategoryTile.tsx → ImportCategorizeModal.tsx for its "Frequent"/live-suggestion row. */
  const { items: hashtags } = useRepository(hashtagsRepo);

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
        const keyIds = new Map<string, string[]>();
        const byId = new Map<string, Expense>();
        for (const e of exps) {
          const key = dedupKey(e.date, e.amount, e.description);
          const ids = keyIds.get(key) ?? [];
          ids.push(e.id);
          keyIds.set(key, ids);
          byId.set(e.id, e);
        }
        setExistingKeys(keyIds);
        setExpenseById(byId);
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
   *  already available for `rowTriage`'s stats even before the Transactions stage is reached. */
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
    setRowOverrides(new Map());
    setUnflaggedDuplicateIndices(new Set());
    setUnpairedTransferKeys(new Set());
    setDiscardedRejectedRowIndices(new Set());
    setRememberedSuggestions(new Map());
    setStep('accounts');
  }

  /** Updates a row's match — NO LONGER marks it confirmed (2026-08-20, item 41 flow redesign): picking a
   *  new match (or re-picking a different one) always drops any prior confirmation, requiring a fresh
   *  explicit Confirm tap (`acknowledgeAccountResolution`) before the row counts as Ready again. */
  function updateAccountResolution(sourceName: string, suggestion: AccountActionOrSkip) {
    setAccountResolutions((prev) => prev.map((r) => (r.sourceName === sourceName ? { ...r, suggestion } : r)));
    setAccountTouchedSourceNames((prev) => {
      if (!prev.has(sourceName)) return prev;
      const next = new Set(prev);
      next.delete(sourceName);
      return next;
    });
  }

  /** "Confirm" for an account row (2026-08-20, item 41 flow redesign — was "Looks good, use this",
   *  scoped only to an unconfirmed 'create' guess; now the row's universal, always-required Confirm
   *  action regardless of kind — see `accountTouchedSourceNames`' own doc comment). */
  function acknowledgeAccountResolution(sourceName: string) {
    setAccountTouchedSourceNames((prev) => (prev.has(sourceName) ? prev : new Set(prev).add(sourceName)));
  }

  /** Creates a real `Account` immediately (2026-08-20, item 41 flow redesign) — backs BOTH the Accounts
   *  stage's new "+ Create Account" button (via `useAccountForm`, mirroring `useBankImport.ts`'s
   *  `saveAccountForForm`) and `AccountsSection.tsx`'s same-file merge-accept action (which used to defer
   *  to a `'create'` suggestion resolved at commit time — now creates the merged account right away and
   *  resolves both source rows straight to `'existing'`, since a per-row `'create'` kind no longer exists
   *  in the redesigned UI). Appends to local `accounts` state directly (not `useRepository`-backed here —
   *  see that state's own doc comment) so the new account is immediately selectable everywhere in this
   *  import session, matching `ExpenseForm.tsx`'s identical inline "+ Add account" pattern. */
  const createAccount = useCallback(async (data: AccountInput, editing: Account | null): Promise<Account> => {
    const now = Date.now();
    const record: Account = editing
      ? { ...editing, ...data, updatedAt: now }
      : { id: crypto.randomUUID(), ...data, isArchived: false, createdAt: now, updatedAt: now };
    await accountsRepo.put(record);
    setAccounts((prev) => (editing ? prev.map((a) => (a.id === record.id ? record : a)) : [...prev, record]));
    return record;
  }, []);

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
   *  2026-08-20, item 41 flow redesign: Confirm is now a REQUIRED explicit tap for every kind, including
   *  a confident 'existing' auto-match (previously 'existing'/'skip' were decided the moment a plausible
   *  suggestion existed, with no confirm step — only 'create' needed `accountTouchedSourceNames`). A row
   *  whose effective suggestion is still 'create' (no real account ever picked) can never be resolved —
   *  the per-row "New account" kind was dropped entirely; a real account must be picked from the paired
   *  card's dropdown (or created via "+ Create Account") before Confirm is even enabled. A merged card
   *  (`cardMergeTargets`) stays unconditionally resolved regardless of touched — it fully tracks its
   *  target's OWN resolution, never needs its own separate confirm (mirrors `bucketForAccount`'s
   *  identical special case in `AccountsStage.tsx`). */
  const accountsResolved = useMemo(() => {
    if (noAccountColumn) return !!singleAccountId || !!singleAccountCreate?.name.trim();
    return effectiveAccountResolutions.every((r) => {
      // 'skip' (manual-testing gap #1) is always immediately decided — same treatment 'existing' gets.
      if (r.suggestion.kind === 'skip') return true;
      if (cardMergeTargets.has(r.sourceName)) return true;
      return (
        r.suggestion.kind === 'existing' && !!r.suggestion.accountId && accountTouchedSourceNames.has(r.sourceName)
      );
    });
  }, [
    noAccountColumn,
    effectiveAccountResolutions,
    singleAccountId,
    singleAccountCreate,
    accountTouchedSourceNames,
    cardMergeTargets
  ]);

  /** Distinct final CONFIRMED accounts (2026-08-20, item 41 flow redesign — only counts a row once it's
   *  actually confirmed, or is a merged card riding its target's resolution; an unconfirmed 'create'
   *  guess is never counted since it can no longer become a real account via the row itself). */
  const confirmedAccountCount = useMemo(() => {
    const ids = new Set<string>();
    for (const r of effectiveAccountResolutions) {
      if (r.suggestion.kind !== 'existing') continue;
      if (!cardMergeTargets.has(r.sourceName) && !accountTouchedSourceNames.has(r.sourceName)) continue;
      ids.add(r.suggestion.accountId);
    }
    return ids.size;
  }, [effectiveAccountResolutions, accountTouchedSourceNames, cardMergeTargets]);

  /** Source account names resolved as `'skip'` (manual-testing gap #1) — every row belonging to one of
   *  these must be filtered out of the pipeline entirely BEFORE category-resolution grouping, since it's
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

  // ─── Category resolution — direction-aware resolution + counterparty sub-split ──────────────────────

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
   *  array once PER resolution via a `.forEach` — O(rows × resolutions), flagged as potentially slow on
   *  the ~9,384-row/79-category real file this whole redesign was built against. This single pass groups
   *  every row's index by its key up front, so `categoryRowGroups` only needs an O(1) map lookup per
   *  resolution instead — O(rows) TOTAL across the whole computation, not O(rows) EACH. (Until
   *  2026-08-20, this also fed `splitByCounterparty`'s optional `candidateIndices` param for its
   *  now-removed counterparty-split branch — see `CategoryRowGroup`'s doc comment.) Indices are into the
   *  ORIGINAL `parsedRows` (never `rowsForCategorization`) — a skipped-account row is simply never added
   *  here at all (gap #1), which is what keeps it out of every category-resolution row-group without
   *  ever needing to renumber indices anywhere else in the pipeline. */
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

  /** One row per category-resolvable unit — always a plain `DirectionalCategoryResolution` (2026-08-20,
   *  counterparty-split removal — see `CategoryRowGroup`'s own doc comment). A transfer/IOU-suspect
   *  category's rows stay in this ONE group; their per-row counterparty is computed on demand inside
   *  `TransactionBrowserModal.tsx`'s popup (`classifyCounterparty`), not here. */
  const categoryRowGroups: CategoryRowGroup[] = useMemo(() => {
    return directionalResolutions.map((r) => {
      // O(1) lookup instead of an O(rows) re-scan — see `rowIndicesByDirectionalKey`'s doc comment.
      const rowIndices = rowIndicesByDirectionalKey.get(r.key) ?? [];
      return {
        fullKey: r.key,
        label: r.sourceName,
        parentSourceName: r.sourceName,
        type: r.type,
        count: rowIndices.length,
        rowIndices,
        isTransferSuspect: r.isTransferSuspect,
        isIouSuspect: r.isIouSuspect,
        isInvestmentMovement: r.isInvestmentMovement,
        defaultSuggestion: r.suggestion
      };
    });
  }, [directionalResolutions, rowIndicesByDirectionalKey]);

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

  // ─── Cash-withdrawal → transfer-to-Cash-account suggestion (2026-08-20, real-device testing pass) ───
  // A real cash/ATM withdrawal is a SINGLE row (a bank debit) with no reciprocal row to pair against —
  // most bank exports never include a ledger for the "Cash" account itself, so `transferPairs` above
  // (a two-row pairing detector) structurally never fires for it. This surfaces those single-leg groups
  // as their own opt-in suggestion instead, always asking (never auto-applying) before turning them into
  // a real `type: 'transfer'` into one of the user's actual Cash-type accounts.

  const cashWithdrawalSuggestions: CashWithdrawalSuggestion[] = useMemo(() => {
    const pairedIndices = new Set<number>();
    for (const p of transferPairs) {
      pairedIndices.add(p.outgoingIndex);
      pairedIndices.add(p.incomingIndex);
    }
    return categoryRowGroups
      .filter((g) => g.type === 'expense' && isLikelyCashWithdrawal(g.parentSourceName))
      .map((g) => ({
        fullKey: g.fullKey,
        label: g.label,
        count: g.rowIndices.filter((i) => !pairedIndices.has(i)).length
      }))
      .filter((g) => g.count > 0 && !dismissedCashWithdrawalKeys.has(g.fullKey));
  }, [categoryRowGroups, transferPairs, dismissedCashWithdrawalKeys]);

  /** Accepts a cash-withdrawal group's suggestion — sets its category decision straight to a real
   *  `type: 'transfer'` targeting the chosen Cash account, exactly as if the user had picked "Transfer"
   *  + that account themselves on the Transactions-stage tile. Always an explicit tap (`accountId`/
   *  `accountName` come from the card's own picker or its "create a Cash account" sub-flow — never
   *  defaulted/applied automatically just because a suggestion was detected). */
  function acceptCashWithdrawalTransfer(fullKey: string, accountId: string, accountName: string) {
    updateCategoryDecision(fullKey, {
      kind: 'transfer',
      categoryId: CASH_WITHDRAWAL_TRANSFER_CATEGORY.id,
      categoryName: CASH_WITHDRAWAL_TRANSFER_CATEGORY.name,
      toAccountId: accountId
    });
    setCashWithdrawalTargets((prev) => new Map(prev).set(fullKey, { accountId, accountName }));
  }

  /** "Keep as separate expense category" — permanently dismisses the suggestion for this group; the
   *  group's category resolution is left exactly as it already was (never touched here), so it falls
   *  through to today's normal category-resolution behavior with zero change. */
  function dismissCashWithdrawalSuggestion(fullKey: string) {
    setDismissedCashWithdrawalKeys((prev) => new Set(prev).add(fullKey));
  }

  /** Reverses an accepted cash-withdrawal transfer — drops the group's forced `categoryDecisions`/
   *  `categoryTouchedKeys` entries so it falls back to its own normal auto-suggested default (mirrors
   *  `unmergeCardAccount`'s identical "just remove what we added" reversal). */
  function undoCashWithdrawalTransfer(fullKey: string) {
    setCategoryDecisions((prev) => {
      const next = new Map(prev);
      next.delete(fullKey);
      return next;
    });
    setCategoryTouchedKeys((prev) => {
      if (!prev.has(fullKey)) return prev;
      const next = new Set(prev);
      next.delete(fullKey);
      return next;
    });
    setCashWithdrawalTargets((prev) => {
      const next = new Map(prev);
      next.delete(fullKey);
      return next;
    });
  }

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

  /** Every category-resolution row-group, enriched with its current effective decision + readiness —
   *  the single shape `TransactionsStage.tsx` renders from. */
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

  /** Resolves a transfer pair leg's raw CSV account `sourceName` to its matched real Penny `Account`,
   *  when the Accounts stage has actually resolved one to `'existing'` — mirrors `AccountsSection.tsx`'s
   *  `resolveMergeTargetDisplayName()` pattern (read live from `effectiveAccountResolutions`, not baked in
   *  at detection time, since a resolution can change as the user makes decisions elsewhere in the
   *  wizard). Returns `undefined` (raw CSV label fallback) for an unresolved/skipped/`'create'` source. */
  const resolveTransferLegAccount = useCallback(
    (sourceName: string): Account | undefined => {
      const target = effectiveAccountResolutions.find((r) => r.sourceName === sourceName);
      if (!target) return undefined;
      // Assigned to a local const first — TS control-flow narrowing on `target.suggestion.kind` doesn't
      // survive an optional-chained `.find()` result otherwise (same limitation `AccountsSection.tsx`'s
      // `resolveMergeTargetDisplayName()` works around identically).
      const suggestion = target.suggestion;
      if (suggestion.kind !== 'existing') return undefined;
      return accounts.find((a) => a.id === suggestion.accountId);
    },
    [effectiveAccountResolutions, accounts]
  );

  const displayTransferPairs: DisplayTransferPair[] = useMemo(
    () =>
      transferPairs.map((p) => {
        const out = preview[p.outgoingIndex];
        const inc = preview[p.incomingIndex];
        const alreadyImported = !out || !inc || out.duplicate || out.skipped || inc.duplicate || inc.skipped;
        return {
          ...p,
          alreadyImported,
          description: parsedRows[p.outgoingIndex]?.description ?? '',
          fromAccountResolved: resolveTransferLegAccount(p.fromAccount),
          toAccountResolved: resolveTransferLegAccount(p.toAccount)
        };
      }),
    [transferPairs, preview, parsedRows, resolveTransferLegAccount]
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
        // Every DETECTED pair (not just the writable `confirmedTransferPairs` subset) — same underlying
        // set as `displayTransferPairs`/the "Linked transfers" card (2026-08-20 fix). An `alreadyImported`
        // pair (only one leg a duplicate) was previously excluded from `confirmedTransferPairs` entirely,
        // so its OTHER, non-duplicate leg was never excluded from a normal category tile and rendered
        // twice — once dimmed in that card, once live in its own tile. Passing the full `transferPairs`
        // list here excludes both legs of every shown pair from category-tile grouping regardless of
        // which leg (if any) is the duplicate, so a row already accounted for in that card never also
        // renders elsewhere.
        transferPairs,
        categoryRowGroups.map((g) => ({ fullKey: g.fullKey, rowIndices: g.rowIndices })),
        tileForExistingCategoryId,
        rowOverrides
      ),
    [parsedRows, rowTriage, transferPairs, categoryRowGroups, tileForExistingCategoryId, rowOverrides]
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
      // 1. Draft categories — deduped by draftCategoryKey (§3.1's mechanic): multiple groups
      // independently choosing 'create' with the same name+group collapse into ONE real category. Gated
      // on `transactionsReady`
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

      // 2. Accounts — 2026-08-20, item 41 flow redesign: the per-row "New account" kind option was
      // dropped entirely from the Accounts stage UI. A brand-new account is now only ever created
      // IMMEDIATELY — via the "+ Create Account" button or a same-file merge-accept (see `createAccount`/
      // `AccountsSection.tsx`'s `acceptMerge`, both of which write a real `Account` right away and resolve
      // straight to `'existing'`) — never deferred to commit time. A resolution can therefore only ever
      // reach here as `'existing'` (a real account already exists) or `'skip'`; a `'create'` kind still
      // appearing at this point is always an untouched, never-picked auto-guess (`resolveAccounts()`
      // found no exact match) that can never become ready — its rows fall into
      // `notReadyAccountSourceNames` below exactly like an unconfirmed `'existing'` row does, deferred to a
      // later re-upload pass, never silently written with no real account (folded into
      // `stillUnresolvedCount`).
      //
      // GATED on `accountTouchedSourceNames.has(r.sourceName)` for EVERY kind, not just `'create'`
      // (2026-08-14 finding, broadened 2026-08-20 to match the redesign's universal-Confirm requirement) —
      // defense in depth, same reasoning as the category-creation loop's `g.transactionsReady` gate above:
      // a row the user never actually confirmed must never be treated as ready just because commit ran on
      // a batch where OTHER rows happened to be. A merged card (`cardMergeTargets`) is always exempt — it
      // fully tracks its target's OWN resolution/confirmation, never needs its own separate Confirm
      // (mirrors `bucketForAccount`'s identical special case in `AccountsStage.tsx`).
      const notReadyAccountSourceNames = new Set<string>();
      for (const r of effectiveAccountResolutions) {
        if (r.suggestion.kind === 'skip') continue;
        if (cardMergeTargets.has(r.sourceName)) continue;
        if (r.suggestion.kind === 'existing' && accountTouchedSourceNames.has(r.sourceName)) continue;
        notReadyAccountSourceNames.add(r.sourceName);
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
          // 'create'. A `'create'` kind (an unconfirmed auto-guess, 2026-08-20 redesign — see
          // `notReadyAccountSourceNames` above) never resolves to a real id here; its rows are excluded
          // from the write entirely by the `notReadyAccountSourceNames` pass near `finalRowActions` below.
          const r = effectiveAccountResolutions.find((a) => a.sourceName === row.account);
          if (r?.suggestion.kind === 'existing') return r.suggestion.accountId;
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

  /** Creates a real `ExpenseCategory` immediately (2026-08-20, item 41 flow redesign) — backs
   *  `ImportCategorizeModal.tsx`'s "Create" kind, now opening the real `CategoryEditorModal` instead of
   *  its old bespoke inline name+group fields. Mirrors `useExpenses.ts`'s `saveCategory` CREATE branch
   *  (that hook can't be imported here directly — a feature module importing another feature module's
   *  hook — same documented precedent as this file's own `createAccount`/`useBankImport.ts`'s
   *  `saveAccountForForm`), minus the activity-log write (this app has no equivalent for import-session
   *  category creation elsewhere either). Appends to local `categories` state directly (not
   *  `useRepository`-backed here — see that state's own doc comment) so the new category is immediately
   *  selectable everywhere in this import session. */
  const createCategory = useCallback(async (cat: ExpenseCategory) => {
    await expenseCategoriesRepo.put(cat);
    setCategories((prev) => [...prev, cat]);
  }, []);

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
    createAccount,

    categories,
    accounts,
    persons,
    hashtags,
    txnCountByCategory,
    categoriesLoadError,
    retryLoadReferenceData: loadReferenceData,
    createCategory,

    categoryRowGroups,
    transactionsRowGroups,
    rememberedSuggestions,
    updateCategoryDecision,
    acknowledgeCategoryDecision,
    categoryTagsByKey,
    setCategoryTagForKey,
    iouPersonNames,
    setIouPersonNameForKey,
    rowIouPersonNames,
    setRowIouPersonNames,

    rowOverrides,
    moveRowsToCategory,
    tagRows,
    unflagDuplicate,
    transactionsGrouping,
    transferPairs: displayTransferPairs,
    unpairTransfer,

    cashWithdrawalSuggestions,
    cashWithdrawalTargets,
    acceptCashWithdrawalTransfer,
    dismissCashWithdrawalSuggestion,
    undoCashWithdrawalTransfer,

    preview,
    /** The matched existing DB expense for any duplicate-flagged row (2026-08-16) — see
     *  `preview[i].matchedExpenseId`/`ResolvedPreviewRow`'s own doc comment. Resolved here (not inline in
     *  `TransactionsStage.tsx`) since this hook is the only place that ever fetched the full expense
     *  list. */
    expenseById,
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
