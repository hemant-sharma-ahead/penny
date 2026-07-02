import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, TextInput, AmountInput, SegmentedControl } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/lib/formatters';
import { profileRepo, groupMembersRepo, expenseCategoriesRepo } from '@/core/db/repositories';
import { appendGroupEvent } from '@/core/groups/groupSync';
import { computeShares, type SplitMethod } from '@/core/groups/split';
import type { ExpenseCategory, Group, GroupMember } from '@/core/db/types';

const METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'unequal', label: 'Unequal' },
  { value: 'percent', label: '%' },
  { value: 'shares', label: 'Shares' }
];

function Avatar({ name, on, dim, onClick }: { name: string; on?: boolean; dim?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 w-[52px] flex-shrink-0"
      style={{ opacity: dim ? 0.35 : 1 }}
    >
      <span
        className={`w-9 h-9 rounded-full grid place-items-center text-xs font-semibold text-white ${on ? 'ring-2 ring-[var(--color-primary)] ring-offset-1' : ''}`}
        style={{ backgroundColor: 'var(--color-mode-accent, #6366f1)' }}
      >
        {(name || '?').charAt(0).toUpperCase()}
      </span>
      <span className="text-[10px] text-secondary truncate max-w-full">{name}</span>
    </button>
  );
}

export function SharedExpenseComposer({
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
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [myId, setMyId] = useState<string | undefined>();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [payer, setPayer] = useState('');
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<SplitMethod>('equal');
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([groupMembersRepo.getAll(), expenseCategoriesRepo.getAll(), profileRepo.getAll()]).then(
      ([allMembers, cats, profile]) => {
        if (cancelled) return;
        const active = allMembers.filter((m) => m.groupId === group.id && m.status === 'active');
        const me = profile[0]?.userId;
        setMembers(active);
        setCategories(cats.filter((c) => (c.applicableTo ?? 'expense') === 'expense' && !c.isGroup));
        setMyId(me);
        setPayer(me && active.some((m) => m.userId === me) ? me : (active[0]?.userId ?? ''));
        setParticipants(new Set(active.map((m) => m.userId)));
      }
    );
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
      showToast({ message: 'Shared expense added' });
      onSaved();
      onClose();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Could not add the expense' });
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Add shared expense"
      scrollable
      footer={
        <Button onClick={handleSave} disabled={!split.valid || total <= 0 || saving} className="w-full">
          {saving ? 'Saving…' : 'Save shared expense'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <AmountInput value={amount} onChange={setAmount} placeholder="0" autoFocus />
        <TextInput
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="e.g. Beach shack dinner"
        />

        {categories.length > 0 && (
          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">Category</label>
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                  className={`flex flex-col items-center gap-1 w-[56px] flex-shrink-0 ${categoryId === c.id ? '' : 'opacity-70'}`}
                >
                  <span
                    className="w-9 h-9 rounded-lg grid place-items-center text-white"
                    style={{
                      backgroundColor: c.color,
                      outline: categoryId === c.id ? '2px solid var(--color-primary)' : 'none',
                      outlineOffset: 1
                    }}
                  >
                    <i className={`ti ${c.icon}`} style={{ fontSize: 17 }} aria-hidden="true" />
                  </span>
                  <span className="text-[9px] text-secondary truncate max-w-full">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-secondary mb-1.5 block">Paid by</label>
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {members.map((m) => (
              <Avatar
                key={m.userId}
                name={m.userId === myId ? 'You' : m.displayName}
                on={payer === m.userId}
                onClick={() => setPayer(m.userId)}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-secondary mb-1.5 block">Split between</label>
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {members.map((m) => (
              <Avatar
                key={m.userId}
                name={m.userId === myId ? 'You' : m.displayName}
                on={participants.has(m.userId)}
                dim={!participants.has(m.userId)}
                onClick={() => toggleParticipant(m.userId)}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-secondary mb-1.5 block">Split method</label>
          <SegmentedControl options={METHODS} value={method} onChange={setMethod} cols={4} />

          {method !== 'equal' && (
            <div className="mt-2 flex flex-col gap-1.5">
              {participantIds.map((id) => (
                <div key={id} className="flex items-center gap-2">
                  <span className="text-xs text-secondary flex-1 truncate">{id === myId ? 'You' : nameFor(id)}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={values[id] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [id]: Number(e.target.value) || 0 }))}
                    placeholder={method === 'percent' ? '%' : method === 'shares' ? 'shares' : '₹'}
                    className="input-surface rounded-lg px-2 py-1 text-sm w-24 text-right"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 rounded-xl bg-surface-2 px-3 py-2">
            {participantIds.map((id) => (
              <div key={id} className="flex items-center justify-between py-1 text-xs">
                <span className="text-secondary">{id === myId ? 'You' : nameFor(id)}</span>
                <span className="font-semibold text-primary">{formatCurrency(split.shares[id] ?? 0)}</span>
              </div>
            ))}
            <div className="border-t border-theme mt-1 pt-1.5 text-center text-[11px] font-medium">
              {split.valid ? (
                <span className="text-success">
                  <i className="ti ti-circle-check" aria-hidden="true" /> Reconciles to {formatCurrency(total)}
                </span>
              ) : (
                <span className="text-danger">{split.reason ?? 'Split does not add up'}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
