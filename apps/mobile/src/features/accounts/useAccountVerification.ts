import { useCallback, useEffect, useMemo } from 'react';
import type { Account, Expense } from '@/core/db/types';
import { accountsRepo, bankStatementImportsRepo } from '@/core/db/repositories';
import {
  CHECKPOINT_ELIGIBLE,
  computeAccountVerificationStatus,
  type AccountVerificationStatus
} from '@/core/bank-import/accountVerification';
import { backDerivedOpeningBalance, recomputeAnchorAgreement } from '@/core/bank-import/openingBalanceAnchor';
import { useRepository } from '@/hooks/useRepository';
import { notifyAccountsChanged, useBankImportsRefresh } from '@/hooks/useDataRefresh';

/**
 * Computes the unified "unverified account" status (docs/plans/bank-balance-sync.md §7 Stage 4) for
 * every checkpoint-eligible account, and owns persisting a dismiss/re-open action against
 * `Account.dismissedVerificationFindings`. Loads `bankStatementImportsRepo` itself (needed for the
 * standing-gap sweep) — `accounts`/`txns` are passed in rather than reloaded here, since
 * `useAccounts.ts` already owns that state and every caller of this hook already has it in scope.
 */
export function useAccountVerification(accounts: Account[], txns: Expense[]) {
  const {
    items: allImportRecords,
    loading: importRecordsLoading,
    reload: reloadImportRecords
  } = useRepository(bankStatementImportsRepo);
  // Real bug found via on-device testing 2026-08-09: `AccountsPage`/`AccountList` (this hook's only
  // caller) is a persistent screen inside `HomeStack` that never unmounts while `BankImportPage` is
  // pushed on top of it — so this hook's own `useRepository(bankStatementImportsRepo)` loaded ONCE,
  // before the import ever ran, and stayed on that stale (often empty) snapshot forever after,
  // regardless of how many bank-import commits happened while this screen sat underneath. Every OTHER
  // repo this hook/its siblings read (`accounts`, `txns`) already has a matching notify/refresh pair
  // (`useAccountsRefresh`/`useTxnRefresh`) — `bankStatementImportsRepo` was simply missing its own.
  useBankImportsRefresh(reloadImportRecords);

  const statuses = useMemo(() => {
    const map = new Map<string, AccountVerificationStatus>();
    for (const acc of accounts) {
      if (!CHECKPOINT_ELIGIBLE.has(acc.type)) continue;
      const accountTxns = txns.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id);
      const importRecords = allImportRecords.filter((r) => r.accountId === acc.id);
      map.set(
        acc.id,
        computeAccountVerificationStatus({
          accountId: acc.id,
          openingBalance: acc.openingBalance,
          openingBalanceAsOfDate: acc.openingBalanceAsOfDate,
          accountTxns,
          importRecords,
          coveredRanges: acc.coveredStatementRanges ?? [],
          anchorReference: acc.anchorReference,
          dismissed: acc.dismissedVerificationFindings ?? []
        })
      );
    }
    return map;
  }, [accounts, txns, allImportRecords]);

  // Self-correcting `Account.openingBalance` for a still-open (or just-resolved) anchor-shift disagreement
  // (found + fixed 2026-08-09, on-device: chose "Keep, flag", later re-imported a corrected statement
  // that fixed the actual error — the badge correctly went quiet, but `Account.openingBalance` stayed
  // frozen at the value back-derived from the ORIGINAL, erroneous transactions, silently understating the
  // account's real total everywhere `computeBalance()` is used — Accounts list, Home net worth, all of
  // it). There is no separate "recalculate" concept here: `backDerivedOpeningBalance()` on a FRESH
  // `recomputeAnchorAgreement()` result is the EXACT SAME formula that produced the stored value the
  // first time, just re-run against CURRENT transactions instead of a stale snapshot — the same
  // "never trust a frozen number, always recompute" principle already applied to the finding itself,
  // extended to the stored value that finding was protecting. Once it fully agrees,
  // `anchorReference` is cleared too — the disputed claim and the account's own real value have converged,
  // nothing is left to keep tracking. No user decision is made here (that already happened when "Keep"
  // was tapped) — this is pure bookkeeping consistency, so it's safe to do silently, unlike the original
  // three-way choice.
  useEffect(() => {
    for (const acc of accounts) {
      if (!CHECKPOINT_ELIGIBLE.has(acc.type) || !acc.anchorReference || acc.openingBalanceAsOfDate === undefined) {
        continue;
      }
      const accountTxns = txns.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id);
      const check = recomputeAnchorAgreement(acc.id, acc.openingBalanceAsOfDate, acc.anchorReference, accountTxns);
      const corrected = backDerivedOpeningBalance(check);
      const needsBalanceFix = Math.abs(corrected - acc.openingBalance) >= 1;
      if (!needsBalanceFix && !check.agrees) continue; // already correct, still a real open disagreement
      const next: Account = {
        ...acc,
        openingBalance: corrected,
        updatedAt: Date.now(),
        ...(check.agrees ? { anchorReference: undefined } : {})
      };
      void accountsRepo.put(next).then(() => notifyAccountsChanged());
    }
  }, [accounts, txns]);

  // Both actions below look up the account FRESH from `accounts` (this hook's own prop) by id, rather
  // than trusting a caller-held `Account` object — a caller like `AccountDetailModal` holds its
  // `viewingAccount` in a `useState` set once when the row was tapped, which does NOT track later
  // writes made during the same open-modal session (e.g. "Re-open" immediately followed by "Dismiss"
  // again). Writing from a stale snapshot would silently drop whichever dismissal happened first in
  // that session — looking the account up here, in a callback that re-creates whenever `accounts`
  // itself changes, avoids that class of bug entirely.

  /** "I've reviewed this, dismiss" (§9 Q1) — scoped to the one fingerprint, never a blanket silence. */
  const dismissFinding = useCallback(
    async (accountId: string, fingerprint: string) => {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;
      const next: Account = {
        ...account,
        dismissedVerificationFindings: [
          ...(account.dismissedVerificationFindings ?? []).filter((d) => d.fingerprint !== fingerprint),
          { fingerprint, dismissedAt: Date.now() }
        ],
        updatedAt: Date.now()
      };
      await accountsRepo.put(next);
      notifyAccountsChanged();
    },
    [accounts]
  );

  /** "Re-open" (mockup Frame 2f) — removes one specific dismissal, letting it show as active again. */
  const reopenFinding = useCallback(
    async (accountId: string, fingerprint: string) => {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;
      const next: Account = {
        ...account,
        dismissedVerificationFindings: (account.dismissedVerificationFindings ?? []).filter(
          (d) => d.fingerprint !== fingerprint
        ),
        updatedAt: Date.now()
      };
      await accountsRepo.put(next);
      notifyAccountsChanged();
    },
    [accounts]
  );

  return { statuses, loading: importRecordsLoading, dismissFinding, reopenFinding };
}
