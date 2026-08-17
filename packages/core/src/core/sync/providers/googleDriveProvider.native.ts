// Native (RN, true device/emulator — not RN Web) Google Drive backup/sync provider. RN port of
// googleDriveProvider.ts: same Model B (the user's own Drive appDataFolder — neither Google nor
// Penny's servers can read the encrypted blob), same Drive v3 REST endpoints, same CloudProvider shape
// the sync engine (backupEngine.ts) already drives generically — only token acquisition differs, since
// there's no browser/GIS script to load here.
//
// ── GATED ── inert until `extra.googleWebClientId` is set in app.json (an OAuth "Web application"
// client ID from the same Google Cloud project as the Android/iOS client — required by
// @react-native-google-signin/google-signin for offline/refresh-capable access, not a bug in reading
// the "wrong" client type). Until then isAvailable() is false and the UI stays disabled, exactly like
// the web gate on VITE_GOOGLE_CLIENT_ID. See docs/EXTERNAL_APIS.md for the full Google Cloud Console
// setup this needs (project, OAuth consent screen, Android OAuth client keyed to this app's package +
// SHA-1, this web client id).
import Constants from 'expo-constants';
import {
  GoogleSignin,
  isNoSavedCredentialFoundResponse,
  type SignInSilentlyResponse
} from '@react-native-google-signin/google-signin';
import type { CloudProvider } from './types';
import { NeedsConsentError, QuotaExceededError } from './types';
import {
  DRIVE_SCOPE as SCOPE,
  DRIVE_BACKUP_FILE_NAME as FILE_NAME,
  describeDriveError
} from './googleDriveProvider.constants';

function webClientId(): string | undefined {
  return Constants.expoConfig?.extra?.googleWebClientId as string | undefined;
}

export function isCloudBackupConfigured(): boolean {
  const id = webClientId();
  return typeof id === 'string' && id.length > 0;
}

let configured = false;
function ensureConfigured(id: string): void {
  if (configured) return;
  GoogleSignin.configure({ webClientId: id, scopes: [SCOPE] });
  configured = true;
}

const NO_SAVED_CREDENTIAL: SignInSilentlyResponse = { type: 'noSavedCredentialFound', data: null };

/** Acquire an access token. `interactive:false` only ever attempts a silent reauth (never pops native
 *  Sign-In UI) and throws NeedsConsentError if there's no usable saved credential — so background sync
 *  never surprises the user, matching the web provider's exact contract. */
async function getAccessToken(interactive: boolean): Promise<string> {
  const id = webClientId();
  if (!id) throw new Error('Google Drive backup is not configured');
  ensureConfigured(id);

  let silent: SignInSilentlyResponse;
  try {
    silent = await GoogleSignin.signInSilently();
  } catch {
    silent = NO_SAVED_CREDENTIAL;
  }

  if (isNoSavedCredentialFoundResponse(silent)) {
    if (!interactive) throw new NeedsConsentError('google-drive');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
    } catch {
      throw new NeedsConsentError('google-drive');
    }
  }

  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
}

interface DriveMeta {
  id: string;
  tag: string;
}

async function findFileMeta(token: string): Promise<DriveMeta | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const fields = encodeURIComponent('files(id,headRevisionId,modifiedTime)');
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime desc&fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 401) throw new NeedsConsentError('google-drive');
  if (!res.ok) throw new Error(`Could not read your Google Drive (${await describeDriveError(res)})`);
  const data = (await res.json()) as { files?: { id: string; headRevisionId?: string; modifiedTime?: string }[] };
  const f = data.files?.[0];
  if (!f) return null;
  return { id: f.id, tag: f.headRevisionId ?? f.modifiedTime ?? f.id };
}

async function isQuotaError(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = (await res.clone().json()) as { error?: { errors?: { reason?: string }[] } };
    return body.error?.errors?.some((e) => e.reason === 'storageQuotaExceeded') ?? false;
  } catch {
    return false;
  }
}

/** Runs `fn` with a fresh access token; on a NeedsConsentError raised mid-request (an expired/revoked
 *  token, not a genuine missing-credential case) forces one silent reauth and retries once — access
 *  tokens expire routinely (~1h) and a background sync shouldn't fail on that alone. Mirrors the
 *  retry-after-refresh pattern reference apps (e.g. Cashew's `refreshGoogleSignIn()`) use for the same
 *  reason. */
async function withRetry<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getAccessToken(false);
  try {
    return await fn(token);
  } catch (err) {
    if (!(err instanceof NeedsConsentError)) throw err;
    const retryToken = await getAccessToken(false);
    return await fn(retryToken);
  }
}

export const googleDriveProvider: CloudProvider = {
  id: 'google-drive',
  label: 'Google Drive',

  isAvailable: isCloudBackupConfigured,

  async ensureConnected(interactive: boolean): Promise<'ok' | 'needs_consent' | 'unavailable'> {
    if (!isCloudBackupConfigured()) return 'unavailable';
    try {
      await getAccessToken(interactive);
      return 'ok';
    } catch (err) {
      return err instanceof NeedsConsentError ? 'needs_consent' : 'unavailable';
    }
  },

  async remoteTag(): Promise<string | null> {
    return withRetry(async (token) => (await findFileMeta(token))?.tag ?? null);
  },

  async pull(): Promise<{ text: string; tag: string } | null> {
    return withRetry(async (token) => {
      const meta = await findFileMeta(token);
      if (!meta) return null;
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${meta.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) throw new NeedsConsentError('google-drive');
      if (!res.ok) throw new Error(`Download from Google Drive failed (${await describeDriveError(res)})`);
      return { text: await res.text(), tag: meta.tag };
    });
  },

  async push(blob: Blob): Promise<{ tag: string }> {
    return withRetry(async (token) => {
      const existing = await findFileMeta(token);
      const metadata = { name: FILE_NAME, parents: existing ? undefined : ['appDataFolder'] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);
      const base = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}`
        : 'https://www.googleapis.com/upload/drive/v3/files';
      const res = await fetch(`${base}?uploadType=multipart&fields=id,headRevisionId,modifiedTime`, {
        method: existing ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      if (res.status === 401) throw new NeedsConsentError('google-drive');
      if (!res.ok) {
        if (await isQuotaError(res)) throw new QuotaExceededError('google-drive');
        throw new Error(`Upload to Google Drive failed (${await describeDriveError(res)})`);
      }
      const saved = (await res.json()) as { id: string; headRevisionId?: string; modifiedTime?: string };
      return { tag: saved.headRevisionId ?? saved.modifiedTime ?? saved.id };
    });
  }
};
