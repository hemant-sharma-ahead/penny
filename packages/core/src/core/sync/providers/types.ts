// A cloud backup/sync destination the user owns (Model B — we store nothing). Providers are
// interchangeable: Google Drive (web now), iCloud (native, dormant until the Capacitor shell lands).

export type CloudProviderId = 'google-drive' | 'icloud';

export interface CloudProvider {
  readonly id: CloudProviderId;
  readonly label: string;
  /** Whether this provider can run in the current build/platform (config + platform gate). */
  isAvailable(): boolean;
  /** Obtain/refresh access. `interactive` may show a consent UI; non-interactive is silent-only. */
  ensureConnected(interactive: boolean): Promise<'ok' | 'needs_consent' | 'unavailable'>;
  /** A cheap change token (revision id / mtime) without downloading, or null if no backup exists. */
  remoteTag(): Promise<string | null>;
  /** Download the latest backup text + its tag, or null if none exists. */
  pull(): Promise<{ text: string; tag: string } | null>;
  /** Upload (overwrite) the encrypted blob; returns the new tag. Throws QuotaExceededError when full. */
  push(blob: Blob): Promise<{ tag: string }>;
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
