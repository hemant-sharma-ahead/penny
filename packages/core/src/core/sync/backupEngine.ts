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
import { getAutoBackupEnabled, getBackupFrequencyDays, getBackupTarget, setBackupTarget } from './backupPrefs';
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

/**
 * Run one sync cycle. Safe to call anytime; a mutex prevents overlap and it no-ops when nothing's due.
 *
 * @param manual - `true` for a user-initiated press ("Back up now"/switching destination); `false`
 *   (default) for the engine's own periodic/debounced/foreground-return triggers. The only behavioral
 *   difference: when the user has turned automatic backup off (backupPrefs's `getAutoBackupEnabled`),
 *   a non-manual cloud run skips the push entirely (pull still runs) — a manual run always attempts it,
 *   same as before this setting existed. Manual does *not* bypass the existing due/dirty gating itself,
 *   so a press with nothing changed can still be a legitimate no-op (unchanged from before).
 */
export async function runNow(manual = false): Promise<void> {
  if (running) return;
  if (!keystore.isUnlocked()) return;
  running = true;
  try {
    const target = getBackupTarget();
    setState({ target });
    const cursor = await loadCursor();
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

      const dueDaily = !cursor.lastBackupAt || Date.now() - cursor.lastBackupAt > getBackupFrequencyDays() * DAY_MS;
      const tag = await provider.remoteTag();
      const remoteChanged = tag !== (cursor.remoteTag ?? null);
      const decision = decideSync({ target, canRun: true, remoteChanged, localDirty, dueDaily });
      // Automatic (non-manual) pushes are throttled to the configured frequency — only `dueDaily`
      // gates them, not `localDirty`. Real-device report, 2026-08-21: `decision.push`
      // (`localDirty || dueDaily`) meant any single change pushed within the 4s debounce regardless of
      // the 1–14 day frequency setting — the frequency control has to actually be the schedule, not
      // just a floor that a same-second edit always beats anyway. A manual "Back up now" (or switching
      // destination, which also calls this with manual:true) still always attempts a push immediately,
      // same as before.
      const push = manual ? decision.push : dueDaily && getAutoBackupEnabled();
      if (!decision.pull && !push) {
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
      if (push) {
        // Backup History (decided scope): every push becomes its own new, separately-addressable entry
        // (never an overwrite) — `manual` here is exactly runNow's own trigger for this cycle, so it
        // doubles as the entry's Auto/Manual badge with no separate bookkeeping.
        const { tag: newTag } = await provider.push(await exportBackup(), manual ? 'manual' : 'auto');
        cursor.remoteTag = newTag;
        cursor.pushedAt = maxActivityTs;
        cursor.lastBackupAt = Date.now();
      }
      await saveCursor(cursor);
      setState({ status: 'idle', lastBackupAt: cursor.lastBackupAt ?? state.lastBackupAt, error: null });
      return;
    }

    // ── On-device daily floor (target 'local' or none) — always daily, unaffected by the cloud-only
    // auto-backup toggle/frequency above (no such control exists for this destination). ───────────────
    const dueDaily = !cursor.lastBackupAt || Date.now() - cursor.lastBackupAt > DAY_MS;
    const decision = decideSync({ target, canRun: true, remoteChanged: false, localDirty, dueDaily });
    if (decision.localSnapshot) {
      setState({ status: 'syncing', error: null });
      // Same trigger convention as the cloud branch above — a fresh, separately-addressable history
      // entry every time, tagged by whether this run was user-initiated or the automatic floor.
      const ok = await saveLocalSnapshot(await exportBackup(), manual ? 'manual' : 'auto');
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

/** Switch backup destination and sync immediately (manual — always attempts a push regardless of the
 *  auto-backup toggle, same as a "Back up now" press). */
export async function setTarget(target: BackupTarget): Promise<void> {
  setBackupTarget(target);
  setState({ target });
  await runNow(true);
}

/** Force-overwrites the current cloud target's backup with this device's current data, skipping the
 *  pull/merge step entirely. The only way out of `foreign_blob` for someone who deliberately wants to
 *  keep this device's (fresh) vault and discard the old Drive/iCloud backup rather than restore it —
 *  today, `runNow()`'s normal cycle always attempts a pull first while `foreign_blob` is active, which
 *  throws before a push ever gets a chance to run, so there was previously no way out of that state
 *  other than restoring the old backup (real-device testing feedback, 2026-08-21). Destructive and
 *  irreversible — the real UI action (`AutoBackupCard`'s `foreign_blob` banner) gates this behind a
 *  confirm dialog; see `docs/mockups/proposals/drive-foreign-blob-override-v1.html`. */
export async function overwriteRemoteWithLocal(): Promise<void> {
  if (running) return;
  if (!keystore.isUnlocked()) return;
  running = true;
  try {
    const target = getBackupTarget();
    if (target !== 'google-drive' && target !== 'icloud') return;
    if (!hasEntitlement('cloud_backup')) return;
    const provider = getProvider(target);
    if (!provider.isAvailable()) return;

    setState({ status: 'syncing', error: null });
    const cursor = await loadCursor();
    // Always a deliberate, user-initiated action (see this function's own doc comment) — always 'manual'.
    const { tag: newTag } = await provider.push(await exportBackup(), 'manual');
    cursor.remoteTag = newTag;
    cursor.pushedAt = maxActivityTs;
    cursor.lastBackupAt = Date.now();
    await saveCursor(cursor);
    setState({ status: 'idle', lastBackupAt: cursor.lastBackupAt, error: null });
  } catch (err) {
    if (err instanceof QuotaExceededError) setState({ status: 'quota_exceeded', error: 'Cloud storage is full.' });
    else if (err instanceof NeedsConsentError)
      setState({ status: 'needs_reconnect', error: 'Reconnect to keep syncing.' });
    else setState({ status: 'error', error: err instanceof Error ? err.message : 'Backup failed.' });
  } finally {
    running = false;
  }
}

/** Interactive (re)connect for the current cloud target, then sync. */
export async function connect(): Promise<void> {
  const target = getBackupTarget();
  if (target !== 'google-drive' && target !== 'icloud') return;
  const status = await getProvider(target).ensureConnected(true);
  if (status === 'ok') await runNow(true);
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
