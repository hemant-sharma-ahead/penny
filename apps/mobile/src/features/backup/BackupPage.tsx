import { useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Card, TextInput, Button, ConfirmDialog, PageHeader } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { exportBackup, importBackup } from '@/core/backup/backupManager';
import { googleDriveBackup, isCloudBackupConfigured } from '@/core/backup/cloudBackup';
import { wipeAllData } from '@/core/crypto/securityManager';
import { deregisterAccount, getClaimState } from '@/core/identity/claim';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { AutoBackupCard } from './AutoBackupCard';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { tint } from '~/lib/color';

type ExportState = 'idle' | 'exporting' | 'done' | 'error';
type ImportState = 'idle' | 'importing' | 'done' | 'error';
type CloudState = 'idle' | 'uploading' | 'uploaded' | 'restoring' | 'error';

/**
 * RN port of apps/web-react/src/features/backup/BackupPage.tsx. Platform notes:
 * - Export: web builds an object-URL `<a download>`; RN writes `exportBackup()`'s blob text to
 *   `expo-file-system`'s cache dir and hands it to `expo-sharing`'s native share sheet (same pattern as
 *   `core/export/exportCsv.native.ts`). RN's own `Blob` class has no `.text()` method at all (confirmed
 *   by reading its source — the same gap Loans' XLSX export hit with `.arrayBuffer()`), so this reads it
 *   via `new Response(blob).text()` instead — `whatwg-fetch`'s `Response` (already global via RN's own
 *   `fetch` polyfill) implements `.text()` over any `Blob` body. `exportBackup()` itself needed no native
 *   variant.
 * - Import: web's `<input type=file>` + `file.text()` → `expo-document-picker` + `expo-file-system`'s
 *   `File.text()`, same pattern as `~/features/import/UploadStep.tsx` and onboarding's
 *   `AccountRecoveryScreen`.
 * - Post-import/-reset: web does a full page reload so its router's `AuthGuard` re-evaluates; RN has no
 *   equivalent, so both use `notifyAuthShouldRecheck()` instead (same precedent as `ChangePinPage`'s
 *   `'wiped'` case).
 * - Cloud backup card reuses `googleDriveBackup`/`isCloudBackupConfigured`, which are `false`/
 *   unreachable on mobile until native Google Sign-In is wired up — degrades to the same "not configured"
 *   fallback message web already shows when its own client ID is unset, so no behavior needed to change.
 */
