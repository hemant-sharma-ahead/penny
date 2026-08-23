import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { SelectInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { BankLogo } from '~/components/shared/BankLogo';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency, formatCompact } from '@/lib/formatters';
import type { Account } from '@/core/db/types';
import type { AccountInput } from '~/hooks/useAccountForm';
import { useAccountForm } from '~/hooks/useAccountForm';
import { AccountFormModal } from '~/components/shared/AccountFormModal';
import type { CashWithdrawalSuggestion } from '../useImport';
import { Pill } from './Pill';
import { CashWithdrawalSeeAllModal } from './CashWithdrawalSeeAllModal';
import { INLINE_ROW_THRESHOLD } from './TileRowList';

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface CashWithdrawalSuggestionCardProps {
  suggestion: CashWithdrawalSuggestion;
  accounts: Account[];
  /** Present once THIS suggestion (keyed by `suggestion.key`, not the shared `fullKey` — see
   *  `useImport.ts`'s `CashWithdrawalSuggestion` doc comment) has been accepted — see
   *  `cashWithdrawalTargets`' own doc comment. Drives the confirmed/"Undo" state below instead of the
   *  pending ask. */
  target?: { accountId: string; accountName: string };
  onAccept: (key: string, accountId: string, accountName: string) => void;
  onDismiss: (key: string) => void;
  onUndo: (key: string) => void;
  /** Creates a real `Account` immediately — same `useImport.ts` `createAccount` used by the Accounts
   *  stage's own "+ Create Account" button, per this session's established "reuse the real
   *  `AccountFormModal`, never invent a one-off account-creation UI" pattern. */
  createAccount: (data: AccountInput, editing: Account | null) => Promise<Account>;
}

/**
 * "Looks like a cash withdrawal — turn these into transfers to your Cash account?" suggestion
 * (2026-08-20, real-device testing pass — docs/plans/real-device-testing-pass.md). Modeled closely on
 * `AccountsSection.tsx`'s card→account merge suggestion banner: same "always ask, never auto-apply"
 * contract, same Pill accept/dismiss actions. Distinct trigger (a single-leg cash/ATM-withdrawal
 * category group — `isLikelyCashWithdrawal`/`useImport.ts`'s `cashWithdrawalSuggestions` — rather than a
 * shared bank/card identity) and target (a real Cash-type `Account`, picked or created here, rather than
 * another CSV source account).
 *
 * Picker defaults to the sole existing Cash account when there's exactly one (still requires the
 * explicit Confirm tap below — never pre-applied), offers a real dropdown when there are several, and
 * swaps to a "+ Create a Cash account" action (opening the real `AccountFormModal`, pre-seeded to type
 * `cash`) when there are none yet.
 */
