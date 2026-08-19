import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the worker client — E2 orchestration is what we're testing, not the network.
const calls: Record<string, unknown[]> = {};
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
vi.mock('@/core/groups/groupsClient', () => ({
  hashInviteSecret: (s: string) => sha256Hex(s),
  createGroup: async (input: unknown) => {
    (calls.createGroup ??= []).push(input);
    return { ok: true, group_id: 'g1', key_epoch: 1 };
  },
  createInvite: async (groupId: string, input: unknown) => {
    (calls.createInvite ??= []).push({ groupId, input });
    return { ok: true };
  },
  redeemInvite: async () => ({
    ok: true,
    group_id: 'g2',
    type: 'trip',
    enc_name: 'Zm9yZWlnbg==', // ciphertext the joiner can't decrypt yet
    owner_id: 'owner',
    key_epoch: 1,
    history_visibility: 'from_join',
    role: 'member'
  }),
  getGroup: async () => ({
    group_id: 'g1',
    type: 'trip',
    enc_name: '',
    owner_id: 'u1',
    key_epoch: 1,
    history_visibility: 'from_join'
  }),
  listMembers: async () => ({ members: [] }),
  sendGrants: async () => ({ ok: true }),
  rotateGroup: async (groupId: string, encName: string) => {
    (calls.rotateGroup ??= []).push({ groupId, encName });
    return { ok: true, key_epoch: 2 };
  },
  appendEvents: async (_groupId: string, events: { eventId: string }[]) => {
    (calls.appendEvents ??= []).push(events);
    return { ok: true, assigned: events.map((e, i) => ({ event_id: e.eventId, seq: i + 1 })) };
  },
  deleteGroup: async (groupId: string) => {
    (calls.deleteGroup ??= []).push(groupId);
    return { ok: true };
  }
}));

import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { initialize } from '@/core/crypto/securityManager';
import { profileRepo, groupsRepo, groupMembersRepo, groupEventsRepo } from '@/core/db/repositories';
import {
  addStaticMember,
  clearExpenseFlag,
  createGroup,
  createInvite,
  deleteGroup,
  flagSharedExpense,
  notifyExpenseDeletedToGroups,
  redeemInvite,
  rotateGroupKey,
  shareExpenseToGroup,
  voidSettlement
} from '@/core/groups/groupsService';
import { loadGroupKey, decryptFromGroup } from '@/core/groups/keys';
import {
  appendGroupEvent,
  groupBalances,
  groupFeed,
  groupFlags,
  groupVoidedSettlementIds
} from '@/core/groups/groupSync';

async function reset() {
  await Promise.all([
    db.security.clear(),
    db.profile.clear(),
    db.groups.clear(),
    db.group_members.clear(),
    db.group_keys.clear(),
    db.group_events.clear(),
    db.sync_cursor.clear()
  ]);
  keystore.lock();
  await initialize('correct horse battery staple', '123456');
  const now = Date.now();
  await profileRepo.put({
    id: 'profile',
    displayName: 'Aarav',
    currency: 'INR',
    locale: 'en-IN',
    onboardingComplete: true,
    userId: 'u1',
    username: 'aarav',
    createdAt: now,
    updatedAt: now
  });
  for (const k of Object.keys(calls)) delete calls[k];
}

describe('groupsService.createGroup', () => {
  beforeEach(reset);

  it('encrypts the name (Model B), persists the local group + owner, and stores the Group Key', async () => {
    const group = await createGroup({ name: 'Goa Trip', type: 'trip', historyVisibility: 'from_join' });

    expect(group.id).toBe('g1');
    expect(group.role).toBe('owner');

    // The name sent to the server is ciphertext, not plaintext.
    const sent = calls.createGroup?.[0] as { encName: string };
    expect(sent.encName).not.toContain('Goa');
    // …and it round-trips with the stored Group Key.
    const key = await loadGroupKey('g1', 1);
    expect(key).toBeDefined();
    expect(await decryptFromGroup(key!, sent.encName)).toBe('Goa Trip');

    // Local mirror: group + owner membership.
    expect((await groupsRepo.get('g1'))?.name).toBe('Goa Trip');
    expect((await groupMembersRepo.get('g1:u1'))?.role).toBe('owner');
  });
});

describe('groupsService.createInvite', () => {
  beforeEach(reset);

  it('sends only the SHA-256 of the secret, never the secret itself', async () => {
    const { secret } = await createInvite('g1', { role: 'member' });
    const sent = calls.createInvite?.[0] as { input: { tokenHash: string } };
    expect(sent.input.tokenHash).toBe(await sha256Hex(secret));
    expect(sent.input.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sent.input.tokenHash).not.toBe(secret);
    expect(JSON.stringify(sent)).not.toContain(secret);
  });
});

