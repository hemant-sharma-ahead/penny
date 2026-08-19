import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable stand-ins the mocked client reads/writes, so each test can script the "server".
let assignedSeq = 0;
const serverEvents: Array<{
  seq: number;
  event_id: string;
  author_id: string;
  key_epoch: number;
  lamport: number;
  created_at: number;
  ciphertext: string | null;
}> = [];

vi.mock('@/core/groups/groupsClient', () => ({
  appendEvents: async (
    _groupId: string,
    events: Array<{ eventId: string; ciphertext: string; keyEpoch: number; lamport: number }>
  ) => {
    const assigned = events.map((e) => {
      const seq = ++assignedSeq;
      serverEvents.push({
        seq,
        event_id: e.eventId,
        author_id: 'u1',
        key_epoch: e.keyEpoch,
        lamport: e.lamport,
        created_at: Date.now(),
        ciphertext: e.ciphertext
      });
      return { event_id: e.eventId, seq };
    });
    return { ok: true, assigned };
  },
  fetchEvents: async (_groupId: string, since = 0) => ({ events: serverEvents.filter((e) => e.seq > since) })
}));

import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { initialize } from '@/core/crypto/securityManager';
import { profileRepo, groupsRepo, groupEventsRepo, groupMembersRepo } from '@/core/db/repositories';
import { createGroupKey } from '@/core/groups/keys';
import {
  appendGroupEvent,
  pullGroupEvents,
  groupBalances,
  groupFeed,
  groupFlags,
  groupVoidedSettlementIds,
  syncGroupMembers
} from '@/core/groups/groupSync';
import type { Group } from '@/core/db/types';

const GID = 'g1';

function group(): Group {
  const now = Date.now();
  return {
    id: GID,
    type: 'trip',
    name: 'Goa Trip',
    role: 'owner',
    status: 'active',
    ownerId: 'u1',
    keyEpoch: 1,
    historyVisibility: 'from_join',
    joinedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

async function reset() {
  await Promise.all([
    db.security.clear(),
    db.profile.clear(),
    db.groups.clear(),
    db.group_members.clear(),
    db.group_events.clear(),
    db.group_keys.clear(),
    db.sync_cursor.clear()
  ]);
  keystore.lock();
  await initialize('correct horse battery staple', '123456');
  const now = Date.now();
  await profileRepo.put({
    id: 'p',
    displayName: 'A',
    currency: 'INR',
    locale: 'en-IN',
    onboardingComplete: true,
    userId: 'u1',
    createdAt: now,
    updatedAt: now
  });
  await groupsRepo.put(group());
  await createGroupKey(GID, 1);
  assignedSeq = 0;
  serverEvents.length = 0;
}

describe('groupSync append + push', () => {
  beforeEach(reset);

  it('encrypts + pushes a new event and records the server seq', async () => {
    const ev = await appendGroupEvent(GID, 'shared_expense', {
      expenseId: 'x1',
      amount: 1200,
      payer: 'u1',
      shares: { u1: 400, b: 400, c: 400 }
    });
    expect(ev.seq).toBe(1);
    // The server received ciphertext, not the plaintext payload.
    expect(serverEvents[0]?.ciphertext).not.toContain('1200');
    expect((await groupEventsRepo.get(ev.id))?.seq).toBe(1);
  });

  it('folds balances from the local ledger', async () => {
    await appendGroupEvent(GID, 'shared_expense', {
      expenseId: 'x1',
      amount: 1200,
      payer: 'u1',
      shares: { u1: 400, b: 400, c: 400 }
    });
    const bal = await groupBalances(GID);
    expect(bal.u1).toBeCloseTo(800, 5);
    expect(bal.b).toBeCloseTo(-400, 5);
  });
});

describe('groupSync pull + merge', () => {
  beforeEach(reset);

  it('decrypts an incoming event authored elsewhere and merges it', async () => {
    // Simulate another member's event by appending (which pushes it to the mock server), then wiping
    // the local mirror + cursor so the pull re-materialises it from the "server".
    await appendGroupEvent(GID, 'shared_expense', {
      expenseId: 'x2',
      amount: 900,
      payer: 'b',
      shares: { u1: 300, b: 300, c: 300 }
    });
    await db.group_events.clear();
    await db.sync_cursor.clear();

    const fetched = await pullGroupEvents(GID);
    expect(fetched).toBe(1);
    const feed = await groupFeed(GID);
    expect(feed).toHaveLength(1);
    const bal = await groupBalances(GID);
    expect(bal.b).toBeCloseTo(600, 5); // paid 900, owed 300
    expect(bal.u1).toBeCloseTo(-300, 5);
  });

  it('does not advance or duplicate on a second pull (idempotent)', async () => {
    await appendGroupEvent(GID, 'shared_expense', { expenseId: 'x3', amount: 300, payer: 'u1', shares: { u1: 300 } });
    await pullGroupEvents(GID);
    const before = (await groupEventsRepo.getAll()).length;
    await pullGroupEvents(GID);
    expect((await groupEventsRepo.getAll()).length).toBe(before);
  });
});

describe('groupFeed', () => {
  beforeEach(reset);

  it('collapses an edited expense to ONE feed row holding the latest content (item 9)', async () => {
    await appendGroupEvent(GID, 'shared_expense', {
      expenseId: 'x1',
      amount: 1000,
      payer: 'u1',
      shares: { u1: 500, b: 500 },
      description: 'Dinner'
    });
    await appendGroupEvent(GID, 'expense_edit', {
      expenseId: 'x1',
      amount: 2000,
      payer: 'u1',
      shares: { u1: 1000, b: 1000 },
      description: 'Dinner (updated)'
    });
    const feed = await groupFeed(GID);
    expect(feed).toHaveLength(1);
    expect((feed[0]?.payload as { amount: number; description?: string }).amount).toBe(2000);
    expect((feed[0]?.payload as { amount: number; description?: string }).description).toBe('Dinner (updated)');
  });
});

describe('groupFlags', () => {
  beforeEach(reset);

  it('reports a pending flag with who raised it and the optional note', async () => {
    await appendGroupEvent(GID, 'shared_expense', {
      expenseId: 'x1',
      amount: 640,
      payer: 'u1',
      shares: { u1: 320, b: 320 }
    });
    await appendGroupEvent(GID, 'expense_flag', { expenseId: 'x1', note: 'already refunded' });
    const flags = await groupFlags(GID);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ expenseId: 'x1', byAuthorId: 'u1', note: 'already refunded' });
  });

  it('an expense_flag_clear ("Keep") resolves the flag', async () => {
    await appendGroupEvent(GID, 'shared_expense', {
      expenseId: 'x1',
      amount: 640,
      payer: 'u1',
      shares: { u1: 320, b: 320 }
    });
    await appendGroupEvent(GID, 'expense_flag', { expenseId: 'x1' });
    await appendGroupEvent(GID, 'expense_flag_clear', { expenseId: 'x1' });
    expect(await groupFlags(GID)).toEqual([]);
  });

  it('deleting the flagged expense also resolves the flag', async () => {
    await appendGroupEvent(GID, 'shared_expense', {
      expenseId: 'x1',
      amount: 640,
      payer: 'u1',
      shares: { u1: 320, b: 320 }
    });
    await appendGroupEvent(GID, 'expense_flag', { expenseId: 'x1' });
    await appendGroupEvent(GID, 'expense_delete', { expenseId: 'x1' });
    expect(await groupFlags(GID)).toEqual([]);
  });

  it('a fresh flag re-opens even a previously-cleared one on the same expense', async () => {
    await appendGroupEvent(GID, 'shared_expense', {
      expenseId: 'x1',
      amount: 640,
      payer: 'u1',
      shares: { u1: 320, b: 320 }
    });
    await appendGroupEvent(GID, 'expense_flag', { expenseId: 'x1' });
    await appendGroupEvent(GID, 'expense_flag_clear', { expenseId: 'x1' });
    await appendGroupEvent(GID, 'expense_flag', { expenseId: 'x1', note: 'second look' });
    const flags = await groupFlags(GID);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.note).toBe('second look');
  });
});

