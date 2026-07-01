// Backward-compatible cloud-backup surface for the manual Backup page. The actual Drive logic now
// lives in the provider abstraction (src/core/sync/providers/), so manual and automatic backup share
// one implementation. This adapter preserves the original API used by BackupPage.tsx.
import { googleDriveProvider } from '@/core/sync/providers/googleDriveProvider';

export { isCloudBackupConfigured } from '@/core/sync/providers/googleDriveProvider';

export interface CloudBackupProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  /** Upload (or overwrite) the encrypted backup blob in the user's cloud. */
  upload(blob: Blob): Promise<void>;
  /** Fetch the latest backup file's text, or null if none exists. */
  fetchLatest(): Promise<string | null>;
}

/** Legacy manual-backup adapter. Manual actions are interactive (may show Google's consent UI). */
export const googleDriveBackup: CloudBackupProvider = {
  id: googleDriveProvider.id,
  label: googleDriveProvider.label,
  isConfigured: () => googleDriveProvider.isAvailable(),

  async upload(blob: Blob): Promise<void> {
    const status = await googleDriveProvider.ensureConnected(true);
    if (status !== 'ok') throw new Error('Google authorization failed');
    await googleDriveProvider.push(blob);
  },

  async fetchLatest(): Promise<string | null> {
    const status = await googleDriveProvider.ensureConnected(true);
    if (status !== 'ok') throw new Error('Google authorization failed');
    return (await googleDriveProvider.pull())?.text ?? null;
  }
};