describe('groupsService.redeemInvite', () => {
  beforeEach(reset);

  it('joins locally but flags awaitingKey when the Group Key has not arrived', async () => {
    const res = await redeemInvite('some-secret');
    expect(res.groupId).toBe('g2');
    expect(res.awaitingKey).toBe(true);
    expect((await groupsRepo.get('g2'))?.name).toBe(''); // undecryptable until the grant
    expect((await groupMembersRepo.get('g2:u1'))?.role).toBe('member');
  });
});

describe('groupsService.rotateGroupKey', () => {
  beforeEach(reset);

  it('bumps the epoch, stores a new key, and re-encrypts the name for the rotation', async () => {
    await createGroup({ name: 'Flat 402', type: 'roommates', historyVisibility: 'from_join' });
    const newEpoch = await rotateGroupKey('g1');

    expect(newEpoch).toBe(2);
    expect((await groupsRepo.get('g1'))?.keyEpoch).toBe(2);
    const newKey = await loadGroupKey('g1', 2);
    expect(newKey).toBeDefined();
    const sent = calls.rotateGroup?.[0] as { encName: string };
    expect(await decryptFromGroup(newKey!, sent.encName)).toBe('Flat 402');
  });
});

describe('groupsService.shareExpenseToGroup', () => {
  beforeEach(reset);

  it('appends an equal-split shared_expense paid by me, mirrored ciphertext-only', async () => {
    await createGroup({ name: 'Goa Trip', type: 'trip', historyVisibility: 'from_join' });
    // Add a second member so the split is 2-way.
    const now = Date.now();
    await groupMembersRepo.put({
      id: 'g1:b',
      groupId: 'g1',
      userId: 'b',
      displayName: 'Rohit',
      role: 'member',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now
    });

    await shareExpenseToGroup('g1', { amount: 1000, description: 'Dinner' });

    // A shared_expense event was created locally, split equally, paid by me.
    const events = (await groupEventsRepo.getAll()).filter((e) => e.type === 'shared_expense');
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload as { payer: string; shares: Record<string, number>; amount: number };
    expect(payload.payer).toBe('u1');
    expect(payload.shares).toEqual({ u1: 500, b: 500 });

    // Pushed to the server as ciphertext (no plaintext description on the wire).
    const pushed = calls.appendEvents?.[0] as { ciphertext: string }[];
    expect(pushed[0]?.ciphertext).not.toContain('Dinner');

    // Balances fold correctly: I'm owed my counterpart's share.
    const bal = await groupBalances('g1');
    expect(bal.u1).toBeCloseTo(500, 5);
    expect(bal.b).toBeCloseTo(-500, 5);
  });

  it('keys the mirrored event to a caller-supplied expenseId (the personal Expense.id), when given one', async () => {
    await createGroup({ name: 'Goa Trip', type: 'trip', historyVisibility: 'from_join' });
    const returnedId = await shareExpenseToGroup('g1', {
      expenseId: 'personal-expense-1',
      amount: 500,
      description: 'Cab'
    });
    expect(returnedId).toBe('personal-expense-1');
    const events = (await groupEventsRepo.getAll()).filter((e) => e.type === 'shared_expense');
    const [event] = events;
    expect((event?.payload as { expenseId: string } | undefined)?.expenseId).toBe('personal-expense-1');
  });
});

describe('groupsService.notifyExpenseDeletedToGroups', () => {
  beforeEach(reset);

  it('appends an expense_delete tombstone that removes the shared expense from balances and the feed', async () => {
    await createGroup({ name: 'Goa Trip', type: 'trip', historyVisibility: 'from_join' });
    // A second member so a shared expense actually produces a nonzero balance (a solo "group" nets to
    // 0 — payer and sole participant are the same person — which wouldn't distinguish "never shared"
    // from "shared then tombstoned").
    const now = Date.now();
    await groupMembersRepo.put({
      id: 'g1:b',
      groupId: 'g1',
      userId: 'b',
      displayName: 'Rohit',
      role: 'member',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now
    });
    await shareExpenseToGroup('g1', { expenseId: 'personal-expense-1', amount: 1000, description: 'Dinner' });
    expect(await groupFeed('g1')).toHaveLength(1);
    expect((await groupBalances('g1')).u1).toBeCloseTo(500, 5);

    await notifyExpenseDeletedToGroups('personal-expense-1', ['g1']);

    // Tombstoned out of both the feed and the balance fold — split.ts's existing filter/exclude logic,
    // exercised here through the real emit path rather than unit-testing foldGroupBalances directly.
    expect(await groupFeed('g1')).toHaveLength(0);
    expect(await groupBalances('g1')).toEqual({});
  });

  it('is best-effort per group — an unknown/closed group never throws and never blocks the caller', async () => {
    await expect(notifyExpenseDeletedToGroups('personal-expense-1', ['no-such-group'])).resolves.toBeUndefined();
  });
});

