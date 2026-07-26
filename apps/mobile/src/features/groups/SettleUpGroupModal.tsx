import { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button, AmountInput, SegmentedControl, SelectInput, TextInput, Toggle } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useToast } from '~/context/ToastContext';
import { formatCurrency } from '@/lib/formatters';
import { profileRepo, groupMembersRepo, accountsRepo } from '@/core/db/repositories';
import { appendGroupEvent, groupBalances } from '@/core/groups/groupSync';
import { recordGroupAccountTxn } from '@/core/groups/accountBridge';
import type { Account, Group, GroupMember } from '@/core/db/types';
import { useServerActionError } from './useServerActionError';

type Direction = 'they_paid_you' | 'you_paid_them';

/** RN port of apps/web-react/src/features/groups/SettleUpGroupModal.tsx — straightforward form port. */
export function SettleUpGroupModal({
  group,
  onClose,
  onSaved,
  initialCounterpart
}: {
  group: Group;
  onClose: () => void;
  onSaved: () => void;
  /** Preselect a member to settle with (from a dashboard "Settle up" chip). */
  initialCounterpart?: string | undefined;
}) {
  const theme = useThemeColors();
  const { showToast } = useToast();
  const onError = useServerActionError();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [myId, setMyId] = useState<string | undefined>();
  const [counterpart, setCounterpart] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('they_paid_you');
  const [note, setNote] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recordToAccount, setRecordToAccount] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill amount + direction from a counterpart's balance (positive = they owe you).
  function chooseCounterpart(userId: string, bal: Record<string, number> = balances) {
    setCounterpart(userId);
    const net = bal[userId] ?? 0;
    setDirection(net >= 0 ? 'they_paid_you' : 'you_paid_them');
    setAmount(net === 0 ? '' : String(Math.round(Math.abs(net))));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([groupMembersRepo.getAll(), profileRepo.getAll(), groupBalances(group.id), accountsRepo.getAll()]).then(
      ([all, profile, bal, accs]) => {
        if (cancelled) return;
        const me = profile[0]?.userId;
        const others = all.filter((m) => m.groupId === group.id && m.status === 'active' && m.userId !== me);
        const liveAccounts = accs.filter((a) => !a.isArchived);
        setMembers(others);
        setMyId(me);
        setBalances(bal);
        setAccounts(liveAccounts);
        setAccountId(liveAccounts[0]?.id ?? '');
        const preferred =
          initialCounterpart && others.some((m) => m.userId === initialCounterpart)
            ? initialCounterpart
            : others[0]?.userId;
        if (preferred) chooseCounterpart(preferred, bal);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  const options = useMemo(() => members.map((m) => ({ value: m.userId, label: m.displayName })), [members]);
  const value = Number(amount) || 0;

  async function handleSettle() {
    if (!counterpart || value <= 0 || !myId || saving) return;
    setSaving(true);
    try {
      const [from, to] = direction === 'they_paid_you' ? [counterpart, myId] : [myId, counterpart];
      await appendGroupEvent(group.id, 'settlement', { from, to, amount: value });
      // Bridge: optionally record the real money in/out on your account (the only crossover to personal).
      if (recordToAccount && accountId) {
        const withName = members.find((m) => m.userId === counterpart)?.displayName ?? 'member';
        await recordGroupAccountTxn({
          moneyIn: direction === 'they_paid_you',
          amount: value,
          accountId,
          description: note.trim() || `Settled with ${withName} · ${group.name || 'group'}`,
          groupId: group.id
        });
      }
      showToast({ message: 'Settlement recorded' });
      onSaved();
      onClose();
    } catch (err) {
      if (!onError(err, 'Could not record the settlement')) setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Settle up"
      footer={
        <Button
          fullWidth
          disabled={!counterpart || value <= 0 || saving}
          loading={saving}
          onPress={() => void handleSettle()}
        >
          Record settlement
        </Button>
      }
    >
      {members.length === 0 ? (
        <Text className="text-sm text-tertiary">No one else to settle with yet.</Text>
      ) : (
        <View className="gap-4">
          <SelectInput label="With" value={counterpart} onChange={(v) => chooseCounterpart(v)} options={options} />
          <AmountInput label="Amount" value={amount} onChange={setAmount} placeholder="0" />
          <View>
            <Text className="text-xs font-medium text-secondary mb-1.5">Direction</Text>
            <SegmentedControl
              options={[
                { value: 'they_paid_you' as const, label: 'They paid you' },
                { value: 'you_paid_them' as const, label: 'You paid them' }
              ]}
              value={direction}
              onChange={setDirection}
            />
          </View>
          <TextInput label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. UPI on 12 Jul" />

          {/* Account bridge — record the real money in/out. The only bridge to personal money. */}
          {accounts.length > 0 && (
            <View className="rounded-xl border border-theme p-3 gap-2">
              <View className="flex-row items-center gap-2.5">
                <Icon name="ti-building-bank" size={18} color={theme.primary} />
                <Text className="text-sm text-secondary flex-1">
                  Record {value > 0 ? formatCurrency(value) : '₹0'} {direction === 'they_paid_you' ? 'into' : 'out of'}{' '}
                  account
                </Text>
                <Toggle value={recordToAccount} onChange={setRecordToAccount} />
              </View>
              {recordToAccount && (
                <SelectInput
                  value={accountId}
                  onChange={setAccountId}
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                />
              )}
            </View>
          )}
          <Text className="text-[11px] text-tertiary">
            Settles the balance inside {group.name || 'this group'} only — it doesn&apos;t touch your personal IOU
            ledger.
            {value > 0 && ` Recording ${formatCurrency(value)}.`}
          </Text>
        </View>
      )}
    </Modal>
  );
}
