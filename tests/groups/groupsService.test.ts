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
  getGroup: async () => ({ group_id: 'g1', type: 'trip', enc_name: '', owner_id: 'u1', key_epoch: 1, history_visibility: 'from_join' }),
  listMembers: async () => ({ members: [] }),
  sendGrants: async () => ({ ok: true }),
  rotateGroup: async (groupId: string, encName: string) => {
    (calls.rotateGroup ??= []).push({ groupId, encName });
    return { ok: true, key_epoch: 2 };
  }
}));

import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { initialize } from '@/core/crypto/securityManager';
import { profileRepo, groupsRepo, groupMembersRepo } from '@/core/db/repositories';
import { createGroup, createInvite, redeemInvite, rotateGroupKey } from '@/core/groups/groupsService';
import { loadGroupKey, decryptFromGroup } from '@/core/groups/keys';

async function reset() {
  await Promise.all([db.security.clear(), db.profile.clear(), db.groups.clear(), db.group_members.clear(), db.group_keys.clear()]);
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
