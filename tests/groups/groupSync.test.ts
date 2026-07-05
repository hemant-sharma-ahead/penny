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
  appendEvents: async (_groupId: string, events: Array<{ eventId: string; ciphertext: string; keyEpoch: number; lamport: number }>) => {
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
import { profileRepo, groupsRepo, groupEventsRepo } from '@/core/db/repositories';
import { createGroupKey } from '@/core/groups/keys';
import { appendGroupEvent, pullGroupEvents, groupBalances, groupFeed } from '@/core/groups/groupSync';
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
    db.group_events.clear(),
    db.group_keys.clear(),
    db.sync_cursor.clear()
  ]);
  keystore.lock();
  await initialize('correct horse battery staple', '123456');
  const now = Date.now();
  await profileRepo.put({ id: 'p', displayName: 'A', currency: 'INR', locale: 'en-IN', onboardingComplete: true, userId: 'u1', createdAt: now, updatedAt: now });
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
    await appendGroupEvent(GID, 'shared_expense', { expenseId: 'x1', amount: 1200, payer: 'u1', shares: { u1: 400, b: 400, c: 400 } });
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
    await appendGroupEvent(GID, 'shared_expense', { expenseId: 'x2', amount: 900, payer: 'b', shares: { u1: 300, b: 300, c: 300 } });
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