describe('groupsService.addStaticMember', () => {
  beforeEach(reset);

  it('adds a name-only, accountless member and mirrors it via a member_joined event', async () => {
    await createGroup({ name: 'Goa Trip', type: 'trip', historyVisibility: 'from_join' });
    const member = await addStaticMember('g1', 'Grandma');

    expect(member.accountless).toBe(true);
    expect(member.userId).toMatch(/^static:/);
    expect((await groupMembersRepo.get(member.id))?.displayName).toBe('Grandma');

    const events = (await groupEventsRepo.getAll()).filter((e) => e.type === 'member_joined');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ userId: member.userId, displayName: 'Grandma', accountless: true });
  });

  it('composes with computeShares/foldGroupBalances exactly like a real member', async () => {
    await createGroup({ name: 'Goa Trip', type: 'trip', historyVisibility: 'from_join' });
    const grandma = await addStaticMember('g1', 'Grandma');
    await appendGroupEvent('g1', 'shared_expense', {
      expenseId: 'e1',
      amount: 1000,
      payer: 'u1',
      shares: { u1: 500, [grandma.userId]: 500 }
    });
    const bal = await groupBalances('g1');
    expect(bal.u1).toBeCloseTo(500, 5);
    expect(bal[grandma.userId]).toBeCloseTo(-500, 5);
  });

  it('records `linkedPersonId` when backing a personal-ledger promotion', async () => {
    await createGroup({ name: 'Priya', type: 'other', historyVisibility: 'from_join' });
    const member = await addStaticMember('g1', 'Priya', { linkedPersonId: 'person-1' });
    expect(member.linkedPersonId).toBe('person-1');
  });
});

describe('groupsService flags — flagSharedExpense / clearExpenseFlag', () => {
  beforeEach(reset);

  it('flagSharedExpense raises a pending flag; clearExpenseFlag ("Keep") resolves it', async () => {
    await createGroup({ name: 'Goa Trip', type: 'trip', historyVisibility: 'from_join' });
    await shareExpenseToGroup('g1', { expenseId: 'e1', amount: 640, description: 'Cab' });
    await flagSharedExpense('g1', 'e1', 'already refunded');
    expect(await groupFlags('g1')).toEqual([expect.objectContaining({ expenseId: 'e1', note: 'already refunded' })]);

    await clearExpenseFlag('g1', 'e1');
    expect(await groupFlags('g1')).toEqual([]);
  });
});

describe('groupsService.voidSettlement', () => {
  beforeEach(reset);

  it('reverses a write-off settlement, restoring the pre-write-off balance', async () => {
    await createGroup({ name: 'Goa Trip', type: 'trip', historyVisibility: 'from_join' });
    const now = Date.now();
    await groupMembersRepo.put({
      id: 'g1:b',
      groupId: 'g1',
      userId: 'b',
      displayName: 'Rohit',
      role: 'member',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now
    });
    await shareExpenseToGroup('g1', { expenseId: 'e1', amount: 1000, description: 'Dinner' });
    const settlementId = crypto.randomUUID();
    await appendGroupEvent('g1', 'settlement', {
      id: settlementId,
      from: 'b',
      to: 'u1',
      amount: 500,
      kind: 'write_off'
    });
    expect(await groupBalances('g1')).toEqual({ u1: 0, b: 0 });

    await voidSettlement('g1', settlementId);
    expect((await groupBalances('g1')).u1).toBeCloseTo(500, 5);
    expect((await groupVoidedSettlementIds('g1')).has(settlementId)).toBe(true);
  });
});

describe('groupsService.deleteGroup', () => {
  beforeEach(reset);

  it('deletes the group on the server and drops every local row for it', async () => {
    await createGroup({ name: 'Goa Trip', type: 'trip', historyVisibility: 'from_join' });
    await shareExpenseToGroup('g1', { expenseId: 'e1', amount: 500, description: 'Snacks' });

    await deleteGroup('g1');

    expect(calls.deleteGroup).toEqual(['g1']);
    expect(await groupsRepo.get('g1')).toBeUndefined();
    expect((await groupMembersRepo.getAll()).filter((m) => m.groupId === 'g1')).toHaveLength(0);
    expect((await groupEventsRepo.getAll()).filter((e) => e.groupId === 'g1')).toHaveLength(0);
  });
});
