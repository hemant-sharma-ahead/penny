// Which "context" the app is scoped to — Personal (the default) or a specific group. Switching to a
// group re-scopes Home to that group's dashboard (Phase 1.5 Track E, E4). Mounted at the app root so it
// can read the encrypted `groups` mirror. Behind the dark `sync` entitlement in the UI.
//
// RN port of apps/web-react/src/context/GroupContext.tsx — same API surface; the only platform swaps
// are: `localStorage` → `~/lib/storage` (async AsyncStorage; `selected` starts at the safe default
// 'personal' and hydrates once in a `useEffect`, matching `PrivacyContext`'s established pattern), and
// `window.addEventListener(PROFILE_UPDATED_EVENT, ...)` → `subscribeProfileChanged` (from
// `@/core/identity/profileChangeBus`, backed on mobile by the in-memory `profileChangeBus.native.ts` —
// `claim.ts` only re-exports the `PROFILE_UPDATED_EVENT` constant from that module, not the
// subscribe/notify functions, so this imports directly from the source module instead), which returns an
// unsubscribe function directly. Everything else (`useRepository` over `groupsRepo`/`profileRepo`, the
// `claimed` derivation, `activeGroup`/`activeContext` memoization) is already platform-agnostic and is
// ported near-verbatim.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRepository } from '@/hooks/useRepository';
import { groupsRepo, profileRepo } from '@/core/db/repositories';
import { subscribeProfileChanged } from '@/core/identity/profileChangeBus';
import type { Group, Profile } from '@/core/db/types';
import { getItem, setItem, removeItem } from '~/lib/storage';

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
  const { items: profiles, reload: reloadProfile } = useRepository<Profile>(profileRepo);
  const [selected, setSelected] = useState<ContextId>('personal');

  // Hydrate the persisted context once on mount (AsyncStorage is async, unlike web's synchronous
  // localStorage — matches PrivacyContext's "safe default, then hydrate" convention).
  useEffect(() => {
    let cancelled = false;
    void getItem(LS_KEY).then((stored) => {
      if (!cancelled && stored) setSelected(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // useRepository isn't live, so re-read the profile when a claim/reclaim/handle-change fires the event —
  // otherwise `claimed` stays false here after an in-app claim (the Groups card would keep saying "Claim
  // to create"). Also refresh groups, since claiming unlocks them.
  useEffect(() => {
    const onProfileChange = () => {
      reloadProfile();
      reload();
    };
    return subscribeProfileChanged(onProfileChange);
  }, [reloadProfile, reload]);

  const profile = profiles[0];
  const username = profile?.username;
  // Groups require a claimed account WITH a username (the public sharing handle).
  const claimed = Boolean(profile?.deviceId && username);

  const setContext = useCallback((ctx: ContextId) => {
    setSelected(ctx);
    if (ctx === 'personal') void removeItem(LS_KEY);
    else void setItem(LS_KEY, ctx);
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
