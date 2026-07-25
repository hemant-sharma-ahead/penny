// Metro-web counterpart to googleDriveProvider.ts, same reasoning as entitlement.web.ts: Metro's
// platform resolution only picks `.native.ts` for iOS/Android, not the `web` target used by
// `apps/mobile`'s react-native-web build, so without this file Metro falls through to the bare
// `googleDriveProvider.ts` — whose `clientId()` reads Vite's `import.meta.env.VITE_GOOGLE_CLIENT_ID`,
// a global Metro never defines (crashes as soon as `AutoBackupCard` renders and calls `isAvailable()`).
// No Google Sign-In flow is wired up for Expo web either (same as native), so this stays dormant with
// the same "not configured" shape as `googleDriveProvider.native.ts` — a straight duplicate.
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
