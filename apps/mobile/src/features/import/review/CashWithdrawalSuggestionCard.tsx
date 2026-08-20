import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { SelectInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account } from '@/core/db/types';
import type { AccountInput } from '~/hooks/useAccountForm';
import { useAccountForm } from '~/hooks/useAccountForm';
import { AccountFormModal } from '~/components/shared/AccountFormModal';
import type { CashWithdrawalSuggestion } from '../useImport';
import { Pill } from './Pill';

interface CashWithdrawalSuggestionCardProps {
  suggestion: CashWithdrawalSuggestion;
  accounts: Account[];
  /** Present once this group's suggestion has been accepted — see `useImport.ts`'s
   *  `cashWithdrawalTargets` doc comment. Drives the confirmed/"Undo" state below instead of the
   *  pending ask. */
  target?: { accountId: string; accountName: string };
  onAccept: (fullKey: string, accountId: string, accountName: string) => void;
  onDismiss: (fullKey: string) => void;
  onUndo: (fullKey: string) => void;
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
    onAccept(suggestion.fullKey, selectedAccount.id, selectedAccount.name);
  }

  if (target) {
    return (
      <View className="rounded-xl border overflow-hidden bg-surface p-3 gap-2" style={{ borderColor: theme.success }}>
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-1.5 flex-1">
            <Icon name="ti-check" size={13} color={theme.success} />
            <Text className="text-[10.5px] font-bold flex-1" style={{ color: theme.success }} numberOfLines={2}>
              &quot;{suggestion.label}&quot; ({suggestion.count} row{suggestion.count !== 1 ? 's' : ''}) → transfer to
              &quot;{target.accountName}&quot;
            </Text>
          </View>
          <Pressable onPress={() => onUndo(suggestion.fullKey)} hitSlop={6}>
            <Text className="text-[10px] font-semibold" style={{ color: theme.textTertiary }}>
              Undo
            </Text>
          </Pressable>
        </View>
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
        <Pill onPress={() => onDismiss(suggestion.fullKey)}>Keep as separate expense category</Pill>
      </View>

      {accountForm.showForm && <AccountFormModal form={accountForm} saving={accountFormSaving} />}
    </View>
  );
}
