import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { initialize } from '@/core/crypto/securityManager';
import { personsRepo } from '@/core/db/repositories';
import { mergeBundle, shouldApplyIncoming } from '@/core/backup/backupManager';
import type { Person } from '@/core/db/types';

const PASS = 'correct horse battery staple';
const PIN = '123456';

function person(id: string, name: string, createdAt: number, updatedAt: number): Person {
  return { id, name, createdAt, updatedAt };
}

/** Encrypt the given records with the current DMK and return the raw rows for a bundle. */
async function encryptedRows(records: Person[]): Promise<unknown[]> {
  await db.persons.clear();
  for (const r of records) await personsRepo.put(r);
  const rows = await db.persons.toArray();
  await db.persons.clear();
  return rows;
}

describe('shouldApplyIncoming — LWW decision', () => {
  it('applies when there is no local record', () => {
    expect(shouldApplyIncoming(undefined, { id: 'x', updatedAt: 1 })).toBe(true);
  });

  it('applies a strictly newer incoming record', () => {
    expect(shouldApplyIncoming({ id: 'x', updatedAt: 1 }, { id: 'x', updatedAt: 2 })).toBe(true);
  });

  it('skips a strictly older incoming record', () => {
    expect(shouldApplyIncoming({ id: 'x', updatedAt: 2 }, { id: 'x', updatedAt: 1 })).toBe(false);
  });

  it('applies on a tie (idempotent re-merge)', () => {
    expect(shouldApplyIncoming({ id: 'x', updatedAt: 5 }, { id: 'x', updatedAt: 5 })).toBe(true);
  });

  it('falls back to createdAt when updatedAt is absent', () => {
    expect(shouldApplyIncoming({ id: 'x', createdAt: 10 }, { id: 'x', createdAt: 20 })).toBe(true);
    expect(shouldApplyIncoming({ id: 'x', createdAt: 20 }, { id: 'x', createdAt: 10 })).toBe(false);
  });
});

describe('mergeBundle — non-destructive upsert', () => {
  beforeEach(async () => {
    await Promise.all([db.security.clear(), db.persons.clear()]);
    keystore.lock();
    await initialize(PASS, PIN);
  });

  it('applies a newer incoming record over the local one', async () => {
    const incoming = await encryptedRows([person('x', 'New', 1000, 2000)]);
    await personsRepo.put(person('x', 'Old', 1000, 1000));

    const stats = await mergeBundle({ stores: { persons: incoming } });

    expect(stats.applied).toBe(1);
    expect((await personsRepo.get('x'))?.name).toBe('New');
  });

  it('skips an older incoming record and keeps the local one', async () => {
    const incoming = await encryptedRows([person('x', 'Stale', 1000, 1000)]);
    await personsRepo.put(person('x', 'Fresh', 1000, 2000));

    const stats = await mergeBundle({ stores: { persons: incoming } });

    expect(stats.skipped).toBe(1);
    expect((await personsRepo.get('x'))?.name).toBe('Fresh');
  });

  it('preserves the local createdAt when the incoming record wins', async () => {
    const incoming = await encryptedRows([person('x', 'New', 9999, 2000)]);
    await personsRepo.put(person('x', 'Old', 500, 1000));

    await mergeBundle({ stores: { persons: incoming } });

    const merged = await personsRepo.get('x');
    expect(merged?.name).toBe('New');
    expect(merged?.createdAt).toBe(500);
  });

  it('leaves local-only records untouched (upsert-only, no deletes)', async () => {
    const incoming = await encryptedRows([person('new', 'Incoming', 1000, 1000)]);
    await personsRepo.put(person('keep', 'LocalOnly', 1000, 1000));

    await mergeBundle({ stores: { persons: incoming } });

    expect(await personsRepo.get('keep')).toBeTruthy();
    expect(await personsRepo.get('new')).toBeTruthy();
    expect(await db.persons.count()).toBe(2);
  });

  it('is a no-op when merging a blob back onto itself', async () => {
    const records = [person('a', 'Asha', 100, 200), person('b', 'Rohan', 300, 400)];
    for (const r of records) await personsRepo.put(r);
    const rows = await db.persons.toArray();

    await mergeBundle({ stores: { persons: rows } });

    expect(await personsRepo.get('a')).toEqual(records[0]);
    expect(await personsRepo.get('b')).toEqual(records[1]);
    expect(await db.persons.count()).toBe(2);
  });
});
