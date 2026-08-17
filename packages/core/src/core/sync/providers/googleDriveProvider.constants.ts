// Shared across googleDriveProvider.ts (web) and googleDriveProvider.native.ts — kept in exactly one
// place per the platform-variance-minimization principle (docs/ARCHITECTURE.md). Both platforms hit the
// same Drive v3 REST API directly (no shared HTTP client, since token acquisition genuinely differs:
// Google Identity Services on web vs. @react-native-google-signin/google-signin natively), so only the
// literal scope + filename are extracted, not the request logic itself.

/** appDataFolder scope — the backup file lives in a hidden per-app folder, invisible in the user's
 *  normal Drive UI and inaccessible to any other app. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const DRIVE_BACKUP_FILE_NAME = 'penny-backup.penny';

/** Turns a failed Drive API response into an actually-diagnosable string (`"403: Drive API has not
 *  been used in project ... before or it is disabled"`, `"403: The user does not have sufficient
 *  permissions"`, etc.) instead of a bare status code — every non-2xx/401 throw in all three provider
 *  variants was previously collapsing to one generic "Could not read your Google Drive"/"Upload...
 *  failed" message with no way to tell a disabled-API 403 apart from a scope/permission 403 apart from a
 *  transient 5xx without attaching a debugger. Reads Google's own standard `{error:{message}}` error
 *  body shape (same shape `isQuotaError()` already parses in the two callers that check for it); falls
 *  back to the HTTP status text alone if the body isn't that shape or isn't valid JSON. */
export async function describeDriveError(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { error?: { message?: string } };
    if (body.error?.message) return `${res.status}: ${body.error.message}`;
  } catch {
    // body wasn't JSON (or already consumed) — fall through to the plain status line below
  }
  return `${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
}
