// Demo group fixtures (Phase 1.5 Track E, E5 tail). Seeds a rich, local-only Household-OS demo:
// a Family group, a spouse group, a closed+settled trip, an ongoing trip linked to an upcoming
// vacation, plus a Renovation event. Everything is written straight to the encrypted local mirror
// (groups / group_members / group_events / group_keys) — balances fold from the events (see
// split.ts), so nothing here touches the server. These groups are NOT server-registered, so they
// demo the dashboards/feeds/balances but won't round-trip new expenses to a worker.
//
// Gated by the caller on hasEntitlement('sync'). Runs inside seedDemoData (the one-time demo persona
// seed), so setting a demo "claimed" identity here is safe — it never touches a real account.
import { profileRepo, groupsRepo, groupMembersRepo, groupEventsRepo } from './repositories';
import { generateGroupKey, persistGroupKey } from '@/core/groups/keys';
import { mergeLocalEvents } from './seedDemoStorage';
import type { Group, GroupEvent, GroupEventType, GroupMember, GroupRole, GroupType } from './types';

const DAY = 86_400_000;

// Stable demo member ids (companions/family). "Me" resolves to the profile's userId.
const U = {
  priya: 'demo-u-priya',
  dad: 'demo-u-dad',
  mom: 'demo-u-mom',
  rohit: 'demo-u-rohit',
  neha: 'demo-u-neha',
  kabir: 'demo-u-kabir'
} as const;

interface EventInput {
  type: GroupEventType;
  author: string;
  payload: unknown;
  daysAgo: number;
}

