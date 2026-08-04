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
import { logActivity } from '@/core/db/activityLog';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { RECONCILIATION_DESCRIPTION } from '@/core/expenses/cashFlowSummary';
import {
  BANK_PRESETS,
  CUSTOM_PRESET_ID,
  EMPTY_CUSTOM_MAPPING,
  getBankPreset,
  resolveMappingAgainstHeaders
} from '@/core/bank-import/presets';
import { tokenizeCsv, extractHeaderRow, parseStatementRows } from '@/core/bank-import/csvParser';
import type { BankPresetId, ColumnMapping, ParsedStatementRow, StatementParseResult } from '@/core/bank-import/types';
import { normalizeNarration } from '@/core/bank-import/normalization';
import { matchStatementRows, deriveLoneWolves, type MatchResult } from '@/core/bank-import/matcher';
import { groupUnmatchedByMerchant } from '@/core/bank-import/grouping';
import { checkBalanceAgainstStatement } from '@/core/bank-import/balanceCheck';
import { inferPaymentMode } from '@/core/bank-import/paymentModeInference';
import { usePaymentModes } from '~/hooks/usePaymentModes';
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

  const account = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);
  const expensesById = useMemo(() => new Map(allExpenses.map((e) => [e.id, e])), [allExpenses]);

  // ── Step 'bank' ───────────────────────────────────────────────────────────────────────────────
  const [presetId, setPresetId] = useState<BankPresetId | null>(null);
  const preset = useMemo(() => {
    if (presetId === null) return null;
    return presetId === CUSTOM_PRESET_ID ? EMPTY_CUSTOM_MAPPING : (getBankPreset(presetId) ?? EMPTY_CUSTOM_MAPPING);
  }, [presetId]);

  // Bank, upload, and column-mapping review all live on the single 'setup' screen (merged
  // 2026-08-03, per explicit user feedback — no step change on selecting a preset).
  const selectPreset = useCallback((id: BankPresetId) => {
    setPresetId(id);
  }, []);

  // ── Step 'upload' ─────────────────────────────────────────────────────────────────────────────
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [delimiter, setDelimiter] = useState(',');
  const [parseError, setParseError] = useState('');

  // Draft column mapping — every field a plain string, '' meaning "not mapped yet" (unlike core's
  // `ColumnMapping`, whose `date`/`narration` are required non-empty strings — this looser shape is
  // what the still-being-edited confirmation screen needs before a final mapping is confirmed).
  const [mapping, setMapping] = useState({ date: '', narration: '', debit: '', credit: '', balance: '' });

  const tokenizedRows = useMemo(() => (rawText ? tokenizeCsv(rawText, delimiter) : []), [rawText, delimiter]);
  const headers = useMemo(() => extractHeaderRow(tokenizedRows), [tokenizedRows]);

  const importFromText = useCallback(
    (text: string, name: string) => {
      setParseError('');
      setFileName(name);
      setRawText(text);
      const delim = preset?.delimiter ?? ',';
      setDelimiter(delim);
      const tokenized = tokenizeCsv(text, delim);
      const hdrs = extractHeaderRow(tokenized);
      if (hdrs.length === 0) {
        setParseError('Could not read this file. Make sure it is a valid CSV with a header row.');
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
      // Stays on 'setup' — the mapping review now renders inline on the same screen once headers exist.
    },
    [preset, presetId]
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
      ...(mapping.balance && { balance: mapping.balance })
    };
    return parseStatementRows(tokenizedRows, headers, cm);
  }, [mappingReady, mapping, tokenizedRows, headers]);

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
      ...(mapping.balance && { balance: mapping.balance })
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
  }, [mappingReady, mapping, tokenizedRows, headers, accountId, allExpenses]);

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
      }
    ) => {
      const now = Date.now();
      const iouPersonName = fields.iouPersonName?.trim();
      const newTxns: StagedNewTxn[] = rows.map((row) => ({
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
      }));
      setStagedNewTxns((prev) => [...prev, ...newTxns]);
      const resolvedIndices = new Set(rows.map((r) => r.rowIndex));
      setUnmatchedRows((prev) => prev.filter((r) => !resolvedIndices.has(r.rowIndex)));
    },
    [accountId]
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
      logActivity({
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
