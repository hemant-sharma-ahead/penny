import { useEffect, useState } from 'react';
import { ListContainer, SectionLabel, EmptyState, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { profileRepo, groupMembersRepo } from '@/core/db/repositories';
import { groupBalances, groupFeed, syncGroup } from '@/core/groups/groupSync';
import type { Group, GroupEvent, GroupMember } from '@/core/db/types';
import { SharedExpenseComposer } from './SharedExpenseComposer';
import { SettleUpGroupModal } from './SettleUpGroupModal';
import { GroupMembersModal } from './GroupMembersModal';

const TYPE_ICON: Record<string, string> = {
  family: 'ti-home',
  trip: 'ti-plane',
  roommates: 'ti-users',
  other: 'ti-users-group'
};

/** Positive = you're owed / they owe you; negative = you owe. */
function balanceLabel(net: number): { text: string; cls: string } {
  if (Math.abs(net) < 1) return { text: 'settled up', cls: 'text-tertiary' };
  return net > 0
    ? { text: `owes you ${formatCurrency(net)}`, cls: 'text-success' }
    : { text: `you owe ${formatCurrency(-net)}`, cls: 'text-danger' };
}

export function GroupDashboard({ group }: { group: Group }) {
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [feed, setFeed] = useState<GroupEvent[]>([]);
  const [myId, setMyId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'settle' | 'members' | null>(null);
  const [settleWith, setSettleWith] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  const closed = group.status === 'closed';

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all([groupBalances(group.id), groupMembersRepo.getAll(), groupFeed(group.id), profileRepo.getAll()]).then(
        ([bal, allMembers, groupEvents, profile]) => {
          if (cancelled) return;
          setBalances(bal);
          setMembers(allMembers.filter((m) => m.groupId === group.id && m.status === 'active'));
          setFeed(groupEvents);
          setMyId(profile[0]?.userId);
          setLoading(false);
        }
      );
    void load();
    // Pull the latest events in the background; ignore failures (offline / no worker configured).
    void syncGroup(group.id)
      .then(load)
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [group.id, refreshKey]);

  const myNet = myId ? (balances[myId] ?? 0) : 0;
  const nameFor = (userId: string) => members.find((m) => m.userId === userId)?.displayName ?? 'Member';

  return (
    <div className="px-4 pt-3 pb-6 flex flex-col gap-4">
      {/* Group header */}
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl grid place-items-center text-white flex-shrink-0"
          style={{ backgroundColor: 'var(--color-mode-accent, #6366f1)' }}
        >
          <i
            className={`ti ${TYPE_ICON[group.type] ?? 'ti-users-group'}`}
            style={{ fontSize: 22 }}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-primary truncate">{group.name || 'Group'}</h2>
          <p className="text-xs text-tertiary">
            {members.length} member{members.length === 1 ? '' : 's'}
            {closed && ' · closed'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal('members')}
          className="w-9 h-9 grid place-items-center rounded-lg text-secondary hover:bg-surface-2"
          aria-label="Group settings"
        >
          <i className="ti ti-settings" style={{ fontSize: 19 }} aria-hidden="true" />
        </button>
      </div>

      {/* Your balance */}
      <div className="surface rounded-2xl p-4 text-center">
        <p className="text-xs text-secondary">Your balance in this group</p>
        <p
          className={`text-3xl font-bold mt-1 ${myNet > 0 ? 'text-success' : myNet < -0.99 ? 'text-danger' : 'text-primary'}`}
        >
          {Math.abs(myNet) < 1 ? '₹0' : formatCurrency(Math.abs(myNet))}
        </p>
        <p className="text-xs text-tertiary mt-0.5">
          {Math.abs(myNet) < 1 ? 'all settled up' : myNet > 0 ? "you're owed" : 'you owe'}
        </p>
      </div>

      {/* Actions */}
      {closed ? (
        <p className="text-center text-xs text-tertiary -mt-1">
          This group is settled &amp; closed — reopen it from settings to add more.
        </p>
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => setModal('add')} className="flex-1">
            <i className="ti ti-plus" aria-hidden="true" /> Add expense
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSettleWith(undefined);
              setModal('settle');
            }}
            className="flex-1"
          >
            Settle up
          </Button>
        </div>
      )}

      {/* Members */}
      <div>
        <SectionLabel className="mb-2">Members</SectionLabel>
        <ListContainer>
          {members.map((m) => {
            const label =
              m.userId === myId ? { text: 'you', cls: 'text-tertiary' } : balanceLabel(balances[m.userId] ?? 0);
            return (
              <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-3 grid place-items-center text-xs font-semibold text-secondary flex-shrink-0">
                  {(m.displayName || '?').charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-primary flex-1 truncate">
                  {m.displayName}
                  {m.role !== 'member' && <span className="text-[11px] text-tertiary font-normal"> · {m.role}</span>}
                </span>
                <span className={`text-xs font-semibold ${label.cls}`}>{label.text}</span>
                {!closed && m.userId !== myId && Math.abs(balances[m.userId] ?? 0) >= 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSettleWith(m.userId);
                      setModal('settle');
                    }}
                    className="text-[11px] font-medium border border-theme rounded-lg px-2 py-1 text-secondary hover:text-primary flex-shrink-0"
                  >
                    Settle up
                  </button>
                )}
              </div>
            );
          })}
        </ListContainer>
      </div>

      {/* Shared-expense feed */}
      <div>
        <SectionLabel className="mb-2">Shared expenses</SectionLabel>
        {loading ? (
          <p className="text-sm text-tertiary px-1">Loading…</p>
        ) : feed.length === 0 ? (
          <EmptyState
            icon="ti-receipt"
            title="No shared expenses yet"
            description="Add one to start splitting costs."
          />
        ) : (
          <ListContainer>
            {feed.map((e) => (
              <FeedRow key={e.id} event={e} nameFor={nameFor} />
            ))}
          </ListContainer>
        )}
      </div>

      {modal === 'add' && <SharedExpenseComposer group={group} onClose={() => setModal(null)} onSaved={bump} />}
      {modal === 'settle' && (
        <SettleUpGroupModal
          group={group}
          initialCounterpart={settleWith}
          onClose={() => setModal(null)}
          onSaved={bump}
        />
      )}
      {modal === 'members' && <GroupMembersModal group={group} onClose={() => setModal(null)} onChanged={bump} />}
    </div>
  );
}

function FeedRow({ event, nameFor }: { event: GroupEvent; nameFor: (id: string) => string }) {
  if (event.type === 'settlement') {
    const p = event.payload as { from: string; to: string; amount: number };
    return (
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-success-subtle grid place-items-center flex-shrink-0">
          <i className="ti ti-check text-success" style={{ fontSize: 17 }} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary truncate">
            {nameFor(p.from)} paid {nameFor(p.to)}
          </p>
          <p className="text-[11px] text-tertiary">settlement</p>
        </div>
        <span className="text-sm font-semibold text-primary">{formatCurrency(p.amount)}</span>
      </div>
    );
  }
  const p = event.payload as { amount: number; payer: string; shares?: Record<string, number>; description?: string };
  const participants = p.shares ? Object.keys(p.shares).length : 0;
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-surface-3 grid place-items-center flex-shrink-0">
        <i className="ti ti-receipt text-secondary" style={{ fontSize: 17 }} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{p.description || 'Shared expense'}</p>
        <p className="text-[11px] text-tertiary truncate">
          {nameFor(p.payer)} paid{participants ? ` · split ${participants} ways` : ''}
        </p>
      </div>
      <span className="text-sm font-semibold text-primary">{formatCurrency(p.amount)}</span>
    </div>
  );
}
