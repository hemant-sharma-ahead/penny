// Shared across googleDriveProvider.ts (web) and googleDriveProvider.native.ts — kept in exactly one
// place per the platform-variance-minimization principle (docs/ARCHITECTURE.md). Both platforms hit the
// same Drive v3 REST API directly (no shared HTTP client, since token acquisition genuinely differs:
// Google Identity Services on web vs. @react-native-google-signin/google-signin natively), so only the
// literal scope + filename are extracted, not the request logic itself.

/** appDataFolder scope — the backup file lives in a hidden per-app folder, invisible in the user's
 *  normal Drive UI and inaccessible to any other app. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const DRIVE_BACKUP_FILE_NAME = 'penny-backup.penny';
