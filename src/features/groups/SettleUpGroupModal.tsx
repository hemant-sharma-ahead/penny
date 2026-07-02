import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, AmountInput, SegmentedControl, SelectInput } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/lib/formatters';
import { profileRepo, groupMembersRepo } from '@/core/db/repositories';
import { appendGroupEvent, groupBalances } from '@/core/groups/groupSync';
import type { Group, GroupMember } from '@/core/db/types';

type Direction = 'they_paid_you' | 'you_paid_them';

export function SettleUpGroupModal({
  group,
  onClose,
  onSaved
}: {
  group: Group;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [myId, setMyId] = useState<string | undefined>();
  const [counterpart, setCounterpart] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('they_paid_you');
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
    Promise.all([groupMembersRepo.getAll(), profileRepo.getAll(), groupBalances(group.id)]).then(
      ([all, profile, bal]) => {
        if (cancelled) return;
        const me = profile[0]?.userId;
        const others = all.filter((m) => m.groupId === group.id && m.status === 'active' && m.userId !== me);
        setMembers(others);
        setMyId(me);
        setBalances(bal);
        if (others[0]) chooseCounterpart(others[0].userId, bal);
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
      showToast({ message: 'Settlement recorded' });
      onSaved();
      onClose();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Could not record the settlement' });
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Settle up"
      footer={
        <Button onClick={handleSettle} disabled={!counterpart || value <= 0 || saving} className="w-full">
          {saving ? 'Recording…' : 'Record settlement'}
        </Button>
      }
    >
      {members.length === 0 ? (
        <p className="text-sm text-tertiary">No one else to settle with yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <SelectInput label="With" value={counterpart} onChange={(v) => chooseCounterpart(v)} options={options} />
          <AmountInput label="Amount" value={amount} onChange={setAmount} placeholder="0" />
          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">Direction</label>
            <SegmentedControl
              options={[
                { value: 'they_paid_you', label: 'They paid you' },
                { value: 'you_paid_them', label: 'You paid them' }
              ]}
              value={direction}
              onChange={(v) => setDirection(v)}
              cols={2}
            />
          </div>
          <p className="text-[11px] text-tertiary">
            Settles the balance inside {group.name || 'this group'} only — it doesn’t touch your personal IOU ledger.
            {value > 0 && ` Recording ${formatCurrency(value)}.`}
          </p>
        </div>
      )}
    </Modal>
  );
}
