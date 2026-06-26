import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { EncryptedRepository } from '@/core/db/repository';
import { keystore } from '@/core/crypto/keystore';
import { initialize, unlock } from '@/core/crypto/securityManager';
import { exportBackup, importBackup } from '@/core/backup/backupManager';

const PASS = 'correct horse battery staple';
const PIN = '123456';

interface TestRecord {
  id: string;
  secret: string;
}
const repo = new EncryptedRepository<TestRecord>(db.profile as never);
const sample: TestRecord = { id: 'p1', secret: 'top-secret-value' };

describe('backupManager — envelope round-trip', () => {
  beforeEach(async () => {
    await Promise.all([db.security.clear(), db.profile.clear(), db.expenses.clear()]);
    keystore.lock();
  });

  it('exports a v2 file and restores it on a wiped vault', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);

    const blob = await exportBackup();
    const text = await blob.text();
    expect(JSON.parse(text).version).toBe(2);

    // Wipe everything (simulate a fresh device).
    await Promise.all([db.security.clear(), db.profile.clear()]);
    keystore.lock();

    await importBackup(text, PASS);
    // Restore locks the session — the user re-enters their PIN.
    expect(keystore.isUnlocked()).toBe(false);
    expect(await unlock(PIN)).toBe('ok');
    expect(await repo.get('p1')).toEqual(sample);
  });

  it('rejects an incorrect passphrase on restore', async () => {
    await initialize(PASS, PIN);
    await repo.put(sample);
    const text = await (await exportBackup()).text();

    await expect(importBackup(text, 'wrong passphrase')).rejects.toThrow(/Incorrect passphrase/);
  });
});
