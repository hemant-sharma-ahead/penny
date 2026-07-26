import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput as RNTextInput, ScrollView } from 'react-native';
import { Modal, Button, TextInput, AmountInput, SegmentedControl, SelectInput, Toggle } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useToast } from '~/context/ToastContext';
import { formatCurrency } from '@/lib/formatters';
import { profileRepo, groupMembersRepo, expenseCategoriesRepo, accountsRepo } from '@/core/db/repositories';
import { appendGroupEvent } from '@/core/groups/groupSync';
import { computeShares, type SplitMethod } from '@/core/groups/split';
import { recordGroupAccountTxn } from '@/core/groups/accountBridge';
import { CategoryPickerModal } from '~/features/expenses/categories/CategoryPickerModal';
import type { Account, ExpenseCategory, Group, GroupMember } from '@/core/db/types';
import { useServerActionError } from './useServerActionError';

const METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'unequal', label: 'Unequal' },
  { value: 'percent', label: '%' },
  { value: 'shares', label: 'Shares' }
];

function Avatar({ name, on, dim, onPress }: { name: string; on?: boolean; dim?: boolean; onPress?: () => void }) {
  const theme = useThemeColors();
  return (
    <Pressable onPress={onPress} className="items-center gap-1" style={{ width: 52, opacity: dim ? 0.35 : 1 }}>
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{
          backgroundColor: '#6366f1',
          borderWidth: on ? 2 : 0,
          borderColor: theme.primary
        }}
      >
        <Text className="text-xs font-semibold text-white">{(name || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <Text className="text-[10px] text-secondary" numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

/** RN port of apps/web-legacy/src/features/groups/SharedExpenseComposer.tsx. */
export function SharedExpenseComposer({
  group,
  onClose,
  onSaved
}: {
  group: Group;
  onClose: () => void;
  onSaved: () => void;
}) {
  const theme = useThemeColors();
  const { showToast } = useToast();
  const onError = useServerActionError();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [myId, setMyId] = useState<string | undefined>();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [payer, setPayer] = useState('');
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<SplitMethod>('equal');
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  // Account bridge (screen 4): record the real cash-out to your account. ON by default; only meaningful
  // when YOU are the payer (you fronted the money).
  const [recordToAccount, setRecordToAccount] = useState(true);
  const [accountId, setAccountId] = useState('');

  const selectedCat = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      groupMembersRepo.getAll(),
      expenseCategoriesRepo.getAll(),
      profileRepo.getAll(),
      accountsRepo.getAll()
    ]).then(([allMembers, cats, profile, accs]) => {
      if (cancelled) return;
      const active = allMembers.filter((m) => m.groupId === group.id && m.status === 'active');
      const me = profile[0]?.userId;
      const liveAccounts = accs.filter((a) => !a.isArchived);
      setMembers(active);
      setCategories(cats.filter((c) => (c.applicableTo ?? 'expense') === 'expense' && !c.isGroup));
      setAccounts(liveAccounts);
      setMyId(me);
      setPayer(me && active.some((m) => m.userId === me) ? me : (active[0]?.userId ?? ''));
      setParticipants(new Set(active.map((m) => m.userId)));
      setAccountId(liveAccounts[0]?.id ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  const total = Number(amount) || 0;
  const participantIds = useMemo(
    () => members.map((m) => m.userId).filter((id) => participants.has(id)),
    [members, participants]
  );
  const split = useMemo(
    () => computeShares({ total, method, participants: participantIds, values }),
    [total, method, participantIds, values]
  );
  const nameFor = (id: string) => members.find((m) => m.userId === id)?.displayName ?? 'Member';

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!split.valid || total <= 0 || !payer || saving) return;
    setSaving(true);
    try {
      await appendGroupEvent(group.id, 'shared_expense', {
        expenseId: crypto.randomUUID(),
        amount: total,
        payer,
        shares: split.shares,
        description: description.trim(),
        categoryId: categoryId || undefined
      });
      // Bridge: if you fronted the money and opted in, record the real cash-out on your account.
      if (recordToAccount && payer === myId && accountId) {
        await recordGroupAccountTxn({
          moneyIn: false,
          amount: total,
          accountId,
          description: description.trim() || 'Shared expense',
          categoryId: categoryId || undefined,
          groupId: group.id
        });
      }
      showToast({ message: 'Shared expense added' });
      onSaved();
      onClose();
    } catch (err) {
      if (!onError(err, 'Could not add the expense')) setSaving(false);
    }
  }

  return (
    <>
      <Modal
        onClose={onClose}
        title="Add shared expense"
        scrollable
        footer={
          <Button
            fullWidth
            disabled={!split.valid || total <= 0 || saving}
            loading={saving}
            onPress={() => void handleSave()}
          >
            Save shared expense
          </Button>
        }
      >
        <View className="gap-4">
          <AmountInput value={amount} onChange={setAmount} placeholder="0" autoFocus />

          {/* Category — reuses the same picker as the personal Expense popup (screen 4 symmetry). */}
          <View>
            <Text className="text-xs font-medium text-secondary mb-1.5">Category</Text>
            <Pressable
              onPress={() => setShowCategoryPicker(true)}
              className="bg-surface-2 border w-full rounded-xl px-3 py-2.5 flex-row items-center gap-2"
              style={{ borderColor: selectedCat ? selectedCat.color : theme.border }}
            >
              <Icon
                name={selectedCat ? selectedCat.icon : 'ti-layout-grid-add'}
                size={18}
                color={selectedCat ? selectedCat.color : theme.textTertiary}
              />
              <Text
                className="flex-1 text-sm"
                style={{
                  color: selectedCat ? theme.textPrimary : theme.textTertiary,
                  fontWeight: selectedCat ? '600' : '400'
                }}
              >
                {selectedCat?.name ?? 'Select category'}
              </Text>
              <Icon name="ti-chevron-right" size={15} color={theme.textTertiary} />
            </Pressable>
          </View>

          <TextInput
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="e.g. Beach shack dinner"
          />

          <View>
            <Text className="text-xs font-medium text-secondary mb-1.5">Paid by</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {members.map((m) => (
                <Avatar
                  key={m.userId}
                  name={m.userId === myId ? 'You' : m.displayName}
                  on={payer === m.userId}
                  onPress={() => setPayer(m.userId)}
                />
              ))}
            </ScrollView>
          </View>

          <View>
            <Text className="text-xs font-medium text-secondary mb-1.5">Split between</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {members.map((m) => (
                <Avatar
                  key={m.userId}
                  name={m.userId === myId ? 'You' : m.displayName}
                  on={participants.has(m.userId)}
                  dim={!participants.has(m.userId)}
                  onPress={() => toggleParticipant(m.userId)}
                />
              ))}
            </ScrollView>
          </View>

          <View>
            <Text className="text-xs font-medium text-secondary mb-1.5">Split method</Text>
            <SegmentedControl options={METHODS} value={method} onChange={setMethod} />

            {method !== 'equal' && (
              <View className="mt-2 gap-1.5">
                {participantIds.map((id) => (
                  <View key={id} className="flex-row items-center gap-2">
                    <Text className="text-xs text-secondary flex-1" numberOfLines={1}>
                      {id === myId ? 'You' : nameFor(id)}
                    </Text>
                    <RNTextInput
                      value={values[id] !== undefined ? String(values[id]) : ''}
                      onChangeText={(v) => setValues((prev) => ({ ...prev, [id]: Number(v) || 0 }))}
                      keyboardType="decimal-pad"
                      placeholder={method === 'percent' ? '%' : method === 'shares' ? 'shares' : '₹'}
                      placeholderTextColor={theme.textTertiary}
                      className="bg-surface-2 text-primary rounded-lg px-2 py-1 text-sm text-right"
                      style={{ width: 96 }}
                    />
                  </View>
                ))}
              </View>
            )}

            <View className="mt-2 rounded-xl bg-surface-2 px-3 py-2">
              {participantIds.map((id) => (
                <View key={id} className="flex-row items-center justify-between py-1">
                  <Text className="text-xs text-secondary">{id === myId ? 'You' : nameFor(id)}</Text>
                  <Text className="text-xs font-semibold text-primary">{formatCurrency(split.shares[id] ?? 0)}</Text>
                </View>
              ))}
              <View className="border-t border-theme mt-1 pt-1.5 items-center">
                {split.valid ? (
                  <View className="flex-row items-center gap-1">
                    <Icon name="ti-circle-check" size={12} color={theme.success} />
                    <Text className="text-[11px] font-medium" style={{ color: theme.success }}>
                      Reconciles to {formatCurrency(total)}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-[11px] font-medium" style={{ color: theme.danger }}>
                    {split.reason ?? 'Split does not add up'}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Account bridge (screen 4) — record the real cash-out you fronted. Only when you're the payer. */}
          {payer === myId && accounts.length > 0 && (
            <View className="rounded-xl border border-theme p-3 gap-2">
              <View className="flex-row items-center gap-2.5">
                <Icon name="ti-building-bank" size={18} color={theme.primary} />
                <Text className="text-sm text-secondary flex-1">
                  Record {total > 0 ? formatCurrency(total) : '₹0'} out of account
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
        </View>
      </Modal>

      {showCategoryPicker && (
        <CategoryPickerModal
          type="expense"
          categories={categories}
          selectedId={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            setShowCategoryPicker(false);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
      )}
    </>
  );
}
