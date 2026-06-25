// Cloud backup to the user's OWN Google Drive (appDataFolder). The encrypted .penny
// blob is uploaded as-is — neither Google nor we can read it without the passphrase.
//
// ── GATED ──────────────────────────────────────────────────────────────────────
// This is inert until BOTH are provided:
//   1. VITE_GOOGLE_CLIENT_ID  (a Google Cloud OAuth client ID for this origin)
//   2. CSP additions in index.html:
//        script-src  … https://accounts.google.com
//        connect-src … https://www.googleapis.com https://accounts.google.com
// Until then `isCloudBackupConfigured()` is false and the UI stays disabled.
// The network code below follows Google's documented GIS + Drive REST flow but is
// UNTESTED until a client ID + CSP are in place.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'penny-backup.penny';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export function isCloudBackupConfigured(): boolean {
  return typeof CLIENT_ID === 'string' && CLIENT_ID.length > 0;
}

export interface CloudBackupProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  /** Upload (or overwrite) the encrypted backup blob in the user's cloud. */
  upload(blob: Blob): Promise<void>;
  /** Fetch the latest backup file's text, or null if none exists. */
  fetchLatest(): Promise<string | null>;
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

async function getAccessToken(): Promise<string> {
  if (!CLIENT_ID) throw new Error('Google Drive backup is not configured');
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    const tokenClient = gis().accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.access_token) resolve(resp.access_token);
        else reject(new Error(resp.error ?? 'Google authorization failed'));
      }
    });
    tokenClient.requestAccessToken();
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function findFileId(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime desc&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Could not read your Google Drive');
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

export const googleDriveBackup: CloudBackupProvider = {
  id: 'google-drive',
  label: 'Google Drive',
  isConfigured: isCloudBackupConfigured,

  async upload(blob: Blob): Promise<void> {
    const token = await getAccessToken();
    const existingId = await findFileId(token);
    const metadata = { name: FILE_NAME, parents: existingId ? undefined : ['appDataFolder'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    const url = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const res = await fetch(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    if (!res.ok) throw new Error('Upload to Google Drive failed');
  },

  async fetchLatest(): Promise<string | null> {
    const token = await getAccessToken();
    const id = await findFileId(token);
    if (!id) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Download from Google Drive failed');
    return res.text();
  }
};
