import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (hoisted so the factories can reference them) ──────────────────────────
const h = vi.hoisted(() => ({
  provider: {
    id: 'google-drive' as const,
    label: 'Google Drive',
    isAvailable: vi.fn(() => true),
    ensureConnected: vi.fn(async () => 'ok' as const),
    remoteTag: vi.fn(async (): Promise<string | null> => 'r1'),
    pull: vi.fn(async (): Promise<{ text: string; tag: string } | null> => ({ text: 'blob', tag: 'r1' })),
    push: vi.fn(async (): Promise<{ tag: string }> => ({ tag: 'r2' }))
  },
  exportBackup: vi.fn(async () => new Blob(['blob'])),
  mergeBundle: vi.fn(async () => ({ applied: 0, skipped: 0, perStore: {} })),
  openBundleWithDmk: vi.fn(async () => ({ stores: {} })),
  saveLocalSnapshot: vi.fn(async () => true)
}));

vi.mock('@/core/sync/providers', () => ({ getProvider: () => h.provider }));
vi.mock('@/core/sync/providers/localBackup', () => ({ saveLocalSnapshot: h.saveLocalSnapshot }));
vi.mock('@/core/backup/backupManager', async (orig) => {
  const actual = await orig<typeof import('@/core/backup/backupManager')>();
  return {
    ...actual,
    exportBackup: h.exportBackup,
    mergeBundle: h.mergeBundle,
    openBundleWithDmk: h.openBundleWithDmk
  };
});

import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { initialize } from '@/core/crypto/securityManager';
import { syncCursorRepo } from '@/core/db/repositories';
import { QuotaExceededError } from '@/core/sync/providers/types';
import { getBackupState, runNow, setTarget } from '@/core/sync/backupEngine';
import { setAutoBackupEnabled } from '@/core/sync/backupPrefs';

const PASS = 'correct horse battery staple';
const PIN = '123456';

beforeEach(async () => {
  await Promise.all([db.security.clear(), db.sync_cursor.clear()]);
  keystore.lock();
  await initialize(PASS, PIN);
  localStorage.clear();
  vi.clearAllMocks();
  h.provider.isAvailable.mockReturnValue(true);
  h.provider.remoteTag.mockResolvedValue('r1');
  h.provider.pull.mockResolvedValue({ text: 'blob', tag: 'r1' });
  h.provider.push.mockResolvedValue({ tag: 'r2' });
});

afterEach(() => vi.unstubAllEnvs());

describe('backupEngine.runNow', () => {
  it('cloud first run: pulls+merges the remote and pushes, advancing the cursor', async () => {
    await setTarget('google-drive'); // setTarget also runs once
    const cursor = await syncCursorRepo.get('personal-blob');
    expect(h.provider.pull).toHaveBeenCalled();
    expect(h.mergeBundle).toHaveBeenCalled();
    expect(h.provider.push).toHaveBeenCalled();
    expect(cursor?.remoteTag).toBe('r2');
    expect(cursor?.lastBackupAt).toBeTypeOf('number');
  });

  it('cloud: idle no-op when the remote is unchanged and a backup is not due', async () => {
    const now = Date.now();
    await syncCursorRepo.put({
      id: 'personal-blob',
      scope: 'personal-blob',
      remoteTag: 'r1',
      lastBackupAt: now,
      pushedAt: now,
      createdAt: now,
      updatedAt: now
    });
    localStorage.setItem('penny_backup_target', 'google-drive');

    await runNow();
    expect(h.provider.pull).not.toHaveBeenCalled();
    expect(h.provider.push).not.toHaveBeenCalled();
    expect(getBackupState().status).toBe('idle');
  });

  it('local target: takes an on-device snapshot, no cloud calls', async () => {
    await setTarget('local');
    expect(h.saveLocalSnapshot).toHaveBeenCalled();
    expect(h.provider.push).not.toHaveBeenCalled();
  });

  it('surfaces a full cloud as quota_exceeded', async () => {
    h.provider.push.mockRejectedValueOnce(new QuotaExceededError('google-drive'));
    await setTarget('google-drive');
    expect(getBackupState().status).toBe('quota_exceeded');
  });

  it('does nothing when the session is locked', async () => {
    localStorage.setItem('penny_backup_target', 'google-drive');
    keystore.lock();
    await runNow();
    expect(h.provider.remoteTag).not.toHaveBeenCalled();
    expect(h.provider.push).not.toHaveBeenCalled();
  });

  // Backup & Restore redesign (docs/mockups/proposals/backup-restore-redesign-v1.html) — the Drive
  // row's auto-backup on/off toggle. Code-review finding, 2026-08-21: this new gating had zero test
  // coverage; the `manual` param is the only thing that should ever bypass it.
  it('cloud: a non-manual run skips the automatic push when auto-backup is disabled, but still pulls', async () => {
    localStorage.setItem('penny_backup_target', 'google-drive');
    setAutoBackupEnabled(false);
    await runNow(); // manual defaults to false — the engine's own periodic/debounced trigger shape
    expect(h.provider.pull).toHaveBeenCalled();
    expect(h.provider.push).not.toHaveBeenCalled();
  });

  it('cloud: a manual run ("Back up now") pushes even when auto-backup is disabled', async () => {
    localStorage.setItem('penny_backup_target', 'google-drive');
    setAutoBackupEnabled(false);
    await runNow(true);
    expect(h.provider.push).toHaveBeenCalled();
  });
});
