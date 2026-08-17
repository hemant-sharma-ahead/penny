import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Account, Expense, SmsAccountMapping, SmsTransactionRecord } from '@/core/db/types';
import {
  accountsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  hashtagsRepo,
  merchantMemoryRepo,
  smsAccountMappingsRepo,
  smsExcludedSendersRepo,
  smsTransactionsRepo
} from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { notifyAccountsChanged } from '@/hooks/useDataRefresh';
import type { AccountInput } from '~/hooks/useAccountForm';
import { logActivity } from '@/core/db/activityLog';
import { buildMemory, normalizeMerchant } from '@/core/expenses/merchantMemory';
import { buildSmsAccountMappingKey } from '@/core/sms-import/smsAccountMatch';
import type { ParsedSmsCandidate } from '@/core/sms-import/smsParser';
import { findPossibleDuplicateSms } from '@/core/sms-import/smsTransactionMatch';
import { deriveStatusForAccount, processRawSmsCore } from '@/core/sms-import/processRawSms';
import { otherSmsCandidates, recordToCandidate } from '@/core/sms-import/smsRecordHelpers';

export type PossibleMatchAction = { kind: 'link'; expenseId: string } | { kind: 'separate' };
export type DuplicateSmsAction = 'different' | 'same';

/**
 * Orchestrates SMS Tracking end-to-end (docs/plans/sms-transaction-tracking.md) — every actual parsing/
 * matching/account-resolution rule lives in `packages/core/src/core/sms-import/` (read-only from here,
 * consumed as-is); this hook is purely the UI-facing state + the seam that turns a raw SMS (or a review
 * decision) into a persisted `SmsTransactionRecord`/`Expense` write, mirroring `features/bank-import/
 * useBankImport.ts`'s "one hook owning the whole flow, dumb screens on top" shape — but NOT importing
 * from it (feature modules must not cross-import, and per the plan's §1 scope note, SMS tracking and
 * Bank Statement Import are deliberately independent features that only share core algorithm shape).
 *
 * `processRawSms` is the seam the native capture layer (`~/lib/smsCapture.native.ts` — see that
 * file's own doc comment) calls once per real SMS, whether via a manual scan or the live-capture
 * path's Headless JS task (`~/lib/smsHeadlessTask.ts`); every screen below calls the same underlying
 * `packages/core` implementation (`processRawSmsCore`), so there is exactly one place "a raw SMS
 * becomes a record" ever happens, regardless of which of those three entry points triggered it.
 */