describe('groupVoidedSettlementIds', () => {
  beforeEach(reset);

  it('collects settlement ids reversed by a settlement_void event', async () => {
    await appendGroupEvent(GID, 'settlement', { id: 's1', from: 'b', to: 'u1', amount: 500, kind: 'write_off' });
    await appendGroupEvent(GID, 'settlement_void', { settlementId: 's1' });
    const voided = await groupVoidedSettlementIds(GID);
    expect(voided.has('s1')).toBe(true);
  });
});

describe('syncGroupMembers', () => {
  beforeEach(reset);

  it('materializes a placeholder member from a member_joined event this device has not seen', async () => {
    await appendGroupEvent(GID, 'member_joined', {
      userId: 'static:grandma',
      displayName: 'Grandma',
      accountless: true
    });
    await syncGroupMembers(GID);
    const member = await groupMembersRepo.get(`${GID}:static:grandma`);
    expect(member?.displayName).toBe('Grandma');
    expect(member?.accountless).toBe(true);
  });

  it('never overwrites an already-known member (e.g. a real member with their own row)', async () => {
    const now = Date.now();
    await groupMembersRepo.put({
      id: `${GID}:u1`,
      groupId: GID,
      userId: 'u1',
      displayName: 'Real Name',
      role: 'owner',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now
    });
    await appendGroupEvent(GID, 'member_joined', { userId: 'u1', displayName: 'Stale Duplicate' });
    await syncGroupMembers(GID);
    expect((await groupMembersRepo.get(`${GID}:u1`))?.displayName).toBe('Real Name');
  });

  it('silently ignores an empty-payload member_joined (old seed-fixture shape)', async () => {
    await appendGroupEvent(GID, 'member_joined', {});
    await expect(syncGroupMembers(GID)).resolves.toBeUndefined();
  });
});
