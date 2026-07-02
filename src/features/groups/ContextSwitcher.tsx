import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { useGroupContext } from '@/context/GroupContext';
import { CreateGroupModal } from './CreateGroupModal';
import { JoinGroupModal } from './JoinGroupModal';

const TYPE_ICON: Record<string, string> = {
  family: 'ti-home',
  trip: 'ti-plane',
  roommates: 'ti-users',
  other: 'ti-users-group'
};

/**
 * The context bar under the app header: shows the current scope (Personal or a group) and opens a menu
 * to switch or create/join. Rendered only when the `sync` entitlement is on (dark by default).
 */
export function ContextSwitcher() {
  const { activeContext, activeGroup, groups, setContext } = useGroupContext();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<'create' | 'join' | null>(null);
  const navigate = useNavigate();

  const inGroup = activeContext !== 'personal' && activeGroup;

  function choose(ctx: 'personal' | string) {
    setContext(ctx);
    setOpen(false);
    navigate(PATHS.app.home);
  }

  return (
    <>
      <div
        className="relative flex items-center gap-2 px-4 py-2 border-b border-theme text-sm font-semibold"
        style={
          inGroup
            ? { backgroundColor: 'color-mix(in srgb, var(--color-mode-accent, #6366f1) 12%, var(--color-surface))' }
            : undefined
        }
      >
        <button type="button" className="flex items-center gap-2 flex-1 min-w-0" onClick={() => setOpen((o) => !o)}>
          <span
            className="w-6 h-6 rounded-lg grid place-items-center text-white flex-shrink-0"
            style={{ backgroundColor: inGroup ? 'var(--color-mode-accent, #6366f1)' : 'var(--color-primary)' }}
          >
            <i
              className={`ti ${inGroup && activeGroup ? (TYPE_ICON[activeGroup.type] ?? 'ti-users-group') : 'ti-user'}`}
              style={{ fontSize: 13 }}
              aria-hidden="true"
            />
          </span>
          <span className="truncate">{inGroup && activeGroup ? activeGroup.name || 'Group' : 'Personal'}</span>
          <i
            className={`ti ti-chevron-${open ? 'up' : 'down'} text-tertiary`}
            style={{ fontSize: 14 }}
            aria-hidden="true"
          />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
            <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-surface border border-theme rounded-xl shadow-2xl overflow-hidden">
              <MenuRow
                icon="ti-user"
                label="Personal"
                active={activeContext === 'personal'}
                onClick={() => choose('personal')}
              />
              {groups.map((g) => (
                <MenuRow
                  key={g.id}
                  icon={TYPE_ICON[g.type] ?? 'ti-users-group'}
                  label={g.name || 'Group'}
                  active={g.id === activeContext}
                  onClick={() => choose(g.id)}
                />
              ))}
              <button
                type="button"
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-[var(--color-primary)] border-t border-theme"
                onClick={() => {
                  setOpen(false);
                  setModal('create');
                }}
              >
                <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true" /> Create a group
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-[var(--color-primary)] border-t border-theme"
                onClick={() => {
                  setOpen(false);
                  setModal('join');
                }}
              >
                <i className="ti ti-link" style={{ fontSize: 16 }} aria-hidden="true" /> Join with a link
              </button>
            </div>
          </>
        )}
      </div>

      {modal === 'create' && <CreateGroupModal onClose={() => setModal(null)} />}
      {modal === 'join' && <JoinGroupModal onClose={() => setModal(null)} />}
    </>
  );
}

function MenuRow({
  icon,
  label,
  active,
  onClick
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left ${active ? 'bg-surface-2' : ''}`}
    >
      <span className="w-6 h-6 rounded-lg bg-surface-3 grid place-items-center flex-shrink-0">
        <i className={`ti ${icon} text-secondary`} style={{ fontSize: 13 }} aria-hidden="true" />
      </span>
      <span className="flex-1 truncate text-primary">{label}</span>
      {active && <i className="ti ti-check text-[var(--color-primary)]" style={{ fontSize: 15 }} aria-hidden="true" />}
    </button>
  );
}
