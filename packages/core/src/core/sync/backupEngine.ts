// Automatic backup + multi-device sync engine (Phase 1.5 Track D, Model B — the user's own cloud).
// Framework-agnostic singleton. Pushes the encrypted blob on debounced change, pulls+merges
// periodically, and always keeps a daily on-device (OPFS) floor. All conflict resolution is Track B's
// mergeBundle (LWW). See decide.ts for the pure branching and docs/plans for the concurrency model.
import { subscribeActivity } from '@/core/db/activityLog';
import { keystore } from '@/core/crypto/keystore';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { exportBackup, ForeignBlobError, mergeBundle, openBundleWithDmk } from '@/core/backup/backupManager';
import { syncCursorRepo } from '@/core/db/repositories';
import type { SyncCursor } from '@/core/db/types';
import { DAY_MS } from '@/lib/date';
import { debounce } from '@/lib/debounce';
import { decideSync, type BackupTarget } from './decide';
import { getBackupTarget, setBackupTarget } from './backupPrefs';
import { getProvider } from './providers';
import { NeedsConsentError, QuotaExceededError } from './providers/types';
import { saveLocalSnapshot } from './providers/localBackup';

export type BackupStatus =
  'idle' | 'syncing' | 'offline' | 'error' | 'quota_exceeded' | 'needs_reconnect' | 'foreign_blob';

export interface BackupEngineState {
  status: BackupStatus;
  target: BackupTarget;
  lastBackupAt: number | null;
  error: string | null;
}

const CURSOR_ID = 'personal-blob';
const PERIODIC_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 4000;

let state: BackupEngineState = { status: 'idle', target: getBackupTarget(), lastBackupAt: null, error: null };
let running = false;
let started = false;
let maxActivityTs = 0;
let unsubscribeActivity: (() => void) | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function setState(patch: Partial<BackupEngineState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getBackupState(): BackupEngineState {
  return state;
}
export function subscribeBackupState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function loadCursor(): Promise<SyncCursor> {
  const now = Date.now();
  return (
    (await syncCursorRepo.get(CURSOR_ID)) ?? {
      id: CURSOR_ID,
      scope: CURSOR_ID,
      createdAt: now,
      updatedAt: now
    }
  );
}
async function saveCursor(cursor: SyncCursor): Promise<void> {
  await syncCursorRepo.put({ ...cursor, updatedAt: Date.now() });
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Run one sync cycle. Safe to call anytime; a mutex prevents overlap and it no-ops when nothing's due. */
export async function runNow(): Promise<void> {
  if (running) return;
  if (!keystore.isUnlocked()) return;
  running = true;
  try {
    const target = getBackupTarget();
    setState({ target });
    const cursor = await loadCursor();
    const dueDaily = !cursor.lastBackupAt || Date.now() - cursor.lastBackupAt > DAY_MS;
    const localDirty = maxActivityTs > (cursor.pushedAt ?? 0);

    // ── Cloud target ──────────────────────────────────────────────────────────
    if (target === 'google-drive' || target === 'icloud') {
      if (!hasEntitlement('cloud_backup')) return;
      const provider = getProvider(target);
      if (!provider.isAvailable()) {
        setState({ status: 'idle' });
        return;
      }
      if (!online()) {
        setState({ status: 'offline' });
        return;
      }

      const tag = await provider.remoteTag();
      const remoteChanged = tag !== (cursor.remoteTag ?? null);
      const decision = decideSync({ target, canRun: true, remoteChanged, localDirty, dueDaily });
      if (!decision.pull && !decision.push) {
        setState({ status: 'idle', error: null });
        return;
      }

      setState({ status: 'syncing', error: null });
      if (decision.pull) {
        const pulled = await provider.pull();
        if (pulled) {
          await mergeBundle(await openBundleWithDmk(pulled.text));
          cursor.remoteTag = pulled.tag;
        }
      }
      if (decision.push) {
        const { tag: newTag } = await provider.push(await exportBackup());
        cursor.remoteTag = newTag;
        cursor.pushedAt = maxActivityTs;
        cursor.lastBackupAt = Date.now();
      }
      await saveCursor(cursor);
      setState({ status: 'idle', lastBackupAt: cursor.lastBackupAt ?? state.lastBackupAt, error: null });
      return;
    }

    // ── On-device daily floor (target 'local' or none) ─────────────────────────
    const decision = decideSync({ target, canRun: true, remoteChanged: false, localDirty, dueDaily });
    if (decision.localSnapshot) {
      setState({ status: 'syncing', error: null });
      const ok = await saveLocalSnapshot(await exportBackup());
      if (ok) {
        cursor.pushedAt = maxActivityTs;
        cursor.lastBackupAt = Date.now();
        await saveCursor(cursor);
      }
    }
    setState({ status: 'idle', lastBackupAt: cursor.lastBackupAt ?? state.lastBackupAt, error: null });
  } catch (err) {
    if (err instanceof QuotaExceededError) setState({ status: 'quota_exceeded', error: 'Cloud storage is full.' });
    else if (err instanceof NeedsConsentError)
      setState({ status: 'needs_reconnect', error: 'Reconnect to keep syncing.' });
    else if (err instanceof ForeignBlobError)
      // Real cause: this device's vault key doesn't match the one the existing Drive backup was
      // encrypted with — normal after a reinstall/new device, not a sign anything is actually wrong
      // with the account. `status: 'foreign_blob'` (not plain 'error') so the UI can show a distinct
      // banner with a CTA into the passphrase-restore flow that actually fixes it, rather than a dead-
      // end error message (found confusing/undiscoverable via real-device testing, 2026-08-18).
      setState({
        status: 'foreign_blob',
        error:
          "This device's data doesn't match the key your existing Google Drive backup was encrypted with yet " +
          '(normal after reinstalling or setting up a new device). Restore from that backup with your ' +
          'passphrase below to pick it back up.'
      });
    else setState({ status: 'error', error: err instanceof Error ? err.message : 'Backup failed.' });
  } finally {
    running = false;
  }
}

const debouncedRun = debounce(() => void runNow(), DEBOUNCE_MS);

/** Switch backup destination and sync immediately. */
export async function setTarget(target: BackupTarget): Promise<void> {
  setBackupTarget(target);
  setState({ target });
  await runNow();
}

/** Interactive (re)connect for the current cloud target, then sync. */
export async function connect(): Promise<void> {
  const target = getBackupTarget();
  if (target !== 'google-drive' && target !== 'icloud') return;
  const status = await getProvider(target).ensureConnected(true);
  if (status === 'ok') await runNow();
  else setState({ status: status === 'needs_consent' ? 'needs_reconnect' : 'error' });
}

/** Start the engine (idempotent): subscribe to changes, run an initial sync, and poll periodically. */
export function start(): void {
  if (started) return;
  started = true;
  unsubscribeActivity = subscribeActivity((entry) => {
    if (entry.timestamp > maxActivityTs) maxActivityTs = entry.timestamp;
    debouncedRun();
  });
  periodicTimer = setInterval(() => void runNow(), PERIODIC_MS);
  void runNow();
}

/** Stop the engine (idempotent): clear timers, unsubscribe, cancel pending work. */
export function stop(): void {
  started = false;
  debouncedRun.cancel();
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = null;
  unsubscribeActivity?.();
  unsubscribeActivity = null;
}
