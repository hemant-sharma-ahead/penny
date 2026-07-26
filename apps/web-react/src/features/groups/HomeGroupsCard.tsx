import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { formatCurrency } from '@/lib/formatters';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { useGroupContext } from '@/context/GroupContext';
import { useGroupSummaries } from './useGroupSummaries';
import { CreateGroupModal } from './CreateGroupModal';
import { JoinGroupModal } from './JoinGroupModal';

const TYPE_ICON: Record<string, string> = {
  family: 'ti-home',
  trip: 'ti-plane',
  roommates: 'ti-users',
  other: 'ti-users-group'
};

/** Balance chip text/colour for a group tile. Positive = you're owed. */
function balanceChip(net: number): { text: string; sub: string; cls: string } {
  if (Math.abs(net) < 1) return { text: '₹0', sub: 'settled up', cls: 'text-tertiary' };
  return net > 0
    ? { text: `+${formatCurrency(net)}`, sub: "you're owed", cls: 'text-success' }
    : { text: `−${formatCurrency(-net)}`, sub: 'you owe', cls: 'text-danger' };
}

/**
 * The "Groups" card on the Personal Home (Track E, screen 1): lists each group with your balance +
 * member/expense counts, and a New / Join entry. Tapping a tile re-scopes the app to that group.
 * Rendered only when Groups are usable (sync-entitled + a claimed account) and you're in at least one.
 */
export function HomeGroupsCard() {
  const { groups, claimed, setContext } = useGroupContext();
  const { summaries } = useGroupSummaries(groups);
  const [modal, setModal] = useState<'create' | 'join' | null>(null);
  const navigate = useNavigate();

  // Surface whenever you're in groups (real or demo fixtures) — viewing balances/feed folds locally and
  // needs no claim. Creating/joining does need a real claim, so those actions route to Profile below.
  if (!hasEntitlement('sync') || groups.length === 0) return null;

  const activeGroups = groups.filter((g) => g.status === 'active');
  const shown = activeGroups.length > 0 ? activeGroups : groups;

  function open(groupId: string) {
    setContext(groupId);
    navigate(PATHS.app.home);
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-primary">Groups</h3>
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
          {claimed ? (
            <>
              <button type="button" onClick={() => setModal('create')}>
                <i className="ti ti-plus" aria-hidden="true" /> New
              </button>
              <span className="text-tertiary">/</span>
              <button type="button" onClick={() => setModal('join')}>
                Join
              </button>
            </>
          ) : (
            <button type="button" onClick={() => navigate(PATHS.app.profile)}>
              <i className="ti ti-user-plus" aria-hidden="true" /> Claim to create
            </button>
          )}
        </div>
      </div>

      <div className="surface rounded-2xl overflow-hidden">
        {shown.map((g, i) => {
          const s = summaries[g.id];
          const bal = balanceChip(s?.myNet ?? 0);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => open(g.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 ${i > 0 ? 'border-t border-theme' : ''}`}
            >
              <span
                className="w-9 h-9 rounded-xl grid place-items-center text-white flex-shrink-0"
                style={{ backgroundColor: 'var(--color-mode-accent, #6366f1)' }}
              >
                <i
                  className={`ti ${TYPE_ICON[g.type] ?? 'ti-users-group'}`}
                  style={{ fontSize: 18 }}
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary truncate">
                  {g.name || 'Group'}
                  {g.status === 'closed' && <span className="text-[10px] text-tertiary font-normal"> · closed</span>}
                </p>
                <p className="text-[11px] text-tertiary">
                  {s?.memberCount ?? 0} member{(s?.memberCount ?? 0) === 1 ? '' : 's'} · {s?.expenseCount ?? 0} expense
                  {(s?.expenseCount ?? 0) === 1 ? '' : 's'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-bold ${bal.cls}`}>{bal.text}</p>
                <p className="text-[10px] text-tertiary">{bal.sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {modal === 'create' && <CreateGroupModal onClose={() => setModal(null)} />}
      {modal === 'join' && <JoinGroupModal onClose={() => setModal(null)} />}
    </div>
  );
}
