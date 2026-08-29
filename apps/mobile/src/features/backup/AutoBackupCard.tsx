import { useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { Banner, Button, Card, ConfirmDialog, IconBadge, SegmentedControl, Toggle } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { AppleLogo, DriveLogo, DRIVE_BLUE } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { useTheme } from '~/theme/ThemeProvider';
import { useToast } from '~/context/ToastContext';
import { useBackupStatus } from '@/core/sync/SyncProvider';
import { getBackupState } from '@/core/sync/backupEngine';
import { exportBackup } from '@/core/backup/backupManager';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import {
  getProvider,
  getConnectedGoogleAccount,
  disconnectGoogleAccount,
  saveLocalSnapshot
} from '@/core/sync/providers';
import { isLocalBackupAvailable } from '@/core/sync/providers/localBackup';
import {
  getAutoBackupEnabled,
  setAutoBackupEnabled,
  getBackupFrequencyDays,
  setBackupFrequencyDays
} from '@/core/sync/backupPrefs';
import { DAY_MS, formatDateTime } from '@/lib/date';
import { tint } from '~/lib/color';
import { BackupHistoryModal } from './BackupHistoryModal';
import { shareBackupFile } from './shareBackupFile';

type TargetChoice = 'local' | 'google-drive' | 'icloud';

const STATUS_TEXT: Record<string, string> = {
  syncing: 'Backing up…',
  offline: 'Paused — offline',
  quota_exceeded: 'Cloud storage is full — free space or switch destination',
  needs_reconnect: 'Reconnect to keep backing up',
  error: 'Backup error'
};

const ROWS: { value: TargetChoice; label: string; icon: string }[] = [
  { value: 'local', label: 'This device', icon: 'ti-device-mobile' },
  { value: 'google-drive', label: 'Drive', icon: 'ti-brand-google-drive' },
  { value: 'icloud', label: 'iCloud', icon: 'ti-brand-apple' }
];

const FREQ_OPTIONS: { value: '1' | '3' | '7' | '14'; label: string }[] = [
  { value: '1', label: '1 day' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' }
];

/** Nearest preset for a possibly-arbitrary stored value (only these four presets are ever written by
 *  this control, but this stays robust to any future/legacy value). */
function nearestFreqOption(days: number): '1' | '3' | '7' | '14' {
  const opts = [1, 3, 7, 14];
  const nearest = opts.reduce((a, b) => (Math.abs(b - days) < Math.abs(a - days) ? b : a));
  return String(nearest) as '1' | '3' | '7' | '14';
}

/** Derived purely from `lastBackupAt` + the same frequency window `backupEngine.ts`'s own `dueDaily`
 *  check uses, so this caption can never disagree with the real gating logic. `frequencyDays` is fixed
 *  at 1 for "This device" (`backupEngine.ts`'s local branch hardcodes `DAY_MS`, not user-configurable)
 *  and the user's own setting for Drive. Real-device report, 2026-08-29
 *  (docs/mockups/proposals/next-auto-backup-caption-v1.html): with no visible "next run" indicator, a
 *  backup that's correctly not yet due read as indistinguishable from one that was stuck. */
function nextBackupCaption(lastBackupAt: number | null, frequencyDays: number): { text: string; due: boolean } | null {
  if (!lastBackupAt) return null;
  const next = lastBackupAt + frequencyDays * DAY_MS;
  if (next <= Date.now()) {
    return { text: 'Next backup · due now — runs the next time you open the app', due: true };
  }
  return { text: `Next backup · ${formatDateTime(next)}`, due: false };
}

/**
 * RN port of apps/web-react/src/features/backup/AutoBackupCard.tsx — the one and only backup control
 * on this screen. "This device" and "Drive" previously also had their own standalone card (Export
 * backup / Back up to Google Drive) duplicating what this control already did — consolidated away
 * 2026-07-27 (see docs/DESIGN_GUIDELINES.md §1 "One capability, one control"). Each row's "Back up now"
 * does the row-appropriate thing: This device shares/downloads a .penny file (what "Export backup" used
 * to do); Drive pushes through the sync engine's real native Google Sign-In-backed provider
 * (googleDriveProvider.native.ts); iCloud stays disabled (no native bridge yet).
 *
 * Destination picker (2026-08-21, Backup & Restore redesign, Option B —
 * docs/mockups/proposals/backup-restore-redesign-v1.html): the old 3-way segmented control is now 3
 * tap-to-reveal rows (same interaction AccountList.tsx already uses for its per-account action row),
 * one open at a time. Tapping a row both expands it *and* selects it as the active backup destination —
 * the same dual purpose the old segmented tab's `onPress` already had (`pick(v)`), just carried over
 * onto a row tap instead of a tab tap. This keeps exactly one row "the truth" at a time, matching the
 * engine's own single-target model (`backupEngine.ts`'s `state.target`) — there's no independent
 * "peek at another destination's status without switching to it" affordance, by design.
 */
export function AutoBackupCard({ onFixForeignBlob }: { onFixForeignBlob?: () => void }) {
  const theme = useThemeColors();
  const { activePalette } = useTheme();
  const { status, target, lastBackupAt, error, setTarget, runNow, connect, overwriteRemoteWithLocal } =
    useBackupStatus();
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [overwriting, setOverwriting] = useState(false);
  // Backup History — which destination's popup (if any) is open. Two independent single-destination
  // popups (per the mockup's own decision), not one combined tabbed modal, so this is just which one
  // (or none) rather than a boolean per destination.
  const [historyTarget, setHistoryTarget] = useState<'local' | 'google-drive' | null>(null);

  const driveAvailable = hasEntitlement('cloud_backup') && getProvider('google-drive').isAvailable();
  const icloudAvailable = getProvider('icloud').isAvailable();
  const localAvailable = isLocalBackupAvailable();
  const choice: TargetChoice = target ?? 'local';

  // Single-open accordion (Option B) — defaults to whichever destination is already selected, then
  // tracks the user's own taps. See this file's doc comment above for why expand and select are the
  // same action here.
  const [expandedTarget, setExpandedTarget] = useState<TargetChoice>(choice);
  const [showAccountActions, setShowAccountActions] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Drive account identity (item 4 of the redesign) — `getConnectedGoogleAccount()` is a cheap
  // synchronous read of the native module's own cached signed-in user (real on native; always null
  // on web/RN Web, see googleDriveProvider.ts's doc comment). Read directly on every render (no
  // state/effect needed) so connect/disconnect/switch/reconnect all reflect immediately as soon as
  // whatever state change they trigger (status/choice/disconnecting/switchingAccount, ...) re-renders
  // this component.
  const driveAccount = getConnectedGoogleAccount();

  // Auto-backup enabled + frequency (item 5 — real backing prefs, not just UI; see
  // packages/core/src/core/sync/backupPrefs.ts and backupEngine.ts's `runNow(manual)` gating).
  const [autoBackupOn, setAutoBackupOn] = useState(() => getAutoBackupEnabled());
  const [freqDays, setFreqDays] = useState(() => getBackupFrequencyDays());

  function handleToggleAutoBackup(next: boolean) {
    setAutoBackupOn(next);
    setAutoBackupEnabled(next);
  }
  function handleSetFreqDays(days: number) {
    setFreqDays(days);
    setBackupFrequencyDays(days);
  }

  function handleRowPress(v: TargetChoice) {
    setExpandedTarget(v);
    setShowAccountActions(false);
    if (v !== choice) void setTarget(v);
  }

  async function handleSwitchAccount() {
    setShowAccountActions(false);
    setSwitchingAccount(true);
    try {
      await disconnectGoogleAccount();
      await connect();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Could not switch account' });
    } finally {
      setSwitchingAccount(false);
    }
  }

  async function handleDisconnectAccount() {
    setShowAccountActions(false);
    setDisconnecting(true);
    try {
      await disconnectGoogleAccount();
      // Drive is no longer usable once signed out — fall back to the on-device floor rather than
      // leaving the engine pointed at a destination it can no longer reach.
      await setTarget('local');
      setExpandedTarget('local');
      showToast({ message: 'Disconnected from Google Drive.' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Could not disconnect' });
    } finally {
      setDisconnecting(false);
    }
  }

  /** The `foreign_blob` banner's second, destructive option (docs/mockups/proposals/
   *  drive-foreign-blob-override-v1.html) — for someone who deliberately wants to keep this device's
   *  current vault and discard the old Drive backup, rather than restore it (real-device testing
   *  feedback, 2026-08-21: there was previously no way out of this state other than restoring). */
  async function handleOverwriteConfirm() {
    setShowOverwriteConfirm(false);
    setOverwriting(true);
    try {
      await overwriteRemoteWithLocal();
      showToast({ message: 'Drive backup overwritten with this device’s data.' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Overwrite failed' });
    } finally {
      setOverwriting(false);
    }
  }

  /** "This device" shares/downloads a copy on demand — the same action "Export backup" used to be, now
   *  the one place that capability lives. Also, since Backup History (decided scope: "Manual back up
   *  now always creates a new entry"), this now saves a real `'manual'` history entry alongside the
   *  share/download — previously this action was purely ephemeral (nothing persisted, unlike the
   *  engine's own silent `'auto'` daily snapshot in `localBackup.native.ts`), which would have left This
   *  device's manual backups invisible in its own History popup. The actual write-to-temp/share dance is
   *  `shareBackupFile()` (shared with `BackupHistoryModal.tsx`'s per-entry Download action). */
  async function exportToDevice() {
    setExporting(true);
    try {
      const blob = await exportBackup();
      const text = await new Response(blob).text();
      await saveLocalSnapshot(blob, 'manual');
      const date = new Date().toISOString().slice(0, 10);
      await shareBackupFile(text, `penny-backup-${date}.penny`);
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
   *  instead of silence. `manual: true` so this always attempts the push even if the auto-backup
   *  toggle is off. */
  async function backupNowToCloud() {
    const before = getBackupState().lastBackupAt;
    await runNow(true);
    const after = getBackupState();
    if (after.lastBackupAt && after.lastBackupAt !== before) {
      showToast({ message: 'Backed up just now.' });
    } else if (after.status === 'idle' && !after.error) {
      showToast({ message: 'Already up to date — nothing new to back up.' });
    }
    // status errors (offline / quota / needs_reconnect) already surface via the banners below.
  }

  function handleBackupNow() {
    if (choice === 'local') return void exportToDevice();
    return void backupNowToCloud();
  }

  function rowCaption(v: TargetChoice): string {
    if (v !== choice) {
      if (v === 'local') return 'On-device safety copy';
      if (v === 'google-drive') return driveAvailable ? 'Not selected' : 'Requires Google Sign-In setup';
      return icloudAvailable ? 'Not selected' : 'Unavailable on this build';
    }
    if (v === 'local')
      return lastBackupAt ? `Last daily snapshot · ${formatDateTime(lastBackupAt)}` : 'No daily snapshot yet';
    if (status === 'syncing') return STATUS_TEXT.syncing;
    if (status === 'offline') return STATUS_TEXT.offline;
    if (v === 'google-drive' && driveAccount) {
      return lastBackupAt ? `${driveAccount.email} · ${formatDateTime(lastBackupAt)}` : driveAccount.email;
    }
    return lastBackupAt ? `Backed up · ${formatDateTime(lastBackupAt)}` : 'Not backed up yet';
  }

  function renderLocalPanel() {
    return (
      <View className="gap-2.5">
        {!localAvailable && (
          <Text className="text-[11px] text-tertiary">
            This build doesn't support a silent daily backup — "Back up now" below still shares a copy on demand.
          </Text>
        )}
        <View className="flex-row items-center justify-between gap-3">
          {/* Tappable (Backup History) — same label+chevron affordance SettingsPage.tsx's Row already
           *  uses elsewhere in this app, appended inline right after the existing caption text rather
           *  than turning this into a full icon+label row (the minimal diff for a caption that wasn't
           *  one before). Opens This device's own History popup — a distinct list from Drive's below. */}
          <Pressable
            onPress={() => setHistoryTarget('local')}
            accessibilityLabel="View This device's backup history"
            className="flex-row items-center gap-1 flex-1"
          >
            <View className="flex-1">
              <Text className="text-[11px] text-tertiary">
                {lastBackupAt ? `Last daily snapshot · ${formatDateTime(lastBackupAt)}` : 'No daily snapshot yet'}
              </Text>
              {localAvailable &&
                (() => {
                  const next = nextBackupCaption(lastBackupAt, 1);
                  return next ? (
                    <Text
                      className="text-[10.5px] mt-0.5"
                      style={{ color: next.due ? theme.warning : theme.textTertiary }}
                    >
                      {next.text}
                    </Text>
                  ) : null;
                })()}
            </View>
            <Icon name="ti-chevron-right" size={13} color={theme.textTertiary} />
          </Pressable>
          <Button variant="primary" loading={exporting} onPress={handleBackupNow}>
            Back up now
          </Button>
        </View>
      </View>
    );
  }

  function renderIcloudPanel() {
    if (!icloudAvailable) {
      return <Text className="text-[11px] text-tertiary">iCloud isn't available on this build.</Text>;
    }
    return (
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[11px] text-tertiary flex-1">
          {status === 'needs_reconnect'
            ? STATUS_TEXT.needs_reconnect
            : lastBackupAt
              ? `Backed up · ${formatDateTime(lastBackupAt)}`
              : 'Not backed up yet'}
        </Text>
        {status === 'needs_reconnect' ? (
          <Button variant="secondary" onPress={() => void connect()}>
            Reconnect
          </Button>
        ) : status === 'error' ? (
          <Button variant="secondary" onPress={handleBackupNow}>
            Retry
          </Button>
        ) : (
          <Button variant="primary" loading={status === 'syncing'} onPress={handleBackupNow}>
            Back up now
          </Button>
        )}
      </View>
    );
  }

  function renderDrivePanel() {
    if (!driveAvailable) {
      return (
        <Text className="text-[11px] text-tertiary">
          Google Drive activates once native Google Sign-In is configured.
        </Text>
      );
    }

    return (
      <View className="gap-3">
        {status === 'foreign_blob' ? (
          // Distinct from the plain 'error' banner below — this is always fixable, so it gets an
          // explanation plus two direct CTAs instead of a dead-end error message (real-device testing
          // feedback, 2026-08-18). Second button (2026-08-21): restoring was the only option, with no way
          // to instead keep this device's own data and discard the old Drive backup — see
          // docs/mockups/proposals/drive-foreign-blob-override-v1.html.
          <View className="gap-2">
            <Banner variant="danger" title="This backup needs a manual restore">
              {error ?? "This device's data doesn't match the key your Drive backup was encrypted with."}
            </Banner>
            <Button variant="secondary" fullWidth onPress={() => onFixForeignBlob?.()}>
              Restore with my passphrase
            </Button>
            <Button variant="danger" fullWidth loading={overwriting} onPress={() => setShowOverwriteConfirm(true)}>
              Overwrite Drive with this device's data instead
            </Button>
          </View>
        ) : driveAccount ? (
          <View className="gap-1.5">
            <View className="flex-row items-center gap-2.5">
              {driveAccount.photoUrl ? (
                <Image source={{ uri: driveAccount.photoUrl }} className="w-9 h-9 rounded-full" />
              ) : (
                <View
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: theme.primary }}
                >
                  <Text className="text-sm font-bold text-white">
                    {(driveAccount.name ?? driveAccount.email).charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text className="text-[13px] font-semibold text-primary" numberOfLines={1}>
                  {driveAccount.email}
                </Text>
                <Text className="text-[10px] text-tertiary mt-0.5">Connected to Google Drive</Text>
              </View>
              <Pressable
                onPress={() => setShowAccountActions((s) => !s)}
                accessibilityLabel="Account options"
                className="w-7 h-7 rounded-md items-center justify-center"
                style={{ backgroundColor: showAccountActions ? tint(theme.primary, 16) : 'transparent' }}
              >
                <Icon
                  name="ti-dots-vertical"
                  size={15}
                  color={showAccountActions ? theme.primary : theme.textTertiary}
                />
              </Pressable>
            </View>
            {showAccountActions && (
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  loading={switchingAccount}
                  onPress={() => void handleSwitchAccount()}
                >
                  Switch account
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  loading={disconnecting}
                  onPress={() => void handleDisconnectAccount()}
                >
                  Disconnect
                </Button>
              </View>
            )}
          </View>
        ) : (
          <View className="gap-2">
            <Banner variant="warning" title="Not connected">
              Reconnect to keep backing up to Drive.
            </Banner>
            <Button variant="secondary" fullWidth onPress={() => void connect()}>
              Reconnect
            </Button>
          </View>
        )}

        {status === 'quota_exceeded' || status === 'error' ? (
          <Banner variant="danger">{error ?? STATUS_TEXT[status]}</Banner>
        ) : status === 'needs_reconnect' && driveAccount ? (
          <Banner variant="warning">{STATUS_TEXT.needs_reconnect}</Banner>
        ) : null}

        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs font-medium text-secondary flex-1">Automatically back up to Drive</Text>
          <Toggle
            value={autoBackupOn}
            onChange={handleToggleAutoBackup}
            accessibilityLabel="Automatically back up to Drive"
          />
        </View>
        {autoBackupOn && (
          <SegmentedControl
            options={FREQ_OPTIONS}
            value={nearestFreqOption(freqDays)}
            onChange={(v) => handleSetFreqDays(Number(v))}
          />
        )}

        {driveAccount && status !== 'foreign_blob' && (
          <View className="flex-row items-center justify-between gap-3">
            {/* Same tappable-caption treatment as This device's panel above — opens Drive's own
             *  History popup, a distinct list from This device's. */}
            <Pressable
              onPress={() => setHistoryTarget('google-drive')}
              accessibilityLabel="View Google Drive's backup history"
              className="flex-row items-center gap-1 flex-1"
            >
              <View className="flex-1">
                <Text className="text-[11px] text-tertiary">
                  {status === 'syncing'
                    ? STATUS_TEXT.syncing
                    : lastBackupAt
                      ? `Backed up · ${formatDateTime(lastBackupAt)}`
                      : 'Not backed up yet'}
                </Text>
                {autoBackupOn &&
                  status !== 'syncing' &&
                  (() => {
                    const next = nextBackupCaption(lastBackupAt, freqDays);
                    return next ? (
                      <Text
                        className="text-[10.5px] mt-0.5"
                        style={{ color: next.due ? theme.warning : theme.textTertiary }}
                      >
                        {next.text}
                      </Text>
                    ) : null;
                  })()}
              </View>
              <Icon name="ti-chevron-right" size={13} color={theme.textTertiary} />
            </Pressable>
            <Button variant="primary" color={DRIVE_BLUE} loading={status === 'syncing'} onPress={handleBackupNow}>
              Back up now
            </Button>
          </View>
        )}
      </View>
    );
  }

  return (
    <>
      <Card padding="lg" className="gap-4">
        <View className="flex-row items-start gap-3">
          <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: '#00a86b1a' }}>
            <Icon name="ti-refresh" size={20} color="#00a86b" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-primary">Automatic backup</Text>
            <Text className="text-xs mt-0.5 leading-relaxed text-tertiary">
              Back up to Google Drive or iCloud to restore on a new phone and sync across devices. On-device backups
              guard against accidental changes but are lost if you clear app data or lose the device.
            </Text>
          </View>
        </View>

        <View className="border border-theme rounded-2xl overflow-hidden">
          {ROWS.map((row, i) => {
            const isExpanded = expandedTarget === row.value;
            const isActive = choice === row.value;
            return (
              <View key={row.value}>
                <Pressable
                  onPress={() => handleRowPress(row.value)}
                  accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${row.label}`}
                  className={`flex-row items-center gap-2.5 px-3 py-2.5 ${i > 0 ? 'border-t border-theme' : ''}`}
                >
                  <IconBadge
                    icon={row.icon}
                    color={theme.textSecondary}
                    size="sm"
                    iconElement={
                      row.value === 'google-drive' ? (
                        <DriveLogo size={16} />
                      ) : row.value === 'icloud' ? (
                        <AppleLogo size={16} dark={activePalette === 'dark'} />
                      ) : undefined
                    }
                  />
                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-[13px] font-semibold text-primary">{row.label}</Text>
                      {isActive && (
                        <View
                          className="px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: tint(row.value === 'google-drive' ? DRIVE_BLUE : theme.primary, 12)
                          }}
                        >
                          <Text
                            className="text-[9px] font-bold"
                            style={{ color: row.value === 'google-drive' ? DRIVE_BLUE : theme.primary }}
                          >
                            Active
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-[10px] text-tertiary mt-0.5" numberOfLines={1}>
                      {rowCaption(row.value)}
                    </Text>
                  </View>
                  <Icon name={isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
                </Pressable>
                {isExpanded && (
                  <View className="px-3 pb-3">
                    {row.value === 'local' && renderLocalPanel()}
                    {row.value === 'google-drive' && renderDrivePanel()}
                    {row.value === 'icloud' && renderIcloudPanel()}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Text className="text-[11px]" style={{ color: theme.neutral }}>
          Backups are encrypted on this device — no one but you can read them.
        </Text>
      </Card>

      <ConfirmDialog
        isOpen={showOverwriteConfirm}
        onClose={() => setShowOverwriteConfirm(false)}
        onConfirm={() => void handleOverwriteConfirm()}
        title="Overwrite Drive backup?"
        message={
          "This device's data will replace whatever backup currently exists in Google Drive, going forward. The " +
          'backup already in Drive — encrypted with a different passphrase — will be permanently discarded and ' +
          'can\'t be recovered. If you want that old data instead, cancel and use "Restore with my passphrase."'
        }
        confirmLabel="Yes, overwrite Drive"
        confirmVariant="danger"
        loading={overwriting}
      />

      {historyTarget && (
        <BackupHistoryModal
          destination={historyTarget === 'local' ? 'local' : 'drive'}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </>
  );
}
