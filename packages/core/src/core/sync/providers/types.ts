// A cloud backup/sync destination the user owns (Model B — we store nothing). Providers are
// interchangeable: Google Drive (web now), iCloud (native, dormant until the Capacitor shell lands).
import type { BackupTrigger } from './backupNaming';

export type CloudProviderId = 'google-drive' | 'icloud';

/** One entry in a destination's Backup History (Backup History feature) — a single push, auto or
 *  manual, that's individually addressable (view/download/delete) rather than the one-fixed-file model
 *  every provider used before this. `id` is provider-specific (a Drive file id; a local filename) —
 *  callers should treat it as an opaque token, only ever round-tripping it back into that same
 *  provider's `delete`/`downloadEntry`. */
export interface BackupEntry {
  id: string;
  timestamp: number;
  sizeBytes: number;
  trigger: BackupTrigger;
}

export interface CloudProvider {
  readonly id: CloudProviderId;
  readonly label: string;
  /** Whether this provider can run in the current build/platform (config + platform gate). */
  isAvailable(): boolean;
  /** Obtain/refresh access. `interactive` may show a consent UI; non-interactive is silent-only. */
  ensureConnected(interactive: boolean): Promise<'ok' | 'needs_consent' | 'unavailable'>;
  /** A cheap change token (revision id / mtime) of the newest backup, without downloading, or null if
   *  none exists. */
  remoteTag(): Promise<string | null>;
  /** Download the newest backup's text + its tag, or null if none exists. */
  pull(): Promise<{ text: string; tag: string } | null>;
  /** Upload a new, separately-addressable backup entry (never overwrites a prior one — see Backup
   *  History); returns the new entry's tag. Throws QuotaExceededError when full. `trigger` records
   *  whether this was an automatic or a user-initiated ("Back up now") push, for the History list's
   *  Auto/Manual badge; defaults to `'manual'` when omitted (every pre-existing caller of this method
   *  was itself a manual/on-demand action). */
  push(blob: Blob, trigger?: BackupTrigger): Promise<{ tag: string }>;
  /** List this destination's backup history (any order — callers sort), for the Backup History UI.
   *  Optional: only providers that actually support a rolling multi-entry history implement it
   *  (currently Drive) — its absence means the UI simply has no History entry point for that
   *  destination, which is also how iCloud (code-complete but dormant, untouched by this feature) stays
   *  unaffected without needing a stub implementation. */
  list?(): Promise<BackupEntry[]>;
  /** Permanently delete one specific historical entry (Backup History's swipe-to-delete action). */
  delete?(entryId: string): Promise<void>;
  /** Fetch one specific historical entry's raw backup text by id (Backup History's Download action) —
   *  same shape `pull()` already returns for the newest entry, just addressed by id instead of
   *  "whichever is newest". */
  downloadEntry?(entryId: string): Promise<string>;
}

/** The active provider ran out of cloud storage — the engine surfaces a notification. */
export class QuotaExceededError extends Error {
  readonly providerId: CloudProviderId;
  constructor(providerId: CloudProviderId) {
    super(`${providerId} storage is full`);
    this.name = 'QuotaExceededError';
    this.providerId = providerId;
  }
}

/** The provider needs interactive re-authorization; background sync must not force a popup. */
export class NeedsConsentError extends Error {
  readonly providerId: CloudProviderId;
  constructor(providerId: CloudProviderId) {
    super(`${providerId} needs reconnection`);
    this.name = 'NeedsConsentError';
    this.providerId = providerId;
  }
}
