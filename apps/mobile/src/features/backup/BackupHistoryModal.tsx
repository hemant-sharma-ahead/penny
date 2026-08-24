import { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Badge, Button, ConfirmDialog, EmptyState, IconBadge, Modal, PennyLoader } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { useToast } from '~/context/ToastContext';
import { tint } from '~/lib/color';
import {
  deleteLocalSnapshot,
  getConnectedGoogleAccount,
  getProvider,
  listLocalSnapshots,
  readLocalSnapshot,
  type BackupEntry
} from '@/core/sync/providers';
import { formatDateTime } from '@/lib/date';
import { formatBytes } from '@/lib/formatters';
import { shareBackupFile } from './shareBackupFile';

type Destination = 'local' | 'drive';

interface Props {
  destination: Destination;
  onClose: () => void;
}

/**
 * Backup History (docs/mockups/proposals/backup-history-v1.html) — one shared modal, opened from
 * either `AutoBackupCard.tsx` panel's now-tappable "Last backup: <date>" caption via a `destination`
 * prop, per the mockup's own "two separate popups, one shared component" decision (local and Drive are
 * genuinely different storage models underneath — no network/auth for local, a real remote call for
 * Drive — so this is one shared *control*, not a false single-IA over two different things).
 *
 * `Modal`-shaped exactly like `ConfirmDialog`/every other popup on this screen (centred card, title + ×
 * top-right, scrollable body) — no new modal primitive. Each row shows its Download/Delete actions as
 * always-visible icon buttons (the same `variant="ghost"` small-square `Button` convention
 * `AccountList.tsx`'s revealed action row already uses), not a hidden swipe gesture — a deliberate,
 * one-off departure from `TransactionsTab.tsx`'s swipe-to-reveal rows: this is a rarely-opened history
 * list, not the main transaction feed, so favoring discoverability over the swipe convention's density
 * win is the right trade here (found via real-device testing, 2026-08-24). Delete goes through the
 * existing `ConfirmDialog` pattern, stacked above this modal the same way `AutoBackupCard.tsx`'s own
 * overwrite-confirm already stacks above its parent screen (RN `Modal`s stack in mount order, no
 * `level` prop needed).
 */
export function BackupHistoryModal({ destination, onClose }: Props) {
  const theme = useThemeColors();
  const { showToast } = useToast();

  // null = still loading (first fetch); [] once loaded and genuinely empty.
  const [entries, setEntries] = useState<BackupEntry[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BackupEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Cheap synchronous read of the already-signed-in account (real on native; null on web/RN Web) — the
  // "synced from Google Drive" chip is purely informational, not something this modal connects/reconnects.
  const driveAccount = destination === 'drive' ? getConnectedGoogleAccount() : null;

  const load = useCallback(async () => {
    try {
      const list =
        destination === 'local' ? await listLocalSnapshots() : ((await getProvider('google-drive').list?.()) ?? []);
      setEntries([...list].sort((a, b) => b.timestamp - a.timestamp));
    } catch (err) {
      setEntries([]);
      showToast({ message: err instanceof Error ? err.message : 'Could not load backup history' });
    }
  }, [destination, showToast]);

  useEffect(() => {
    // setState (inside `load`) wrapped in a same-tick timeout rather than called directly in the
    // effect body — the react-hooks/set-state-in-effect fix `useLivePrice.ts` already documents/
    // uses elsewhere in this feature.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function handleDownload(entry: BackupEntry) {
    setDownloadingId(entry.id);
    try {
      const text =
        destination === 'local'
          ? await readLocalSnapshot(entry.id)
          : ((await getProvider('google-drive').downloadEntry?.(entry.id)) ?? null);
      if (!text) throw new Error('This backup is no longer available.');
      const dateKey = new Date(entry.timestamp).toISOString().slice(0, 10);
      await shareBackupFile(text, `penny-backup-${dateKey}.penny`);
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Download failed' });
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeleting(true);
    try {
      if (destination === 'local') await deleteLocalSnapshot(target.id);
      else await getProvider('google-drive').delete?.(target.id);
      setEntries((prev) => (prev ?? []).filter((e) => e.id !== target.id));
      setPendingDelete(null);
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Delete failed' });
    } finally {
      setDeleting(false);
    }
  }

  const destinationLabel = destination === 'local' ? 'This device' : 'Google Drive';

  return (
    <>
      <Modal onClose={onClose} title={`Backup history · ${destinationLabel}`} scrollable size="md">
        <View className="gap-2.5">
          {destination === 'drive' && driveAccount && (
            <View className="flex-row items-center gap-2 rounded-xl px-2.5 py-2 bg-surface-2">
              <View
                className="w-[18px] h-[18px] rounded-full items-center justify-center"
                style={{ backgroundColor: theme.primary }}
              >
                <Text className="text-[8px] font-bold text-white">
                  {(driveAccount.name ?? driveAccount.email).charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text className="text-[11px] text-secondary flex-1" numberOfLines={1}>
                <Text className="font-semibold text-primary">{driveAccount.email}</Text> · synced from Google Drive
              </Text>
            </View>
          )}

          {entries === null ? (
            <View className="py-10 items-center">
              <PennyLoader size="sm" />
            </View>
          ) : entries.length === 0 ? (
            <EmptyState
              icon="ti-history"
              title="No backups yet"
              description={`Once you back up ${destinationLabel} for the first time, every backup will show up here — up to your last 20.`}
            />
          ) : (
            <>
              <Text className="text-[10px] text-tertiary px-0.5">Showing your most recent backups (up to 20 kept)</Text>
              <View>
                {entries.map((entry, i) => (
                  <View
                    key={entry.id}
                    className={`flex-row items-center gap-2.5 px-0.5 py-2.5 ${i > 0 ? 'border-t border-theme' : ''}`}
                  >
                    <IconBadge icon="ti-calendar" color={theme.primary} size="sm" />
                    <View className="flex-1 min-w-0">
                      <Text className="text-xs font-semibold text-primary">{formatDateTime(entry.timestamp)}</Text>
                      <View className="flex-row items-center gap-1.5 mt-0.5">
                        <Text className="text-[10px] text-tertiary">{formatBytes(entry.sizeBytes)}</Text>
                        <Badge
                          label={entry.trigger === 'auto' ? 'Auto' : 'Manual'}
                          color={entry.trigger === 'auto' ? theme.info : theme.primary}
                          size="sm"
                        />
                      </View>
                    </View>
                    {downloadingId === entry.id ? (
                      <PennyLoader size="sm" />
                    ) : (
                      <Button
                        variant="ghost"
                        icon="ti-download"
                        accessibilityLabel="Download this backup"
                        className="w-6 h-6 rounded-md"
                        color={tint(theme.info, 14)}
                        textColor={theme.info}
                        onPress={() => void handleDownload(entry)}
                      />
                    )}
                    <Button
                      variant="ghost"
                      icon="ti-trash"
                      accessibilityLabel="Delete this backup"
                      className="w-6 h-6 rounded-md"
                      color={tint(theme.danger, 14)}
                      textColor={theme.danger}
                      onPress={() => setPendingDelete(entry)}
                    />
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </Modal>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
        title="Delete this backup?"
        message={`This backup will be permanently deleted ${
          destination === 'local' ? 'from this device' : 'from Google Drive'
        }. This can't be undone — your other backups are unaffected.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
      />
    </>
  );
}
