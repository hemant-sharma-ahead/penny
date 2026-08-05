import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { getAccountMeta } from '@/core/accounts/meta';
import { Card, Button, ConfirmDialog, EmptyState, IconBadge } from '~/components/ui';
import { EntityTransactionsModal } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { ReconcileModal } from './ReconcileModal';
import { accountCardPalette, tint } from '~/lib/color';

// Translucent-white overlay treatment for chips/dividers drawn on top of a per-account gradient card
// (mirrors docs/mockups/proposals/accounts-list-v1.html's "Direction D — Mini Cards v2"). These are
// relative to the card's own colored background, not the app's light/dark theme, so — like `ShareCard`'s
// hardcoded white text on its own gradient — they intentionally stay fixed rather than reading from
// `useThemeColors()`.
const ON_GRADIENT = {
  iconTileBg: 'rgba(255,255,255,0.16)',
  pillBg: 'rgba(255,255,255,0.12)',
  pillText: 'rgba(255,255,255,0.65)',
  divider: 'rgba(255,255,255,0.14)',
  caption: 'rgba(255,255,255,0.6)',
  chipBg: 'rgba(255,255,255,0.14)',
  negativeBalance: '#ffd7d7',
  deleteIcon: '#ffb3b3'
} as const;

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
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

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
        <View className="gap-2.5">
          {accounts.map((acc) => {
            const meta = getAccountMeta(acc.type);
            const balance = computeBalance(acc.id, acc.openingBalance, txns);
            const isNeg = balance < 0;
            const masked = shouldMask(acc.hideInSafeMode);
            const palette = accountCardPalette(acc.id, RECONCILABLE.has(acc.type));
            return (
              <Pressable
                key={acc.id}
                onPress={() => setViewingAccount(acc)}
                accessibilityLabel={`View transactions for ${acc.name}`}
                style={{
                  borderRadius: 16,
                  backgroundColor: palette.gradient[1],
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.45,
                  shadowRadius: 16,
                  elevation: 6
                }}
              >
                <LinearGradient
                  colors={palette.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 16, overflow: 'hidden', padding: 12, position: 'relative' }}
                >
                  {/* "Real card" sheen layers, back to front — all pointerEvents="none" and clipped by
                      this LinearGradient's own overflow:hidden. Ported from the mockup's `.herocard.v2`
                      rules; RN has no inset box-shadow, CSS blur filter, or repeating-linear-gradient, so
                      each layer is a pragmatic approximation (see docs/features/accounts.md for specifics
                      on what was skipped and why). */}

                  {/* 1. Inset top highlight — approximates `inset 0 1px 0 rgba(255,255,255,.14)` */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 1,
                      backgroundColor: 'rgba(255,255,255,0.14)'
                    }}
                  />

                  {/* 2. Diagonal light-sheen streak — oversized rotated gradient band */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: '-55%',
                      left: '-25%',
                      width: '170%',
                      height: '230%',
                      transform: [{ rotate: '-8deg' }]
                    }}
                  >
                    <LinearGradient
                      colors={['transparent', 'rgba(255,255,255,0.20)', 'transparent']}
                      locations={[0.4, 0.5, 0.6]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0.4 }}
                      style={{ flex: 1 }}
                    />
                  </View>

                  {/* 3a. Top-right glow — the account's own bright accent, low opacity */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      right: -30,
                      top: -30,
                      width: 150,
                      height: 150,
                      borderRadius: 75,
                      opacity: 0.35,
                      backgroundColor: palette.glow
                    }}
                  />

                  {/* 3b. A second, darker glow on the opposite corner for depth. No CSS blur filter on
                      plain RN Views — a soft low-opacity solid circle reads fine at this size instead. */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: -24,
                      bottom: -34,
                      width: 110,
                      height: 110,
                      borderRadius: 55,
                      opacity: 0.3,
                      backgroundColor: '#000'
                    }}
                  />

                  {/* Top row — icon tile (left) + account-type pill (right) */}
                  <View className="flex-row items-center justify-between mb-2.5">
                    <IconBadge icon={acc.icon} color="#fff" bg={ON_GRADIENT.iconTileBg} size="sm" />
                    <View className="px-2 py-1 rounded-full" style={{ backgroundColor: ON_GRADIENT.pillBg }}>
                      <Text
                        className="text-[9px] font-bold uppercase tracking-wide"
                        style={{ color: ON_GRADIENT.pillText }}
                      >
                        {meta.label}
                      </Text>
                    </View>
                  </View>

                  {/* Middle row — account name (left) + balance & net-worth caption (right-aligned) */}
                  <View className="flex-row items-start justify-between gap-2.5">
                    <Text className="flex-1 text-[13px] font-bold" style={{ color: '#fff' }} numberOfLines={1}>
                      {acc.name}
                    </Text>
                    <View className="items-end shrink-0">
                      <Text
                        className="text-sm font-extrabold"
                        style={{ color: !masked && isNeg ? ON_GRADIENT.negativeBalance : '#fff' }}
                      >
                        {masked ? '••••' : formatCurrency(balance)}
                      </Text>
                      <Text className="text-[9px] mt-0.5" style={{ color: ON_GRADIENT.caption }}>
                        {acc.includeInNetWorth ? 'Included in net worth' : 'Not counted in net worth'}
                      </Text>
                    </View>
                  </View>

                  <View className="h-px my-2.5" style={{ backgroundColor: ON_GRADIENT.divider }} />

                  {/* Bottom row — Import/Reconcile + Edit, then Delete separated at the far right */}
                  <View className="flex-row items-center gap-1.5">
                    {STATEMENT_IMPORTABLE.has(acc.type) && (
                      <Button
                        variant="ghost"
                        icon="ti-upload"
                        accessibilityLabel="Import statement"
                        className="w-8 h-8 rounded-lg"
                        color={tint(theme.primary, 30)}
                        textColor="#fff"
                        onPress={() => onImport(acc)}
                      />
                    )}
                    {RECONCILABLE.has(acc.type) && (
                      <Button
                        variant="ghost"
                        icon="ti-scale"
                        accessibilityLabel="Reconcile balance"
                        className="w-8 h-8 rounded-lg"
                        color={ON_GRADIENT.chipBg}
                        textColor="#fff"
                        onPress={() => setReconciling({ account: acc, balance })}
                      />
                    )}
                    <Button
                      variant="ghost"
                      icon="ti-pencil"
                      accessibilityLabel="Edit account"
                      className="w-8 h-8 rounded-lg"
                      color={ON_GRADIENT.chipBg}
                      textColor="#fff"
                      onPress={() => onEdit(acc)}
                    />
                    <Button
                      variant="ghost"
                      icon="ti-trash"
                      accessibilityLabel="Delete account"
                      className="w-8 h-8 rounded-lg ml-auto"
                      color={ON_GRADIENT.chipBg}
                      textColor={ON_GRADIENT.deleteIcon}
                      onPress={() => setDeletingId(acc.id)}
                    />
                  </View>
                </LinearGradient>
              </Pressable>
            );
          })}
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
        <EntityTransactionsModal
          key={viewingAccount.id}
          title={viewingAccount.name}
          statLabel="Current balance"
          statValue={
            shouldMask(viewingAccount.hideInSafeMode)
              ? '••••'
              : formatCurrency(computeBalance(viewingAccount.id, viewingAccount.openingBalance, txns))
          }
          expenses={txns.filter((t) => t.accountId === viewingAccount.id || t.toAccountId === viewingAccount.id)}
          categoryMap={categoryMap}
          accountMap={accountMap}
          hashtags={hashtags}
          shouldMask={shouldMask}
          onClose={() => setViewingAccount(null)}
        />
      )}
    </View>
  );
}