export function CashWithdrawalSuggestionCard({
  suggestion,
  accounts,
  target,
  onAccept,
  onDismiss,
  onUndo,
  createAccount
}: CashWithdrawalSuggestionCardProps) {
  const theme = useThemeColors();
  const cashAccounts = accounts.filter((a) => a.type === 'cash');
  const [pickedAccountId, setPickedAccountId] = useState('');
  // Item 71 (2026-08-23) — "See all" popup for the accepted-state rich preview below, only ever opened
  // once this group's row count exceeds `INLINE_ROW_THRESHOLD`.
  const [showSeeAll, setShowSeeAll] = useState(false);
  // Defaults to the sole Cash account when exactly one exists — a pre-fill only, the user still has to
  // tap Confirm below before anything is applied (mirrors `AccountsSection.tsx`'s fuzzy-match prefill).
  const soleCashAccount = cashAccounts.length === 1 ? cashAccounts[0] : undefined;
  const selectedAccountId = pickedAccountId || soleCashAccount?.id || '';
  const selectedAccount = cashAccounts.find((a) => a.id === selectedAccountId);

  const [accountFormSaving, setAccountFormSaving] = useState(false);
  const accountForm = useAccountForm(async (data, editing) => {
    setAccountFormSaving(true);
    try {
      return await createAccount(data, editing);
    } finally {
      setAccountFormSaving(false);
    }
  }, accounts);

  function handleCreateCashAccount() {
    accountForm.openAddWithType('cash', (acc) => setPickedAccountId(acc.id));
  }

  function handleConfirm() {
    if (!selectedAccount) return;
    onAccept(suggestion.key, selectedAccount.id, selectedAccount.name);
  }

  if (target) {
    // Item 71 (2026-08-23, 8th batch real-device testing pass) — a real from→to card
    // (`TransferPairCard.tsx`'s visual language: source bank account → arrow → chosen Cash account),
    // keeping this suggestion's existing GROUPING (every row sharing one target Cash account shown
    // together in ONE card, never one card per row) but listing each row's own date/amount inside that
    // one card, so what will actually import as a transfer is visible before committing — replaces the
    // old flat one-line text banner this branch used to render.
    const targetAccount = accounts.find((a) => a.id === target.accountId);
    const totalAmount = suggestion.rows.reduce((sum, r) => sum + r.amount, 0);
    const inlineRows = suggestion.rows.slice(0, INLINE_ROW_THRESHOLD);
    const hiddenCount = suggestion.rows.length - inlineRows.length;

    return (
      <View
        className="rounded-xl p-3 gap-2.5"
        style={{ backgroundColor: tint(theme.info, 8), borderWidth: 1, borderColor: tint(theme.info, 28) }}
      >
        <View className="flex-row items-center gap-2">
          <View className="flex-1 items-center">
            <View className="flex-row items-center gap-1">
              {suggestion.fromAccountResolved && (
                <View
                  className="w-3.5 h-3.5 rounded items-center justify-center"
                  style={{ backgroundColor: suggestion.fromAccountResolved.color }}
                >
                  <BankLogo account={suggestion.fromAccountResolved} size={8} color="#fff" />
                </View>
              )}
              <Text
                className="text-[11px] font-extrabold text-center"
                numberOfLines={1}
                style={{ color: theme.textPrimary }}
              >
                {suggestion.fromAccountLabel}
              </Text>
            </View>
            <Text className="text-[9.5px] text-secondary">-{formatCurrency(totalAmount)}</Text>
          </View>
          <View className="items-center flex-shrink-0" style={{ minWidth: 64 }}>
            <Icon name="ti-arrow-narrow-right" size={18} color={theme.info} />
            <Text className="text-xs font-extrabold" style={{ color: theme.info }}>
              {formatCompact(totalAmount)}
            </Text>
            <Text className="text-[9.5px] font-bold uppercase tracking-wide" style={{ color: theme.info }}>
              Transfer
            </Text>
          </View>
          <View className="flex-1 items-center">
            <View className="flex-row items-center gap-1">
              {targetAccount && (
                <View
                  className="w-3.5 h-3.5 rounded items-center justify-center"
                  style={{ backgroundColor: targetAccount.color }}
                >
                  <BankLogo account={targetAccount} size={8} color="#fff" />
                </View>
              )}
              <Text
                className="text-[11px] font-extrabold text-center"
                numberOfLines={1}
                style={{ color: theme.textPrimary }}
              >
                {target.accountName}
              </Text>
            </View>
            <Text className="text-[9.5px] font-semibold" style={{ color: theme.success }}>
              +{formatCurrency(totalAmount)}
            </Text>
          </View>
        </View>

        {/* Rows inline up to `TileRowList.tsx`'s own >4-rows threshold — beyond that, only reachable via
         *  "See all" below, never an unbounded inline render. */}
        <View className="gap-1.5 border-t border-dashed pt-2" style={{ borderColor: tint(theme.info, 25) }}>
          <Text className="text-[9px] font-extrabold uppercase tracking-wide text-tertiary">
            {suggestion.count} row{suggestion.count !== 1 ? 's' : ''} in this group
          </Text>
          {inlineRows.map((r, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <Text className="text-[10px] text-secondary flex-shrink-0">{fmtShortDate(r.date)}</Text>
              <Text className="text-[10px] text-primary flex-1 min-w-0" numberOfLines={1}>
                {r.description}
              </Text>
              <Text className="text-[10px] font-semibold text-primary flex-shrink-0">{formatCurrency(r.amount)}</Text>
            </View>
          ))}
        </View>

        {hiddenCount > 0 && (
          <View
            className="flex-row items-center justify-between border-t border-dashed pt-2"
            style={{ borderColor: tint(theme.info, 25) }}
          >
            <Text className="text-[10px] font-bold text-tertiary">
              {hiddenCount} more row{hiddenCount !== 1 ? 's' : ''}
            </Text>
            <Pressable onPress={() => setShowSeeAll(true)} hitSlop={6}>
              <Text className="text-[10px] font-bold" style={{ color: theme.info }}>
                See all {suggestion.rows.length} →
              </Text>
            </Pressable>
          </View>
        )}

        <View className="flex-row items-center justify-between">
          <Text className="text-[9px] text-tertiary flex-1" numberOfLines={1}>
            &quot;{suggestion.label}&quot; category
          </Text>
          <Pressable onPress={() => onUndo(suggestion.key)} hitSlop={6}>
            <Text className="text-[10px] font-semibold" style={{ color: theme.textTertiary }}>
              Undo
            </Text>
          </Pressable>
        </View>

        {showSeeAll && (
          <CashWithdrawalSeeAllModal
            fromLabel={suggestion.fromAccountLabel}
            toLabel={target.accountName}
            rows={suggestion.rows}
            totalAmount={totalAmount}
            onClose={() => setShowSeeAll(false)}
          />
        )}
      </View>
    );
  }

  return (
    <View className="rounded-xl border overflow-hidden bg-surface p-3 gap-2" style={{ borderColor: theme.warning }}>
      <View className="flex-row items-center gap-1.5">
        <Icon name="ti-cash" size={13} color={theme.warning} />
        <Text className="text-[10.5px] font-bold text-primary flex-1" numberOfLines={1}>
          &quot;{suggestion.label}&quot; · {suggestion.count} row{suggestion.count !== 1 ? 's' : ''}
        </Text>
      </View>
      <Text className="text-[10px]" style={{ color: theme.warning }}>
        Looks like a cash withdrawal — turn these into transfers to your Cash account?
      </Text>

      {cashAccounts.length > 0 ? (
        <SelectInput
          value={selectedAccountId}
          onChange={setPickedAccountId}
          options={cashAccounts.map((a) => ({ value: a.id, label: a.name }))}
          placeholder="Choose a Cash account"
        />
      ) : (
        <View
          className="flex-row items-center gap-1.5 rounded-lg px-2 py-1.5"
          style={{ backgroundColor: tint(theme.warning, 12) }}
        >
          <Icon name="ti-info-circle" size={11} color={theme.warning} />
          <Text className="text-[9.5px] flex-1" style={{ color: theme.warning }}>
            You don&apos;t have a Cash account yet.
          </Text>
        </View>
      )}

      <Pressable onPress={handleCreateCashAccount} hitSlop={6}>
        <Text className="text-[10px] font-semibold" style={{ color: theme.primary }}>
          + Create a Cash account{cashAccounts.length > 0 ? ' instead' : ''}
        </Text>
      </Pressable>

      <View className="flex-row gap-1.5 flex-wrap">
        <Pill active={!!selectedAccount} onPress={handleConfirm}>
          {selectedAccount ? `Turn into transfer → "${selectedAccount.name}"` : 'Turn into transfer'}
        </Pill>
        <Pill onPress={() => onDismiss(suggestion.key)}>Keep as separate expense category</Pill>
      </View>

      {accountForm.showForm && <AccountFormModal form={accountForm} saving={accountFormSaving} />}
    </View>
  );
}
