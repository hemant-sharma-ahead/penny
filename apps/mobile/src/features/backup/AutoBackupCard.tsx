import { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { Banner, Button, Card, SegmentedControl } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useToast } from '~/context/ToastContext';
import { useBackupStatus } from '@/core/sync/SyncProvider';
import { getBackupState } from '@/core/sync/backupEngine';
import { exportBackup } from '@/core/backup/backupManager';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { getProvider } from '@/core/sync/providers';
import { isLocalBackupAvailable } from '@/core/sync/providers/localBackup';
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
 * RN port of apps/web-react/src/features/backup/AutoBackupCard.tsx — the one and only backup control
 * on this screen. "This device" and "Drive" previously also had their own standalone card (Export
 * backup / Back up to Google Drive) duplicating what this control already did — consolidated away
 * 2026-07-27 (see docs/DESIGN_GUIDELINES.md §1 "One capability, one control"). Each tab's "Back up now"
 * does the tab-appropriate thing: This device shares/downloads a .penny file (what "Export backup" used
 * to do); Drive pushes through the sync engine's real native Google Sign-In-backed provider
 * (googleDriveProvider.native.ts); iCloud stays disabled (no native bridge yet).
 */
export function AutoBackupCard() {
  const theme = useThemeColors();
  const { status, target, lastBackupAt, error, setTarget, runNow, connect } = useBackupStatus();
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);

  const driveAvailable = hasEntitlement('cloud_backup') && getProvider('google-drive').isAvailable();
  const icloudAvailable = getProvider('icloud').isAvailable();
  const localAvailable = isLocalBackupAvailable();
  const choice: TargetChoice = target ?? 'local';

  // Tabs are always clickable — each shows its own info when selected. A provider being unavailable
  // (not yet configured/signed in) disables that tab's "Back up now" specifically, not the tab itself;
  // see docs/DESIGN_GUIDELINES.md §1 "One capability, one control" for why this was previously wrong
  // (tabs silently blocked from switching, with no way to see why).
  const options: { value: TargetChoice; label: string; icon: string }[] = [
    { value: 'local', label: 'This device', icon: 'ti-device-mobile' },
    { value: 'google-drive', label: 'Drive', icon: 'ti-brand-google-drive' },
    { value: 'icloud', label: 'iCloud', icon: 'ti-brand-apple' }
  ];

  function pick(v: TargetChoice) {
    void setTarget(v);
  }

  const backupNowDisabled = (choice === 'google-drive' && !driveAvailable) || (choice === 'icloud' && !icloudAvailable);

  /** "This device" shares/downloads a copy on demand — the same action "Export backup" used to be, now
   *  the one place that capability lives. Distinct from the silent daily on-device snapshot the engine
   *  keeps in the background (localBackup.native.ts) — that's an invisible safety floor; this is an
   *  explicit "give me a copy" action, so it always does something visible when pressed. Same
   *  RN-Web-vs-native branch as BackupPage.tsx's old handleExport (expo-file-system has no web build). */
  async function exportToDevice() {
    setExporting(true);
    try {
      const blob = await exportBackup();
      const date = new Date().toISOString().slice(0, 10);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `penny-backup-${date}.penny`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const text = await new Response(blob).text();
        const file = new File(Paths.cache, `penny-backup-${date}.penny`);
        file.write(text);
        const Sharing = await import('expo-sharing');
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
      }
      showToast({ message: 'Backup shared.' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Export failed' });
    } finally {
      setExporting(false);
    }
  }

  /** Cloud targets: "Back up now" reuses the same due/dirty-gated engine run the automatic backup uses
   *  (there's no separate force-backup path) — so a press can be a legitimate no-op if nothing changed
   *  since the last run. Compare lastBackupAt before/after so the user gets a real answer either way,
   *  instead of silence. */
  async function backupNowToCloud() {
    const before = getBackupState().lastBackupAt;
    await runNow();
    const after = getBackupState();
    if (after.lastBackupAt && after.lastBackupAt !== before) {
      showToast({ message: 'Backed up just now.' });
    } else if (after.status === 'idle' && !after.error) {
      showToast({ message: 'Already up to date — nothing new to back up.' });
    }
    // status errors (offline / quota / needs_reconnect) already surface via the persistent Banner below.
  }

  function handleBackupNow() {
    if (choice === 'local') return void exportToDevice();
    return void backupNowToCloud();
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
      {choice === 'local' && !localAvailable && (
        <Text className="text-[11px] text-tertiary">
          This build doesn't support a silent daily backup — "Back up now" below still shares a copy on demand.
        </Text>
      )}

      {status === 'quota_exceeded' || status === 'error' ? (
        <Banner variant="danger">{error ?? STATUS_TEXT[status]}</Banner>
      ) : status === 'needs_reconnect' ? (
        <Banner variant="warning">{STATUS_TEXT.needs_reconnect}</Banner>
      ) : null}

      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[11px] text-tertiary flex-1">
          {choice === 'local'
            ? lastBackupAt
              ? `Last daily snapshot · ${formatDate(lastBackupAt)}`
              : 'No daily snapshot yet'
            : status === 'syncing'
              ? STATUS_TEXT.syncing
              : status === 'offline'
                ? STATUS_TEXT.offline
                : lastBackupAt
                  ? `Backed up · ${formatDate(lastBackupAt)}`
                  : 'Not backed up yet'}
        </Text>
        {status === 'needs_reconnect' && choice !== 'local' ? (
          <Button variant="secondary" onPress={() => void connect()}>
            Reconnect
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={backupNowDisabled}
            loading={choice === 'local' ? exporting : status === 'syncing'}
            onPress={handleBackupNow}
          >
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
