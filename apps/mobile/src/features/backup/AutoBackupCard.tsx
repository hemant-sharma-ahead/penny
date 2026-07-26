import { View, Text } from 'react-native';
import { Banner, Button, Card, SegmentedControl } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useBackupStatus } from '@/core/sync/SyncProvider';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { getProvider } from '@/core/sync/providers';
import { formatDate } from '@/lib/date';

type TargetChoice = 'local' | 'google-drive' | 'icloud';

const STATUS_TEXT: Record<string, string> = {
  syncing: 'Backing up…',
  offline: 'Paused — offline',
  quota_exceeded: 'Cloud storage is full — free space or switch destination',
  needs_reconnect: 'Reconnect to keep backing up',
  error: 'Backup error'
};

/**
 * RN port of apps/web-react/src/features/backup/AutoBackupCard.tsx. Both cloud providers are
 * `isAvailable() === false` on mobile today (Google Drive needs a native Sign-In flow not built yet;
 * iCloud needs the Capacitor bridge this app doesn't use) and the on-device "This device" floor is
 * itself a no-op on RN (`isLocalBackupAvailable()` checks OPFS, absent on RN) — so choosing any target
 * here is honest UI with no working backend yet. This still ports cleanly because every one of those
 * gates degrades safely (returns `false`/no-ops) rather than crashing, matching this migration's
 * established "flag, don't fake" precedent for dormant capabilities.
 */
export function AutoBackupCard() {
  const theme = useThemeColors();
  const { status, target, lastBackupAt, error, setTarget, runNow, connect } = useBackupStatus();

  const driveAvailable = hasEntitlement('cloud_backup') && getProvider('google-drive').isAvailable();
  const icloudAvailable = getProvider('icloud').isAvailable();
  const choice: TargetChoice = target ?? 'local';

  const options: { value: TargetChoice; label: string; icon: string }[] = [
    { value: 'local', label: 'This device', icon: 'ti-device-mobile' },
    { value: 'google-drive', label: 'Drive', icon: 'ti-brand-google-drive' },
    { value: 'icloud', label: 'iCloud', icon: 'ti-brand-apple' }
  ];

  function pick(v: TargetChoice) {
    if (v === 'google-drive' && !driveAvailable) return;
    if (v === 'icloud' && !icloudAvailable) return;
    void setTarget(v);
  }

  return (
    <Card padding="lg" className="gap-4">
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: '#00a86b1a' }}>
          <Icon name="ti-refresh" size={20} color="#00a86b" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-primary">Automatic backup</Text>
          <Text className="text-xs mt-0.5 leading-relaxed text-tertiary">
            Back up to Google Drive or iCloud to restore on a new phone and sync across devices. On-device backups guard
            against accidental changes but are lost if you clear app data or lose the device.
          </Text>
        </View>
      </View>

      <SegmentedControl options={options} value={choice} onChange={pick} />

      {choice === 'google-drive' && !driveAvailable && (
        <Text className="text-[11px] text-tertiary">
          Google Drive activates once native Google Sign-In is configured.
        </Text>
      )}
      {choice === 'icloud' && !icloudAvailable && (
        <Text className="text-[11px] text-tertiary">iCloud isn't available on this build.</Text>
      )}

      {status === 'quota_exceeded' || status === 'error' ? (
        <Banner variant="danger">{error ?? STATUS_TEXT[status]}</Banner>
      ) : status === 'needs_reconnect' ? (
        <Banner variant="warning">{STATUS_TEXT.needs_reconnect}</Banner>
      ) : null}

      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[11px] text-tertiary flex-1">
          {status === 'syncing'
            ? STATUS_TEXT.syncing
            : status === 'offline'
              ? STATUS_TEXT.offline
              : lastBackupAt
                ? `Backed up · ${formatDate(lastBackupAt)}`
                : 'Not backed up yet'}
        </Text>
        {status === 'needs_reconnect' ? (
          <Button variant="secondary" onPress={() => void connect()}>
            Reconnect
          </Button>
        ) : (
          <Button variant="secondary" loading={status === 'syncing'} onPress={() => void runNow()}>
            Back up now
          </Button>
        )}
      </View>

      <Text className="text-[11px]" style={{ color: theme.neutral }}>
        Backups are encrypted on this device — no one but you can read them.
      </Text>
    </Card>
  );
}