export function useSmsTracking() {
  const {
    items: records,
    loading: recordsLoading,
    save: saveRecordRaw,
    reload: reloadRecords
  } = useRepository(smsTransactionsRepo);
  const {
    items: mappings,
    save: saveMapping,
    remove: removeMapping,
    reload: reloadMappings
  } = useRepository(smsAccountMappingsRepo);
  const { items: accounts, reload: reloadAccounts } = useRepository(accountsRepo);
  const { items: expenses, reload: reloadExpenses } = useRepository(expensesRepo);
  const { items: categories } = useRepository(expenseCategoriesRepo);
  const { items: hashtags, save: saveHashtag } = useRepository(hashtagsRepo);
  const { items: merchantMemories } = useRepository(merchantMemoryRepo);
  const {
    items: excludedSenderRecords,
    save: saveExcludedSender,
    remove: removeExcludedSender,
    reload: reloadExcludedSenders
  } = useRepository(smsExcludedSendersRepo);

  // Mirrors `useExpenses.ts`'s own `expensesRef` pattern — a same-tick-consistent cache of records,
  // updated directly on every write rather than waiting for `useRepository`'s state to re-render, so a
  // scan loop calling `processRawSms` many times in a row (or a batch of resolution actions) always sees
  // its own immediately-prior writes when checking Tier-1 dedup / possible-duplicate-SMS, instead of
  // acting on a stale snapshot from before this render cycle's writes.
  const recordsRef = useRef<SmsTransactionRecord[]>(records);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const persistRecord = useCallback(
    async (record: SmsTransactionRecord) => {
      await saveRecordRaw(record);
      recordsRef.current = [...recordsRef.current.filter((r) => r.id !== record.id), record];
    },
    [saveRecordRaw]
  );

  const reload = useCallback(() => {
    reloadRecords();
    reloadMappings();
    reloadAccounts();
    reloadExpenses();
    reloadExcludedSenders();
  }, [reloadRecords, reloadMappings, reloadAccounts, reloadExpenses, reloadExcludedSenders]);

  /** Plain sender strings — `processRawSmsCore`'s `ProcessRawSmsContext.excludedSenders` just needs the
   *  literal values, not the full `SmsExcludedSender` record (which the UI needs for id-based removal
   *  and `createdAt` display instead). */
  const excludedSenders = useMemo(() => excludedSenderRecords.map((r) => r.sender), [excludedSenderRecords]);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const expensesById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses]);

  const linked = useMemo(() => records.filter((r) => r.status === 'linked'), [records]);
  const needsReview = useMemo(() => records.filter((r) => r.status === 'needs_review'), [records]);
  const ready = useMemo(() => records.filter((r) => r.status === 'ready'), [records]);
  const dismissed = useMemo(() => records.filter((r) => r.status === 'dismissed'), [records]);
  const unparsed = useMemo(() => records.filter((r) => r.status === 'unparsed'), [records]);

  /** The Settings/Expenses-tab badge count (plan §7) — "needs my attention" items only; `linked` is
   *  purely informational and `dismissed` is resolved, so neither contributes. */
  const reviewQueueCount = needsReview.length + ready.length;

  /** "New Pending" tile pre-fill (plan §1: "once the user categorizes one SMS-derived expense for a
   *  given merchant, the very next SMS parsed for that same merchant will pre-fill the same category") —
   *  the highest-usage remembered category for this counterparty text, regardless of which category it
   *  was filed under, same shared `merchantMemory` mechanism every other recording method already reads
   *  from/writes to. Returns `undefined` when nothing's been remembered for this merchant yet. */
  const suggestCategoryForCounterparty = useCallback(
    (counterparty: string | undefined, type: 'expense' | 'income'): string | undefined => {
      const norm = normalizeMerchant(counterparty ?? '');
      if (!norm) return undefined;
      const matches = merchantMemories
        .filter((m) => m.type === type && normalizeMerchant(m.description) === norm)
        .sort((a, b) => b.usageCount - a.usageCount);
      return matches[0]?.categoryId;
    },
    [merchantMemories]
  );

  /** Re-derives an already-resolved-account record's status against the current `expenses`/`records`
   *  snapshot — thin wrapper around the shared `packages/core` implementation so
   *  `resolveAmbiguousAccount` below applies the exact same match → duplicate-check derivation
   *  `processRawSms` itself uses (plan §4). See `processRawSms.ts`'s own doc comment for why this
   *  logic lives in `packages/core` rather than only here: a Headless JS task
   *  (`~/lib/smsHeadlessTask.ts`) has no React tree to call this hook from, so there must be exactly
   *  one implementation, not a hook-only one duplicated for the native capture layer. */
  const deriveStatus = useCallback(
    (candidate: ParsedSmsCandidate, accountId: string, base: SmsTransactionRecord): SmsTransactionRecord =>
      deriveStatusForAccount(candidate, accountId, base, { expenses, records: recordsRef.current }),
    [expenses]
  );

  /** The seam both the manual scan (`~/lib/smsCapture.ts`'s `scanSmsInbox`, called once per historical
   *  message) and the native live-capture path (`~/lib/smsHeadlessTask.ts`) ultimately feed into — see
   *  this hook's own doc comment. Thin wrapper around `packages/core`'s `processRawSmsCore`: this hook
   *  supplies its own live, memoized snapshot of accounts/mappings/expenses/records, the core function
   *  does the actual parse/match/resolve work, and this wrapper persists whatever record it returns. */
  const processRawSms = useCallback(
    async (sender: string, body: string, receivedAt: number): Promise<void> => {
      const record = await processRawSmsCore(sender, body, receivedAt, {
        accounts,
        mappings,
        expenses,
        records: recordsRef.current,
        excludedSenders
      });
      if (record) await persistRecord(record);
    },
    [accounts, mappings, expenses, excludedSenders, persistRecord]
  );

  /** User picked (or created) an account for an `'ambiguous_account'` item — persists the mapping so
   *  every future SMS from the same normalized sender/card auto-resolves (plan §3), then re-derives
   *  this record's own status against the now-known account. */
  const resolveAmbiguousAccount = useCallback(
    async (record: SmsTransactionRecord, accountId: string) => {
      const candidate = recordToCandidate(record);
      const { kind, mappingKey } = buildSmsAccountMappingKey(candidate);
      const now = Date.now();
      const existing = mappings.find((m) => m.kind === kind && m.mappingKey === mappingKey);
      const mapping: SmsAccountMapping = existing
        ? { ...existing, accountId, updatedAt: now }
        : {
            id: crypto.randomUUID(),
            kind,
            mappingKey,
            rawValue: record.sender,
            accountId,
            createdAt: now,
            updatedAt: now
          };
      await saveMapping(mapping);

      const { reviewReason: _reviewReason, ...rest } = record;
      void _reviewReason;
      await persistRecord(deriveStatus(candidate, accountId, rest));
    },
    [mappings, saveMapping, deriveStatus, persistRecord]
  );

  /** "Possible match"/"Reconciled date conflict" resolution (plan §4a) — link keeps the existing
   *  `Expense` untouched (only the link pointer is written) and clears `rawBody`; "separate" treats the
   *  candidate as never having matched, re-running only the possible-duplicate-SMS check (NOT a fresh
   *  `matchSmsAgainstExpenses`, which would just re-surface the exact same declined candidate(s)). */
  const resolvePossibleMatch = useCallback(
    async (record: SmsTransactionRecord, action: PossibleMatchAction) => {
      const now = Date.now();
      if (action.kind === 'link') {
        const { reviewReason: _rr, possibleMatchExpenseIds: _pm, rawBody: _rb, ...rest } = record;
        void _rr;
        void _pm;
        void _rb;
        await persistRecord({ ...rest, status: 'linked', linkedTxnId: action.expenseId, updatedAt: now });
        return;
      }
      // 'separate' — account is already known (possible_match/reconciled_date_conflict always implies a
      // resolved accountId); only the duplicate-SMS check is worth re-running.
      const accountId = record.accountId;
      if (!accountId) return; // defensive — should be unreachable per this reviewReason's own invariant
      const candidate = recordToCandidate(record);
      const others = otherSmsCandidates(recordsRef.current, record.id);
      const dupIds = findPossibleDuplicateSms(candidate, accountId, others);
      const { reviewReason: _rr2, possibleMatchExpenseIds: _pm2, ...rest } = record;
      void _rr2;
      void _pm2;
      if (dupIds.length > 0) {
        await persistRecord({
          ...rest,
          status: 'needs_review',
          reviewReason: 'possible_duplicate_sms',
          possibleDuplicateSmsIds: dupIds,
          updatedAt: now
        });
      } else {
        await persistRecord({ ...rest, status: 'ready', updatedAt: now });
      }
    },
    [persistRecord]
  );

  /** "Possible duplicate SMS" resolution (plan §4b) — "different" clears the flag on THIS record (→
   *  'ready') and on every sibling record that was flagged only because of this pair; "same" dismisses
   *  THIS record, leaving the other(s) exactly as they were (still 'ready' or under their own review). */
  const resolveDuplicateSms = useCallback(
    async (record: SmsTransactionRecord, action: DuplicateSmsAction) => {
      const now = Date.now();
      if (action === 'same') {
        const { reviewReason: _rr, possibleDuplicateSmsIds: _pd, rawBody: _rb, ...rest } = record;
        void _rr;
        void _pd;
        void _rb;
        await persistRecord({ ...rest, status: 'dismissed', updatedAt: now });
        return;
      }
      const { reviewReason: _rr2, possibleDuplicateSmsIds: _pd2, ...rest } = record;
      void _rr2;
      void _pd2;
      await persistRecord({ ...rest, status: 'ready', updatedAt: now });
      for (const otherId of record.possibleDuplicateSmsIds ?? []) {
        const other = recordsRef.current.find((r) => r.id === otherId);
        if (!other || other.status !== 'needs_review' || other.reviewReason !== 'possible_duplicate_sms') continue;
        const { reviewReason: _orr, possibleDuplicateSmsIds: _opd, ...otherRest } = other;
        void _orr;
        void _opd;
        await persistRecord({ ...otherRest, status: 'ready', updatedAt: Date.now() });
      }
    },
    [persistRecord]
  );

  /** Commits a `'ready'` ("New Pending") item into a real `Expense` — reuses `~/components/shared/
   *  ExpenseForm.tsx` (its own `statementPreset` mode, same mechanism Bank Statement Import's own "add
   *  as new" flow already uses) as the actual category/account/payment-mode/description editing UI; this
   *  is just the save-path plumbing `ExpenseForm`'s `onSave` hands the finished `Expense` to — mirrors
   *  `useExpenses.ts`'s `saveExpenseWithHashtags` (hashtag usage-count bookkeeping + merchant-memory
   *  update + Timeline logging), independently re-implemented here rather than imported (feature modules
   *  must not cross-import — see `useAccounts.ts`'s own `saveAccount` for the same established pattern). */
  const commitReady = useCallback(
    async (record: SmsTransactionRecord, expense: Expense, newTagSetAside?: Record<string, boolean>) => {
      const finalExpense: Expense = { ...expense, source: 'sms', sourceRef: record.contentHash };
      await expensesRepo.put(finalExpense);
      notifyTxnChanged();

      for (const tag of finalExpense.hashtags) {
        const existingTag = hashtags.find((h) => h.name === tag);
        if (existingTag) {
          await saveHashtag({ ...existingTag, usageCount: existingTag.usageCount + 1 });
        } else {
          const setAside = newTagSetAside?.[tag] ?? false;
          await saveHashtag({
            id: crypto.randomUUID(),
            name: tag,
            usageCount: 1,
            setAside,
            hideInSafeMode: setAside,
            createdAt: Date.now()
          });
        }
      }

      const memory = buildMemory(finalExpense);
      if (memory) await merchantMemoryRepo.put(memory);

      logActivity({
        action: 'CREATE',
        entityType: 'expense',
        entityId: finalExpense.id,
        summary: `Added ${finalExpense.type ?? 'expense'}: ${finalExpense.description} ₹${finalExpense.amount}`
      });

      const { rawBody: _rawBody, ...rest } = record;
      void _rawBody;
      await persistRecord({ ...rest, status: 'linked', linkedTxnId: finalExpense.id, updatedAt: Date.now() });
    },
    [hashtags, saveHashtag, persistRecord]
  );

  /** User said "not a transaction" on a 'needs_review'/'ready' item. */
  const dismiss = useCallback(
    async (record: SmsTransactionRecord) => {
      const {
        reviewReason: _rr,
        possibleMatchExpenseIds: _pm,
        possibleDuplicateSmsIds: _pd,
        rawBody: _rb,
        ...rest
      } = record;
      void _rr;
      void _pm;
      void _pd;
      void _rb;
      await persistRecord({ ...rest, status: 'dismissed', updatedAt: Date.now() });
    },
    [persistRecord]
  );

  /** Dismisses an 'unparsed' message from the Unparsed Messages screen. */
  const dismissUnparsed = useCallback(
    async (record: SmsTransactionRecord) => {
      const { rawBody: _rb, ...rest } = record;
      void _rb;
      await persistRecord({ ...rest, status: 'dismissed', updatedAt: Date.now() });
    },
    [persistRecord]
  );

  /** Durably marks `sender` "never a transaction" (`SmsExcludedSender`, 2026-08-17) — `processRawSms`
   *  (and the headless/historical-scan paths, which read the same repo) will never create a fresh
   *  'unparsed' record for this sender again. Also dismisses every 'unparsed' record this sender
   *  already has right now, same as "Dismiss all" on its group — excluding a sender should clear it
   *  from view immediately, not just prevent future recurrence. */
  const excludeSender = useCallback(
    async (sender: string) => {
      if (!excludedSenderRecords.some((r) => r.sender === sender)) {
        await saveExcludedSender({ id: crypto.randomUUID(), sender, createdAt: Date.now() });
      }
      for (const record of recordsRef.current.filter((r) => r.sender === sender && r.status === 'unparsed')) {
        await dismissUnparsed(record);
      }
    },
    [excludedSenderRecords, saveExcludedSender, dismissUnparsed]
  );

  /** Reverses `excludeSender` — this sender's future messages resume normal parsing/review. Never
   *  retroactively restores anything already dismissed while the exclusion was active (same
   *  non-destructive spirit as every other session/settings toggle in this project). */
  const unexcludeSender = useCallback(
    async (sender: string) => {
      const existing = excludedSenderRecords.find((r) => r.sender === sender);
      if (existing) await removeExcludedSender(existing.id);
    },
    [excludedSenderRecords, removeExcludedSender]
  );

  /** Sender-mapping list edit (plan §7) — re-points an already-confirmed mapping at a different
   *  account; does NOT retroactively re-resolve already-processed records (matching Bank Statement
   *  Import's own precedent: a mapping correction only ever affects what happens from here on). */
  const editMapping = useCallback(
    async (mapping: SmsAccountMapping, accountId: string) => {
      await saveMapping({ ...mapping, accountId, updatedAt: Date.now() });
    },
    [saveMapping]
  );

  const deleteMapping = useCallback(
    async (mapping: SmsAccountMapping) => {
      await removeMapping(mapping.id);
    },
    [removeMapping]
  );

  /** "Create new account" inline from the ambiguous-account resolution modal (`ResolveAccountModal.tsx`)
   *  — same independent-`saveAccount`-implementation pattern `useExpenses.ts`'s own inline "+ Add
   *  account" already uses (a feature module can't import another feature module's hook), fed to
   *  `useAccountForm`/`~/components/shared/AccountFormModal.tsx` exactly the same way. */
  const saveAccountForForm = useCallback(async (data: AccountInput, editing: Account | null): Promise<Account> => {
    const now = Date.now();
    // `bankId`/`last4` stripped from `editing` before the merge — same fix as `useAccounts.ts`'s own
    // `saveAccount` (2026-08-15): a plain `{ ...editing, ...data }` would let clearing either field in
    // the form (an omitted key on `data`) silently keep the old value forever, since `data` never
    // carries an explicit `undefined` to override it (exactOptionalPropertyTypes disallows that).
    // This path only ever creates new accounts today (`ResolveAccountModal.tsx` always calls
    // `accountForm.openAdd()`, never `openEdit()`), so the bug was latent, not reachable — fixed here
    // anyway to keep the two `saveAccount` implementations consistent rather than leaving one silently
    // correct and one silently wrong if this ever gets reused for editing.
    const record: Account = editing
      ? (() => {
          const { bankId: _oldBankId, last4: _oldLast4, ...editingRest } = editing;
          void _oldBankId;
          void _oldLast4;
          return { ...editingRest, ...data, updatedAt: now };
        })()
      : { id: crypto.randomUUID(), ...data, isArchived: false, createdAt: now, updatedAt: now };
    await accountsRepo.put(record);
    logActivity({
      action: editing ? 'UPDATE' : 'CREATE',
      entityType: 'account',
      entityId: record.id,
      summary: `${editing ? 'Updated' : 'Added'} account: ${record.name}`
    });
    notifyAccountsChanged();
    return record;
  }, []);

  return {
    loading: recordsLoading,
    reload,
    accounts,
    accountsById,
    expensesById,
    categories,
    hashtags,
    mappings,
    linked,
    needsReview,
    ready,
    dismissed,
    unparsed,
    reviewQueueCount,
    processRawSms,
    resolveAmbiguousAccount,
    resolvePossibleMatch,
    resolveDuplicateSms,
    commitReady,
    dismiss,
    dismissUnparsed,
    excludedSenderRecords,
    excludeSender,
    unexcludeSender,
    editMapping,
    deleteMapping,
    saveAccountForForm,
    suggestCategoryForCounterparty
  };
}

export type UseSmsTrackingReturn = ReturnType<typeof useSmsTracking>;

/** Small helper for screens that only need to look up ONE account's display name — avoids every screen
 *  re-deriving `accountsById` from a plain list. */
export function accountLabel(accountsById: Map<string, Account>, accountId: string | undefined): string {
  if (!accountId) return 'Unknown account';
  return accountsById.get(accountId)?.name ?? 'Unknown account';
}
