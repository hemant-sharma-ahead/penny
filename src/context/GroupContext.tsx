// Which "context" the app is scoped to — Personal (the default) or a specific group. Switching to a
// group re-scopes Home to that group's dashboard (Phase 1.5 Track E, E4). Mounted inside the unlocked
// AppShell so it can read the encrypted `groups` mirror. Behind the dark `sync` entitlement in the UI.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRepository } from '@/hooks/useRepository';
import { groupsRepo, profileRepo } from '@/core/db/repositories';
import type { Group, Profile } from '@/core/db/types';

const LS_KEY = 'penny_group_context';
type ContextId = 'personal' | string;

interface GroupContextValue {
  activeContext: ContextId;
  activeGroup: Group | undefined;
  groups: Group[];
  loading: boolean;
  /** True once the account is claimed WITH a username — the prerequisite for using Groups (Phase 1.5). */
  claimed: boolean;
  username: string | undefined;
  setContext: (ctx: ContextId) => void;
  refresh: () => void;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: ReactNode }) {
  const { items: groups, loading, reload } = useRepository<Group>(groupsRepo);
  const { items: profiles } = useRepository<Profile>(profileRepo);
  const [selected, setSelected] = useState<ContextId>(() => localStorage.getItem(LS_KEY) || 'personal');

  const profile = profiles[0];
  const username = profile?.username;
  // Groups require a claimed account WITH a username (the public sharing handle).
  const claimed = Boolean(profile?.deviceId && username);

  const setContext = useCallback((ctx: ContextId) => {
    setSelected(ctx);
    if (ctx === 'personal') localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, ctx);
  }, []);

  const activeGroup = useMemo(() => groups.find((g) => g.id === selected), [groups, selected]);

  // Derive the effective context: fall back to Personal if the selected group is gone (but not while
  // groups are still loading, to avoid a flash). No effect/setState — keeps renders clean.
  const activeContext: ContextId =
    selected === 'personal' ? 'personal' : activeGroup || loading ? selected : 'personal';

  const value = useMemo<GroupContextValue>(
    () => ({ activeContext, activeGroup, groups, loading, claimed, username, setContext, refresh: reload }),
    [activeContext, activeGroup, groups, loading, claimed, username, setContext, reload]
  );

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroupContext(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroupContext must be used within a GroupProvider');
  return ctx;
}
