import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { EncryptedRepository } from '@/core/db/repository';
import { keystore } from '@/core/crypto/keystore';
import { initialize } from '@/core/crypto/securityManager';
import { exportBackup, mergeBundle, openBundleWithDmk, ForeignBlobError } from '@/core/backup/backupManager';

const PASS = 'correct horse battery staple';
const PIN = '123456';

interface TestRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}
const repo = new EncryptedRepository<TestRecord>(db.profile as never);
const sample: TestRecord = { id: 'p1', name: 'Aarav', createdAt: 100, updatedAt: 200 };

describe('openBundleWithDmk', () => {
  beforeEach(async () => {
    await Promise.all([db.security.clear(), db.profile.clear()]);
    keystore.lock();
  });

  it('opens a freshly exported blob with the in-memory DMK', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);

    const text = await (await exportBackup()).text();
    const { stores } = await openBundleWithDmk(text);

    expect(Array.isArray(stores.profile)).toBe(true);
    expect((stores.profile as { id: string }[]).some((r) => r.id === 'p1')).toBe(true);
  });

  it('round-trips as a mergeBundle no-op (idempotent)', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);

    const text = await (await exportBackup()).text();
    const bundle = await openBundleWithDmk(text);
    await mergeBundle(bundle);

    expect(await repo.get('p1')).toEqual(sample);
  });

  it('throws ForeignBlobError for a blob encrypted with a different DMK', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);
    const foreignBlob = await (await exportBackup()).text();

    // Fresh vault → a brand-new random DMK that cannot decrypt the old blob.
    await Promise.all([db.security.clear(), db.profile.clear()]);
    keystore.lock();
    await initialize(PASS, PIN);

    await expect(openBundleWithDmk(foreignBlob)).rejects.toBeInstanceOf(ForeignBlobError);
  });
});
