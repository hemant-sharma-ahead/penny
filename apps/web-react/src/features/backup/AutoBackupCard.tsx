import { useState } from 'react';
import { Banner, Button, Card, SegmentedControl } from '@/components/ui';
import { useBackupStatus } from '@/core/sync/SyncProvider';
import { getBackupState } from '@/core/sync/backupEngine';
import { exportBackup } from '@/core/backup/backupManager';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { getProvider } from '@/core/sync/providers';
import { isLocalBackupAvailable } from '@/core/sync/providers/localBackup';
import { STATUS } from '@/lib/statusColors';
import { formatDate } from '@/lib/date';
import { useToast } from '@/context/ToastContext';

// Automatic-backup control (Phase 1.5 Track D): choose a destination, see status, back up now — the
// one and only backup control on this screen. Previously "This device" and "Drive" each also had their
// own standalone card (Export backup / Back up to Google Drive) duplicating what this control already
// did — consolidated away 2026-07-27 (see docs/DESIGN_GUIDELINES.md §1 "One capability, one control").
// Each tab's "Back up now" now does the tab-appropriate thing: This device downloads a shareable
// .penny file (what "Export backup" used to do); Drive/iCloud push through the sync engine as before.
type TargetChoice = 'local' | 'google-drive' | 'icloud';

const STATUS_TEXT: Record<string, string> = {
  syncing: 'Backing up…',
  offline: 'Paused — offline',
  quota_exceeded: 'Cloud storage is full — free space or switch destination',
  needs_reconnect: 'Reconnect to keep backing up',
  error: 'Backup error'
};

export function AutoBackupCard() {
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

  /** "This device" downloads a shareable file on demand — the same action "Export backup" used to be,
   *  now the one place that capability lives. Distinct from the silent daily on-device snapshot the
   *  engine keeps in the background (localBackup.ts) — that's an invisible safety floor; this is an
   *  explicit "give me a copy" action, so it always does something visible when pressed. */
  async function exportToDevice() {
    setExporting(true);
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `penny-backup-${date}.penny`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ message: 'Backup downloaded.' });
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
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
          <i className="ti ti-refresh" style={{ fontSize: 20, color: '#00a86b' }} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-primary">Automatic backup</p>
          <p className="text-xs mt-0.5 leading-relaxed text-tertiary">
            Back up to Google Drive or iCloud to restore on a new phone and sync across devices. On-device backups guard
            against accidental changes but are lost if you clear app data or lose the device.
          </p>
        </div>
      </div>

      <SegmentedControl options={options} value={choice} onChange={(v) => pick(v)} cols={3} />

      {choice === 'google-drive' && !driveAvailable && (
        <p className="text-[11px] text-tertiary">
          Google Drive activates once a Google client ID + CSP are configured.
        </p>
      )}
      {choice === 'icloud' && !icloudAvailable && (
        <p className="text-[11px] text-tertiary">iCloud is available in the Penny app (native).</p>
      )}
      {choice === 'local' && !localAvailable && (
        <p className="text-[11px] text-tertiary">
          This browser doesn't support a silent daily backup — "Back up now" below still downloads a copy on demand.
        </p>
      )}

      {status === 'quota_exceeded' || status === 'error' ? (
        <Banner variant="danger">{error ?? STATUS_TEXT[status]}</Banner>
      ) : status === 'needs_reconnect' ? (
        <Banner variant="warning">{STATUS_TEXT.needs_reconnect}</Banner>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-tertiary">
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
        </p>
        {status === 'needs_reconnect' && choice !== 'local' ? (
          <Button variant="secondary" onClick={() => void connect()}>
            Reconnect
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={backupNowDisabled}
            loading={choice === 'local' ? exporting : status === 'syncing'}
            onClick={handleBackupNow}
          >
            Back up now
          </Button>
        )}
      </div>

      <p className="text-[11px]" style={{ color: STATUS.neutral }}>
        Backups are encrypted on this device — no one but you can read them.
      </p>
    </Card>
  );
}
