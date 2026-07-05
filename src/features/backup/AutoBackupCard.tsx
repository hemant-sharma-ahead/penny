import { Banner, Button, Card, SegmentedControl } from '@/components/ui';
import { useBackupStatus } from '@/core/sync/SyncProvider';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { getProvider } from '@/core/sync/providers';
import { STATUS } from '@/lib/statusColors';
import { formatDate } from '@/lib/date';

// Automatic-backup control (Phase 1.5 Track D): choose a destination, see status, back up now.
// The daily on-device backup always runs; cloud (Drive/iCloud) is opt-in.
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

      {status === 'quota_exceeded' || status === 'error' ? (
        <Banner variant="danger">{error ?? STATUS_TEXT[status]}</Banner>
      ) : status === 'needs_reconnect' ? (
        <Banner variant="warning">{STATUS_TEXT.needs_reconnect}</Banner>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-tertiary">
          {status === 'syncing'
            ? STATUS_TEXT.syncing
            : status === 'offline'
              ? STATUS_TEXT.offline
              : lastBackupAt
                ? `Backed up · ${formatDate(lastBackupAt)}`
                : 'Not backed up yet'}
        </p>
        {status === 'needs_reconnect' ? (
          <Button variant="secondary" onClick={() => void connect()}>
            Reconnect
          </Button>
        ) : (
          <Button variant="secondary" loading={status === 'syncing'} onClick={() => void runNow()}>
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
