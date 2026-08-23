import { googleDriveProvider } from './googleDriveProvider';
import { icloudProvider } from './icloudProvider';
import type { CloudProvider, CloudProviderId } from './types';

export * from './types';
export {
  isCloudBackupConfigured,
  getConnectedGoogleAccount,
  disconnectGoogleAccount,
  type DriveAccountInfo
} from './googleDriveProvider';
export { isLocalBackupAvailable, latestLocalSnapshot, saveLocalSnapshot } from './localBackup';

/** All cloud providers (available or not). iCloud is present but dormant until native. */
export const CLOUD_PROVIDERS: readonly CloudProvider[] = [googleDriveProvider, icloudProvider];

export function getProvider(id: CloudProviderId): CloudProvider {
  const provider = CLOUD_PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown cloud provider: ${id}`);
  return provider;
}

/** Providers usable in the current build/platform (Drive on web; iCloud on Apple native). */
export function availableProviders(): CloudProvider[] {
  return CLOUD_PROVIDERS.filter((p) => p.isAvailable());
}
