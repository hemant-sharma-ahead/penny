import { useEffect, useState } from 'react';
import { groupMembersRepo, groupEventsRepo, profileRepo } from '@/core/db/repositories';
import { groupBalances } from '@/core/groups/groupSync';
import type { Group, GroupMember } from '@/core/db/types';

export interface GroupSummary {
  /** Your net balance in the group (positive = you're owed, negative = you owe). */
  myNet: number;
  memberCount: number;
  expenseCount: number;
  members: GroupMember[];
}

/**
 * RN port of apps/web-legacy/src/features/groups/useGroupSummaries.ts — pure data hook, no browser APIs,
 * ported unchanged (import-path translation only).
 *
 * Per-group summaries (your balance + member/expense counts + members) for the Home Groups card and the
 * context switcher. Folds balances from the local event mirror — no network. Keyed by group id.
 */
export function useGroupSummaries(groups: Group[]): { summaries: Record<string, GroupSummary>; myId?: string } {
  const [summaries, setSummaries] = useState<Record<string, GroupSummary>>({});
  const [myId, setMyId] = useState<string | undefined>();
  const key = groups.map((g) => `${g.id}:${g.updatedAt}`).join('|');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([groupMembersRepo.getAll(), groupEventsRepo.getAll(), profileRepo.getAll()]).then(
      async ([allMembers, allEvents, profile]) => {
        const balances = await Promise.all(groups.map((g) => groupBalances(g.id)));
        if (cancelled) return;
        const me = profile[0]?.userId;
        const next: Record<string, GroupSummary> = {};
        groups.forEach((g, i) => {
          const members = allMembers.filter((m) => m.groupId === g.id && m.status === 'active');
          const expenseCount = allEvents.filter((e) => e.groupId === g.id && e.type === 'shared_expense').length;
          next[g.id] = {
            myNet: me ? (balances[i]?.[me] ?? 0) : 0,
            memberCount: members.length,
            expenseCount,
            members
          };
        });
        setSummaries(next);
        setMyId(me);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return myId !== undefined ? { summaries, myId } : { summaries };
}