export function BackupPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();

  // ── Export ──────────────────────────────────────────────────────────────────
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportError, setExportError] = useState('');

  async function handleExport() {
    setExportState('exporting');
    setExportError('');
    try {
      const blob = await exportBackup();
      const text = await new Response(blob).text();
      const date = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `penny-backup-${date}.penny`);
      file.write(text);
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
      setExportState('done');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
      setExportState('error');
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [importError, setImportError] = useState('');

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', '*/*'],
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets?.[0]) return;
    setSelectedFileUri(result.assets[0].uri);
    setSelectedFileName(result.assets[0].name);
    setImportError('');
    setImportState('idle');
  }

  async function handleImport() {
    if (!selectedFileUri || !passphrase) return;
    setImportState('importing');
    setImportError('');
    try {
      const text = await new File(selectedFileUri).text();
      await importBackup(text, passphrase);
      setImportState('done');
      setTimeout(() => notifyAuthShouldRecheck(), 1200);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Restore failed');
      setImportState('error');
    }
  }

  // ── Cloud backup (Google Drive) ───────────────────────────────────────────────
  const cloudEnabled = isCloudBackupConfigured() && hasEntitlement('cloud_backup');
  const [cloudState, setCloudState] = useState<CloudState>('idle');
  const [cloudError, setCloudError] = useState('');

  async function handleCloudBackup() {
    setCloudState('uploading');
    setCloudError('');
    try {
      await googleDriveBackup.upload(await exportBackup());
      setCloudState('uploaded');
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Backup failed');
      setCloudState('error');
    }
  }

  async function handleCloudRestore() {
    if (!passphrase) {
      setCloudError('Enter your passphrase above first.');
      setCloudState('error');
      return;
    }
    setCloudState('restoring');
    setCloudError('');
    try {
      const text = await googleDriveBackup.fetchLatest();
      if (!text) {
        setCloudError('No Penny backup found in your Drive.');
        setCloudState('error');
        return;
      }
      await importBackup(text, passphrase);
      notifyAuthShouldRecheck();
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Restore failed');
      setCloudState('error');
    }
  }

  // ── Full reset ────────────────────────────────────────────────────────────────
  const [showReset, setShowReset] = useState(false);
  const [orphanWarnUser, setOrphanWarnUser] = useState<string | null>(null);

  async function performWipe() {
    setOrphanWarnUser(null);
    await wipeAllData();
    notifyAuthShouldRecheck();
  }

  async function handleReset() {
    setShowReset(false);
    const claim = await getClaimState();
    if (!claim.claimed) {
      await performWipe();
      return;
    }
    try {
      await deregisterAccount();
      await performWipe();
    } catch {
      setOrphanWarnUser(claim.username ?? '');
    }
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader title="Backup & Restore" leading={<BackButton />} />
      <ScrollView>
        <View className="px-4 pt-4 pb-6 gap-5">
          <AutoBackupCard />

          <Card padding="lg" className="gap-4">
            <View className="flex-row items-start gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: '#00a86b1a' }}
              >
                <Icon name="ti-cloud-download" size={20} color="#00a86b" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary">Export backup</Text>
                <Text className="text-xs mt-0.5 leading-relaxed text-tertiary">
                  Shares a .penny file encrypted with your passphrase. Store it somewhere safe.
                </Text>
              </View>
            </View>

            {exportState === 'done' && (
              <View
                className="flex-row items-center gap-2 rounded-xl px-3 py-2"
                style={{ backgroundColor: tint(theme.success, 10) }}
              >
                <Icon name="ti-circle-check" size={16} color={theme.success} />
                <Text className="text-xs font-medium" style={{ color: theme.success }}>
                  Backup shared successfully
                </Text>
              </View>
            )}
            {exportState === 'error' ? (
              <Text className="text-xs" style={{ color: theme.danger }}>
                {exportError}
              </Text>
            ) : null}

            <Button
              variant="primary"
              fullWidth
              onPress={() => void handleExport()}
              loading={exportState === 'exporting'}
            >
              {exportState === 'exporting' ? 'Preparing backup…' : 'Share backup'}
            </Button>
          </Card>

          <Card padding="lg" className="gap-4">
            <View className="flex-row items-start gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: tint(theme.warning, 10) }}
              >
                <Icon name="ti-cloud-upload" size={20} color={theme.warning} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary">Restore from backup</Text>
                <Text className="text-xs mt-0.5 leading-relaxed text-tertiary">
                  Select a .penny file and enter your passphrase to restore. Your current data will be replaced.
                </Text>
              </View>
            </View>

            <View>
              <Text className="text-xs font-medium text-secondary">Backup file</Text>
              <Pressable
                onPress={() => void pickFile()}
                className="mt-1.5 w-full rounded-xl border border-theme bg-surface-2 px-3 py-2.5 flex-row items-center gap-2"
              >
                <Icon name="ti-file" size={16} color={theme.textTertiary} />
                <Text className="text-sm" style={{ color: selectedFileName ? theme.textPrimary : theme.textTertiary }}>
                  {selectedFileName ?? 'Choose .penny file…'}
                </Text>
              </Pressable>
            </View>

            <TextInput
              label="Passphrase"
              secureTextEntry
              value={passphrase}
              onChange={setPassphrase}
              placeholder="Your original passphrase"
            />

            {importState === 'done' && (
              <View
                className="flex-row items-center gap-2 rounded-xl px-3 py-2"
                style={{ backgroundColor: tint(theme.success, 10) }}
              >
                <Icon name="ti-circle-check" size={16} color={theme.success} />
                <Text className="text-xs font-medium" style={{ color: theme.success }}>
                  Restored — relocking session…
                </Text>
              </View>
            )}
            {importState === 'error' ? (
              <Text className="text-xs" style={{ color: theme.danger }}>
                {importError}
              </Text>
            ) : null}

            <Button
              variant="primary"
              fullWidth
              onPress={() => setShowConfirm(true)}
              disabled={!selectedFileUri || !passphrase || importState === 'importing' || importState === 'done'}
              loading={importState === 'importing'}
            >
              {importState === 'importing' ? 'Restoring…' : 'Restore backup'}
            </Button>
          </Card>

          <Card padding="lg" className="gap-4">
            <View className="flex-row items-start gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: tint(theme.info, 10) }}
              >
                <Icon name="ti-brand-google-drive" size={20} color={theme.info} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary">Back up to Google Drive</Text>
                <Text className="text-xs mt-0.5 leading-relaxed text-tertiary">
                  Stores the same encrypted .penny file in your own Google Drive — neither Google nor we can read it.
                </Text>
              </View>
            </View>

            {cloudEnabled ? (
              <>
                {cloudState === 'uploaded' && (
                  <View
                    className="flex-row items-center gap-2 rounded-xl px-3 py-2"
                    style={{ backgroundColor: tint(theme.success, 10) }}
                  >
                    <Icon name="ti-circle-check" size={16} color={theme.success} />
                    <Text className="text-xs font-medium" style={{ color: theme.success }}>
                      Backed up to your Google Drive
                    </Text>
                  </View>
                )}
                {cloudState === 'error' ? (
                  <Text className="text-xs" style={{ color: theme.danger }}>
                    {cloudError}
                  </Text>
                ) : null}
                <View className="flex-row gap-3">
                  <Button
                    variant="primary"
                    className="flex-1"
                    loading={cloudState === 'uploading'}
                    onPress={() => void handleCloudBackup()}
                  >
                    Back up now
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    loading={cloudState === 'restoring'}
                    onPress={() => void handleCloudRestore()}
                  >
                    Restore
                  </Button>
                </View>
                <Text className="text-[11px] text-tertiary">Restore uses the passphrase entered above.</Text>
              </>
            ) : (
              <View className="flex-row items-start gap-2 bg-surface-2 rounded-xl px-3 py-2.5">
                <Icon name="ti-info-circle" size={15} color={theme.textTertiary} />
                <Text className="text-xs text-tertiary leading-relaxed flex-1">
                  Google Drive backup activates once native Google Sign-In is configured. Until then, use the encrypted
                  file export above.
                </Text>
              </View>
            )}
          </Card>

          <Card padding="lg" className="gap-4">
            <View className="flex-row items-start gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: tint(theme.danger, 10) }}
              >
                <Icon name="ti-alert-triangle" size={20} color={theme.danger} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary">Reset Penny</Text>
                <Text className="text-xs mt-0.5 leading-relaxed text-tertiary">
                  Erases everything on this device and returns to onboarding. There is no recovery unless you have a
                  backup.
                </Text>
              </View>
            </View>
            <Button variant="danger" fullWidth onPress={() => setShowReset(true)}>
              Erase all data
            </Button>
          </Card>
        </View>
      </ScrollView>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => void handleImport()}
        title="Replace all data?"
        message="All current data — expenses, goals, portfolio, and settings — will be permanently replaced with the contents of the backup file. This cannot be undone."
        confirmLabel="Yes, restore"
        confirmVariant="danger"
      />

      <ConfirmDialog
        isOpen={showReset}
        onClose={() => setShowReset(false)}
        onConfirm={() => void handleReset()}
        title="Erase everything?"
        message="All data on this device — expenses, goals, portfolio, settings, and your encryption keys — will be permanently deleted and you'll return to onboarding. This cannot be undone."
        confirmLabel="Erase all data"
        confirmVariant="danger"
      />

      <ConfirmDialog
        isOpen={orphanWarnUser !== null}
        onClose={() => setOrphanWarnUser(null)}
        onConfirm={() => void performWipe()}
        title="Couldn't release your username"
        message={`We couldn't reach the server to free ${
          orphanWarnUser ? `@${orphanWarnUser}` : 'your username'
        }. If you erase now, it may stay reserved to this account and can't be reclaimed later without restoring a backup. Try again when you're online, or erase anyway.`}
        confirmLabel="Erase anyway"
        confirmVariant="danger"
      />
    </SafeAreaView>
  );
}
