// RN counterpart to googleDriveProvider.ts. Web's `clientId()` reads `import.meta.env.VITE_GOOGLE_
// CLIENT_ID` (Vite-only syntax) and its connect flow loads Google Identity Services via a `<script>`
// tag injected into `document.head` — none of which exists under Metro/Hermes. Same "no config yet"
// shape as `apiBase.native.ts`/`entitlement.native.ts`: `isCloudBackupConfigured()` stays false until a
// native Google Sign-In flow is actually wired up (a real Track — not this pass), so every other method
// here is unreachable in practice, exactly like `icloudProvider.ts`'s "dormant" pattern for iCloud on web.
import type { CloudProvider } from './types';
import { NeedsConsentError } from './types';

export function isCloudBackupConfigured(): boolean {
  return false;
}

export const googleDriveProvider: CloudProvider = {
  id: 'google-drive',
  label: 'Google Drive',

  isAvailable: isCloudBackupConfigured,

  async ensureConnected(): Promise<'ok' | 'needs_consent' | 'unavailable'> {
    return 'unavailable';
  },

  async remoteTag(): Promise<string | null> {
    throw new NeedsConsentError('google-drive');
  },

  async pull(): Promise<{ text: string; tag: string } | null> {
    throw new NeedsConsentError('google-drive');
  },

  async push(): Promise<{ tag: string }> {
    throw new NeedsConsentError('google-drive');
  }
};
