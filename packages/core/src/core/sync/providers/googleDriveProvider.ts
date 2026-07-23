// Google Drive backup/sync provider (Model B — the user's OWN Drive appDataFolder). The encrypted
// .penny blob is uploaded as-is; neither Google nor we can read it without the passphrase.
//
// ── GATED ── inert until BOTH are provided:
//   1. VITE_GOOGLE_CLIENT_ID  (an OAuth client ID for this origin)
//   2. CSP additions in index.html (script-src accounts.google.com; connect-src googleapis.com …)
// Until then isAvailable() is false and the UI stays disabled. The REST flow follows Google's GIS +
// Drive v3 docs but is UNTESTED until a client ID + CSP are in place.
import type { CloudProvider } from './types';
import { NeedsConsentError, QuotaExceededError } from './types';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'penny-backup.penny';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Read lazily (Vite still inlines the value in production builds) so config is runtime-checkable.
function clientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
}

export function isCloudBackupConfigured(): boolean {
  const id = clientId();
  return typeof id === 'string' && id.length > 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function gis(): any {
  return (window as { google?: any }).google;
}

function loadGis(): Promise<void> {
  if (gis()?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in')));
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google sign-in'));
    document.head.appendChild(s);
  });
}

/** Acquire an access token. `interactive:false` attempts a silent grant (prompt:'none') and rejects
 *  with NeedsConsentError if the user must re-consent — so background sync never pops a surprise UI. */
async function getAccessToken(interactive: boolean): Promise<string> {
  const id = clientId();
  if (!id) throw new Error('Google Drive backup is not configured');
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    const tokenClient = gis().accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.access_token) resolve(resp.access_token);
        else reject(new NeedsConsentError('google-drive'));
      },
      error_callback: () => reject(new NeedsConsentError('google-drive'))
    });
    tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
  if (!res.ok) throw new Error('Could not read your Google Drive');
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
    const token = await getAccessToken(false);
    return (await findFileMeta(token))?.tag ?? null;
  },

  async pull(): Promise<{ text: string; tag: string } | null> {
    const token = await getAccessToken(false);
    const meta = await findFileMeta(token);
    if (!meta) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${meta.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Download from Google Drive failed');
    return { text: await res.text(), tag: meta.tag };
  },

  async push(blob: Blob): Promise<{ tag: string }> {
    const token = await getAccessToken(false);
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
    if (!res.ok) {
      if (await isQuotaError(res)) throw new QuotaExceededError('google-drive');
      throw new Error('Upload to Google Drive failed');
    }
    const saved = (await res.json()) as { id: string; headRevisionId?: string; modifiedTime?: string };
    return { tag: saved.headRevisionId ?? saved.modifiedTime ?? saved.id };
  }
};
