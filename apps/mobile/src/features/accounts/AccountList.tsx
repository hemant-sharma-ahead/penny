import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { CHECKPOINT_ELIGIBLE } from '@/core/bank-import/accountVerification';
import { Card, Button, ConfirmDialog, EmptyState, IconBadge, SectionLabel } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { BankLogo, bankAccentColor } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { ReconcileModal } from './ReconcileModal';
import { AccountDetailModal } from './AccountDetailModal';
import { useAccountVerification } from './useAccountVerification';
import { tint } from '~/lib/color';

interface AccountListProps {
  accounts: Account[];
  txns: Expense[];
  totalBalance: number;
  shouldMask: (sensitive: boolean | undefined) => boolean;
  categoryMap: Map<string, ExpenseCategory>;
  hashtags: Hashtag[];
  onAdd: () => void;
  onEdit: (acc: Account) => void;
  /** Bank statement import (docs/plans/bank-statement-import.md §3) is inherently scoped to one
   *  account — a bank issues one statement per account — so this row-level action is its only entry
   *  point, gated to bank/card accounts (a cash wallet has no statement). */
  onImport: (acc: Account) => void;
  /** Zero-account empty state's secondary action — Bank Import used to be unreachable with no accounts
   *  at all (found 2026-08-05). Creates a bank account and hands off straight into its import setup. */
  onImportOnboarding: () => void;
  deleteAccount: (id: string) => Promise<unknown>;
  reconcileAccount: (account: Account, actual: number) => Promise<void> | void;
}

const RECONCILABLE = new Set<Account['type']>(['cash', 'wallet']);
const STATEMENT_IMPORTABLE = new Set<Account['type']>(['bank', 'credit_card']);

/** Account-type grouping (docs/plans/real-device-testing-pass.md item 44 follow-up — account-card
 *  redesign, `account-list-redesign-v3.html`'s approved "✅ FINAL DIRECTION" section). Cash and Wallet
 *  share one section (both are the "money in hand" types, same as `RECONCILABLE` above already treats
 *  them as one bucket) — Bank and Credit Card each get their own. Fixed render order; a group with no
 *  matching accounts is simply skipped, never shown empty. */
const ACCOUNT_GROUPS: Array<{ key: string; label: string; types: Set<Account['type']> }> = [
  { key: 'bank', label: 'Bank Accounts', types: new Set(['bank']) },
  { key: 'cash', label: 'Cash & Wallets', types: new Set(['cash', 'wallet']) },
  { key: 'credit', label: 'Credit Cards', types: new Set(['credit_card']) }
];