/** Seed the full group scenario matrix. Idempotent-ish: guarded by seedDemoData's one-time flag. */
export async function seedGroupFixtures(now: number): Promise<void> {
  const ago = (d: number) => now - d * DAY;
  const from = (d: number) => now + d * DAY;

  // NOTE: we deliberately do NOT stamp a fake deviceId/username onto the profile here. Doing so used to
  // make `claimed` (deviceId && username) read true without a real server registration or device keys —
  // a "phantom claim" that surfaced Create/Join yet failed every signed call (NotClaimedError). The demo
  // groups still surface for *viewing* (balances/feed fold locally); a real claim is required to create
  // or push, exactly as for a real user. `meId` anchors the fixtures to the profile's real userId.
  const profile = (await profileRepo.getAll())[0];
  const meId = profile?.userId ?? 'demo-user-me';

  const displayName: Record<string, string> = {
    [meId]: 'You',
    [U.priya]: 'Priya',
    [U.dad]: 'Dad',
    [U.mom]: 'Mom',
    [U.rohit]: 'Rohit',
    [U.neha]: 'Neha',
    [U.kabir]: 'Kabir'
  };

  async function seedGroup(opts: {
    id: string;
    type: GroupType;
    name: string;
    status: Group['status'];
    memberIds: string[];
    createdDaysAgo: number;
    events: EventInput[];
  }): Promise<void> {
    const createdAt = ago(opts.createdDaysAgo);
    const key = await generateGroupKey();
    await persistGroupKey(opts.id, 1, key);

    const group: Group = {
      id: opts.id,
      type: opts.type,
      name: opts.name,
      role: 'owner',
      status: opts.status,
      ownerId: meId,
      keyEpoch: 1,
      historyVisibility: 'full',
      joinedAt: createdAt,
      createdAt,
      updatedAt: now
    };
    await groupsRepo.put(group);

    await Promise.all(
      opts.memberIds.map((userId, i) => {
        const role: GroupRole = userId === meId ? 'owner' : 'member';
        const rec: GroupMember = {
          id: `${opts.id}:${userId}`,
          groupId: opts.id,
          userId,
          displayName: displayName[userId] ?? 'Member',
          role,
          status: 'active',
          joinedAt: createdAt + i,
          createdAt: createdAt + i,
          updatedAt: now
        };
        return groupMembersRepo.put(rec);
      })
    );

    await Promise.all(
      opts.events.map((e, i) => {
        const at = ago(e.daysAgo);
        const rec: GroupEvent = {
          id: `${opts.id}-evt-${i + 1}`,
          groupId: opts.id,
          seq: i + 1, // pre-"synced" so the demo never tries to push these to a worker
          lamport: i + 1,
          authorId: e.author,
          keyEpoch: 1,
          type: e.type,
          payload: e.payload,
          createdAt: at,
          updatedAt: at
        };
        return groupEventsRepo.put(rec);
      })
    );
  }

  const expense = (
    expenseId: string,
    amount: number,
    payer: string,
    shares: Record<string, number>,
    description: string
  ) => ({
    expenseId,
    amount,
    payer,
    shares,
    description
  });

  // 1) FAMILY — ongoing, four members, outstanding balances.
  await seedGroup({
    id: 'demo-grp-family',
    type: 'family',
    name: 'Family',
    status: 'active',
    memberIds: [meId, U.priya, U.dad, U.mom],
    createdDaysAgo: 120,
    events: [
      {
        type: 'shared_expense',
        author: meId,
        daysAgo: 18,
        payload: expense(
          'fx1',
          4200,
          meId,
          { [meId]: 1050, [U.priya]: 1050, [U.dad]: 1050, [U.mom]: 1050 },
          'Monthly groceries'
        )
      },
      {
        type: 'shared_expense',
        author: U.dad,
        daysAgo: 12,
        payload: expense(
          'fx2',
          3200,
          U.dad,
          { [meId]: 800, [U.priya]: 800, [U.dad]: 800, [U.mom]: 800 },
          'Electricity bill'
        )
      },
      {
        type: 'shared_expense',
        author: U.priya,
        daysAgo: 5,
        payload: expense(
          'fx3',
          2400,
          U.priya,
          { [meId]: 600, [U.priya]: 600, [U.dad]: 600, [U.mom]: 600 },
          'Sunday lunch out'
        )
      },
      { type: 'settlement', author: meId, daysAgo: 3, payload: { from: meId, to: U.dad, amount: 500 } }
    ]
  });

  // 2) SPOUSE — two members, a couple of shared expenses.
  await seedGroup({
    id: 'demo-grp-spouse',
    type: 'other',
    name: 'Priya & Me',
    status: 'active',
    memberIds: [meId, U.priya],
    createdDaysAgo: 60,
    events: [
      {
        type: 'shared_expense',
        author: meId,
        daysAgo: 9,
        payload: expense('sx1', 1800, meId, { [meId]: 900, [U.priya]: 900 }, 'Weekly groceries')
      },
      {
        type: 'shared_expense',
        author: U.priya,
        daysAgo: 4,
        payload: expense('sx2', 1200, U.priya, { [meId]: 600, [U.priya]: 600 }, 'Movie night')
      }
    ]
  });

  // 3) LEH-LADAKH — closed + fully settled trip. Balances fold to ~₹0, then group_closed.
  await seedGroup({
    id: 'demo-grp-leh',
    type: 'trip',
    name: 'Leh–Ladakh',
    status: 'closed',
    memberIds: [meId, U.rohit, U.neha],
    createdDaysAgo: 40,
    events: [
      {
        type: 'shared_expense',
        author: meId,
        daysAgo: 34,
        payload: expense('lx1', 9000, meId, { [meId]: 3000, [U.rohit]: 3000, [U.neha]: 3000 }, 'Hotel (3 nights)')
      },
      {
        type: 'shared_expense',
        author: U.rohit,
        daysAgo: 33,
        payload: expense('lx2', 9000, U.rohit, { [meId]: 3000, [U.rohit]: 3000, [U.neha]: 3000 }, 'Food & fuel')
      },
      { type: 'settlement', author: U.neha, daysAgo: 30, payload: { from: U.neha, to: meId, amount: 3000 } },
      { type: 'settlement', author: U.neha, daysAgo: 30, payload: { from: U.neha, to: U.rohit, amount: 3000 } },
      { type: 'group_closed', author: meId, daysAgo: 29, payload: {} }
    ]
  });

  // 4) GOA TRIP — ongoing, linked to an upcoming vacation. Mixed split methods, open balances,
  //    prep expenses authored by different members.
  await seedGroup({
    id: 'demo-grp-goa',
    type: 'trip',
    name: 'Goa Trip',
    status: 'active',
    memberIds: [meId, U.rohit, U.neha, U.kabir],
    createdDaysAgo: 10,
    events: [
      {
        // equal
        type: 'shared_expense',
        author: meId,
        daysAgo: 8,
        payload: expense(
          'gx1',
          40000,
          meId,
          { [meId]: 10000, [U.rohit]: 10000, [U.neha]: 10000, [U.kabir]: 10000 },
          'Flights (prep)'
        )
      },
      {
        // unequal
        type: 'shared_expense',
        author: U.kabir,
        daysAgo: 6,
        payload: expense(
          'gx2',
          24000,
          U.kabir,
          { [meId]: 8000, [U.rohit]: 8000, [U.neha]: 4000, [U.kabir]: 4000 },
          'Airbnb deposit'
        )
      },
      {
        // shares (2:2:1:1 → 2400/2400/1200/1200)
        type: 'shared_expense',
        author: U.neha,
        daysAgo: 2,
        payload: expense(
          'gx3',
          7200,
          U.neha,
          { [meId]: 2400, [U.rohit]: 2400, [U.neha]: 1200, [U.kabir]: 1200 },
          'Activities advance'
        )
      }
    ]
  });

  // ── Link the trips to their events + add the Renovation event ──────────────────
  await mergeLocalEvents<StoredEvent>({
    // Closed trip → its past event links to the closed group.
    past: (events) => events.map((e) => (e.id === 'demo-event-leh' ? { ...e, linkedGroupId: 'demo-grp-leh' } : e)),
    // Active: an upcoming Goa vacation linked to the ongoing group + an ongoing Renovation event.
    active: (events) => [
      ...events.filter((e) => e.id !== 'demo-event-goa' && e.id !== 'demo-event-renovation'),
      {
        id: 'demo-event-goa',
        name: 'Goa Trip',
        subtype: 'immersive',
        hashtag: 'GoaTrip',
        startDate: from(14),
        endDate: from(20),
        autoTag: true,
        color: '#ec4899',
        linkedGroupId: 'demo-grp-goa'
      },
      {
        id: 'demo-event-renovation',
        name: 'Home Renovation',
        subtype: 'background',
        hashtag: 'Renovation',
        startDate: ago(25),
        autoTag: false,
        color: '#f59e0b'
      }
    ]
  });
}

// ── local event linking (EventModeContext owns these keys; see ./seedDemoStorage for the
//    localStorage/AsyncStorage split) ────────────────

interface StoredEvent {
  id: string;
  name: string;
  subtype: 'immersive' | 'background';
  hashtag: string;
  startDate: number;
  endDate?: number;
  autoTag: boolean;
  color: string;
  linkedGroupId?: string;
}