export function AccountList({
  accounts,
  txns,
  totalBalance,
  shouldMask,
  categoryMap,
  hashtags,
  onAdd,
  onEdit,
  onImport,
  onImportOnboarding,
  deleteAccount,
  reconcileAccount
}: AccountListProps) {
  const theme = useThemeColors();
  const totalMasked = shouldMask(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<{ account: Account; balance: number } | null>(null);
  const [viewingAccount, setViewingAccount] = useState<Account | null>(null);
  // Which accounts currently have their Import/Reconcile/Edit/Delete row revealed (Model 3,
  // "tap-to-reveal" — the vertical kebab beside the balance toggles membership; independent per
  // account, matching the mockup's `toggleFinalReveal()` which never closes any other open row).
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  // Closed accounts (2026-08-27) get their own collapsed section at the bottom, same pattern IOU's
  // Archived section already uses — collapsed by default since they're expected to be rare.
  const [showClosed, setShowClosed] = useState(false);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const txnCountByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txns) {
      if (t.accountId) map.set(t.accountId, (map.get(t.accountId) ?? 0) + 1);
      if (t.toAccountId) map.set(t.toAccountId, (map.get(t.toAccountId) ?? 0) + 1);
    }
    return map;
  }, [txns]);
  const {
    statuses: verificationStatuses,
    loading: verificationLoading,
    dismissFinding,
    reopenFinding
  } = useAccountVerification(accounts, txns);

  function toggleRevealed(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** One account row, shared by the normal type-group sections below and the Closed section
   *  (2026-08-27) — same row visual either way; `hideImportReconcile` drops those two revealed-row
   *  actions for a closed account, since neither makes sense for something no longer operational
   *  (Edit — to reopen it — and Delete stay either way). */
  function renderAccountRow(acc: Account, i: number, hideImportReconcile: boolean) {
    const balance = computeBalance(acc.id, acc.openingBalance, txns);
    const isNeg = balance < 0;
    const masked = shouldMask(acc.hideInSafeMode);
    // The persistent "unverified" badge (docs/plans/bank-balance-sync.md §7 Stage 4) —
    // binary at list level by design (verified/never-imported/dismissed all look
    // identical here; the account detail view is where that ambiguity resolves into 6
    // distinct states). The redesign mockup (account-list-redesign-v3.html §final)
    // didn't carry this real, already-shipped feature over — folded in here as a small
    // warning glyph beside the name rather than dropping it silently.
    const needsAttention =
      CHECKPOINT_ELIGIBLE.has(acc.type) && (verificationStatuses.get(acc.id)?.needsAttention ?? false);
    const isRevealed = revealedIds.has(acc.id);
    const txnCount = txnCountByAccount.get(acc.id) ?? 0;
    return (
      <View key={acc.id} className={`px-3 py-2.5 ${i > 0 ? 'border-t border-theme' : ''}`}>
        {/* Whole-row tap still opens the transaction popup, unchanged — the vertical
            kebab below is a separate, nested `Pressable`, so tapping it doesn't also
            trigger this one (same nesting the old Import/Edit/Delete buttons already
            relied on inside the card's outer `Pressable`). */}
        <Pressable
          onPress={() => setViewingAccount(acc)}
          accessibilityLabel={`View transactions for ${acc.name}`}
          className="flex-row items-center gap-2.5"
          style={hideImportReconcile ? { opacity: 0.55 } : undefined}
        >
          <IconBadge
            icon={acc.icon}
            color={acc.color}
            bg={tint(bankAccentColor(acc), 14)}
            size="sm"
            iconElement={<BankLogo account={acc} size={16} color={bankAccentColor(acc)} />}
          />
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-1">
              <Text className="text-[13px] font-semibold text-primary" numberOfLines={1}>
                {acc.name}
              </Text>
              {/* Default pill (2026-08-27) — right next to the name, same slot `needsAttention`'s glyph
                  already sits in. At most one account across the whole set ever has this. */}
              {acc.isDefault && (
                <View
                  className="px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: tint(theme.success, 16) }}
                >
                  <Text className="text-[7px] font-bold uppercase" style={{ color: theme.success }}>
                    Default
                  </Text>
                </View>
              )}
              {needsAttention && <Icon name="ti-alert-triangle" size={11} color={theme.warning} />}
            </View>
            <Text className="text-[10px] text-tertiary mt-0.5" numberOfLines={1}>
              {txnCount} transaction{txnCount !== 1 ? 's' : ''}
            </Text>
          </View>
          <View className="items-end shrink-0">
            <View className="flex-row items-center gap-1">
              <Text
                className="text-[13px] font-bold"
                style={{ color: !masked && isNeg ? theme.danger : theme.textPrimary }}
              >
                {masked ? '••••' : formatCurrency(balance)}
              </Text>
              {/* Vertical kebab beside the balance — tap reveals the action row below
                  (Model 3, per the approved mockup). Nested `Pressable`, own hit target,
                  independent of the row's own onPress above. */}
              <Pressable
                onPress={() => toggleRevealed(acc.id)}
                accessibilityLabel={`${isRevealed ? 'Hide' : 'Show'} actions for ${acc.name}`}
                className="w-5 h-5 rounded-md items-center justify-center"
                style={{ backgroundColor: isRevealed ? tint(theme.primary, 16) : 'transparent' }}
              >
                <Icon name="ti-dots-vertical" size={13} color={isRevealed ? theme.primary : theme.textTertiary} />
              </Pressable>
            </View>
            <Text className="text-[9px] text-tertiary mt-0.5">
              {acc.includeInNetWorth ? 'Included in net worth' : 'Not counted in net worth'}
            </Text>
          </View>
        </Pressable>

        {/* Revealed row — Import XOR Reconcile (the two sets partition all 4 account
            types, so exactly one of these ever renders) + Edit + Delete. Never a
            separate "view transactions" icon here — that's the row tap above, unchanged. */}
        {isRevealed && (
          <View className="flex-row items-center justify-end gap-1.5 mt-2 pt-2 border-t border-theme">
            {!hideImportReconcile && STATEMENT_IMPORTABLE.has(acc.type) && (
              <Button
                variant="ghost"
                icon="ti-upload"
                accessibilityLabel="Import statement"
                className="w-6 h-6 rounded-md"
                color={theme.surfaceSecondary}
                textColor={theme.textSecondary}
                onPress={() => onImport(acc)}
              />
            )}
            {!hideImportReconcile && RECONCILABLE.has(acc.type) && (
              <Button
                variant="ghost"
                icon="ti-scale"
                accessibilityLabel="Reconcile balance"
                className="w-6 h-6 rounded-md"
                color={theme.surfaceSecondary}
                textColor={theme.textSecondary}
                onPress={() => setReconciling({ account: acc, balance })}
              />
            )}
            <Button
              variant="ghost"
              icon="ti-pencil"
              accessibilityLabel="Edit account"
              className="w-6 h-6 rounded-md"
              color={theme.surfaceSecondary}
              textColor={theme.textSecondary}
              onPress={() => onEdit(acc)}
            />
            <Button
              variant="ghost"
              icon="ti-trash"
              accessibilityLabel="Delete account"
              className="w-6 h-6 rounded-md"
              color={tint(theme.danger, 14)}
              textColor={theme.danger}
              onPress={() => setDeletingId(acc.id)}
            />
          </View>
        )}
      </View>
    );
  }

  const closedAccounts = accounts.filter((a) => a.isClosed);

  return (
    <View className="px-4 py-4 gap-3">
      {accounts.length > 0 && (
        <Card>
          <Text className="text-xs text-tertiary font-medium uppercase tracking-wide mb-1">Total Balance</Text>
          <Text className="text-2xl font-bold text-primary">
            {totalMasked ? '••••••' : formatCurrency(totalBalance)}
          </Text>
          <Text className="text-xs text-tertiary mt-0.5">
            Across {accounts.length} account{accounts.length !== 1 ? 's' : ''} in net worth
          </Text>
        </Card>
      )}

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon="ti-wallet"
            title="No accounts yet"
            description="Add a cash wallet or bank account to start tracking balances."
            action={{ label: 'Add first account', onPress: onAdd, icon: 'ti-plus' }}
            secondaryAction={{
              label: 'or import a bank statement',
              onPress: onImportOnboarding,
              icon: 'ti-file-import'
            }}
          />
        </Card>
      ) : (
        <View className="gap-4">
          {ACCOUNT_GROUPS.map((group) => {
            // Closed accounts (2026-08-27) never show in their normal type group — they move into
            // their own section below instead, same as IOU's Archived persons never show in the main list.
            const groupAccounts = accounts.filter((a) => group.types.has(a.type) && !a.isClosed);
            if (groupAccounts.length === 0) return null;
            return (
              <View key={group.key} className="gap-1.5">
                <SectionLabel className="mb-0 mx-1">{group.label}</SectionLabel>
                <View className="bg-surface border border-theme rounded-2xl overflow-hidden">
                  {groupAccounts.map((acc, i) => renderAccountRow(acc, i, false))}
                </View>
              </View>
            );
          })}

          {closedAccounts.length > 0 && (
            <View className="gap-1.5">
              <Pressable
                onPress={() => setShowClosed((v) => !v)}
                className="flex-row items-center justify-between mx-1"
              >
                <Text className="text-xs font-semibold text-tertiary">Closed ({closedAccounts.length})</Text>
                <Icon name={showClosed ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
              </Pressable>
              {showClosed && (
                <View className="bg-surface border border-theme rounded-2xl overflow-hidden">
                  {closedAccounts.map((acc, i) => renderAccountRow(acc, i, true))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) void deleteAccount(deletingId);
          setDeletingId(null);
        }}
        title="Delete account?"
        message="The account will be removed. Transactions linked to it will remain but will show no account."
        confirmLabel="Delete"
        confirmVariant="danger"
      />

      {reconciling && (
        <ReconcileModal
          account={reconciling.account}
          currentBalance={reconciling.balance}
          onReconcile={reconcileAccount}
          onClose={() => setReconciling(null)}
        />
      )}

      {viewingAccount && (
        <AccountDetailModal
          key={viewingAccount.id}
          account={viewingAccount}
          txns={txns}
          categoryMap={categoryMap}
          accountMap={accountMap}
          hashtags={hashtags}
          shouldMask={shouldMask}
          verification={verificationStatuses.get(viewingAccount.id)}
          verificationLoading={verificationLoading}
          onDismiss={(fingerprint) => void dismissFinding(viewingAccount.id, fingerprint)}
          onReopen={(fingerprint) => void reopenFinding(viewingAccount.id, fingerprint)}
          onClose={() => setViewingAccount(null)}
        />
      )}
    </View>
  );
}
