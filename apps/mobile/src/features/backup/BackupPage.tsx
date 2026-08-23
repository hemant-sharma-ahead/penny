import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, ScrollView, Text, Platform, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Card, TextInput, Button, ConfirmDialog, Banner, PennyLoader } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { importBackup, RestoreCancelledError } from '@/core/backup/backupManager';
import { googleDriveBackup, isCloudBackupConfigured } from '@/core/backup/cloudBackup';
import { wipeAllData } from '@/core/crypto/securityManager';
import { deregisterAccount, getClaimState } from '@/core/identity/claim';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';
import { setItem } from '~/lib/storage';
import { RECONCILE_FLAG } from '~/features/onboarding/AccountRecoveryScreen';
import { AutoBackupCard } from './AutoBackupCard';
import { DRIVE_BLUE } from '~/components/shared';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { tint } from '~/lib/color';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';

type ImportState = 'idle' | 'importing' | 'done' | 'error';
type CloudRestoreState = 'idle' | 'restoring' | 'done' | 'error';

/**
 * RN port of apps/web-react/src/features/backup/BackupPage.tsx. Only 3 cards now — Automatic backup,
 * Restore from backup, Reset Penny — after consolidating away the standalone Export backup and Back up
 * to Google Drive cards 2026-07-27 (they duplicated what AutoBackupCard's tabs already did; see
 * docs/DESIGN_GUIDELINES.md §1 "One capability, one control"). Restore keeps two sources: a picked
 * .penny file, or (once Drive is configured) the latest Drive backup directly.
 *
 * Platform notes:
 * - Import: web's `<input type=file>` + `file.text()` → `expo-document-picker` (works on web — its own
 *   `.web.js` build wraps a real `<input type=file>` and returns a genuine web `File` at
 *   `asset.file`, per its own types) read via that `File`'s native `.text()`, no `expo-file-system`
 *   involved (its web build is a no-op stub — `new File(uri)` throws there). True native reads the
 *   picked URI via `expo-file-system`'s `File.text()`, same pattern as `~/features/import/UploadStep.tsx`
 *   and onboarding's `AccountRecoveryScreen`.
 * - Post-import/-reset: web does a full page reload so its router's `AuthGuard` re-evaluates; RN has no
 *   equivalent, so both use `notifyAuthShouldRecheck()` instead (same precedent as `ChangePinPage`'s
 *   `'wiped'` case).
 */
export function BackupPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();

  // ── Import ──────────────────────────────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  const restoreCardRef = useRef<View>(null);
  // Bumped by `focusRestorePassphrase` below to force the passphrase `TextInput` to remount with
  // `autoFocus` — the shared `~/components/ui/TextInput` doesn't forward a ref (nothing else in the app
  // needs one), so this is the same "change `key`, let `autoFocus` do the work on the fresh mount"
  // approach rather than adding ref-forwarding to a primitive used everywhere else in the app.
  const [restoreFocusRequest, setRestoreFocusRequest] = useState(0);
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [importError, setImportError] = useState('');

  // Two-phase restore progress (Backup & Restore redesign — docs/mockups/proposals/
  // backup-restore-redesign-v1.html item 3). Phase 1 = parse/derive-key/decrypt, nothing written yet, a
  // real Cancel is meaningful; phase 2 = the atomic `restoreTables()` write itself, Cancel disappears.
  // Tracks `importBackup`'s real `onPhase2Start` callback, not a fixed delay. Shared by both restore
  // sources (file/Drive) since only one can run at a time (the button row that starts either is hidden
  // the moment either kicks off — see `restoring` below).
  const [restorePhase, setRestorePhase] = useState<1 | 2 | null>(null);
  const restoreAbortRef = useRef<AbortController | null>(null);

  function cancelRestore() {
    restoreAbortRef.current?.abort();
  }

  async function pickFile() {
    // RN Web: mixing a specific MIME type with the '*/*' wildcard confuses the browser's native file
    // dialog into greying out .penny files (they don't map to any registered MIME type) — found
    // 2026-07-27. web-react avoids this entirely with an extension-based accept (`.penny,application/
    // json`); DocumentPicker's `type` has no extension option, so '*/*' alone (no filter at all) is the
    // reliable fix on that platform specifically. True native's MIME-based filtering is unaffected.
    const result = await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'web' ? '*/*' : ['application/json', '*/*'],
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets?.[0]) return;
    setSelectedFile(result.assets[0]);
    setImportError('');
    setImportState('idle');
  }

  async function handleImport() {
    if (!selectedFile || !passphrase) return;
    setImportState('importing');
    setImportError('');
    setRestorePhase(1);
    const controller = new AbortController();
    restoreAbortRef.current = controller;
    try {
      // On RN Web, expo-document-picker's own web build hands back a real browser File at
      // `asset.file` (its `.text()` works natively) — expo-file-system's `File` class doesn't work on
      // web at all (its web build is a no-op stub), so this must not touch it on that platform.
      const text =
        Platform.OS === 'web' && selectedFile.file
          ? await selectedFile.file.text()
          : await new File(selectedFile.uri).text();
      await importBackup(text, passphrase, { signal: controller.signal, onPhase2Start: () => setRestorePhase(2) });
      setImportState('done');
      // Real-device testing feedback, 2026-08-21: the confirm dialog was never told to close on
      // success — `ConfirmDialog` has no auto-close of its own (it's fully controlled by `isOpen`,
      // confirmed by reading the component), so it just sat open indefinitely with its Confirm button
      // re-enabled (`loading` only tracks `importState === 'importing'`), with the "Restored —
      // relocking session…" banner visible behind it the whole time.
      setShowConfirm(false);
      // 2026-08-22, real-device testing feedback (Groups: "unknown or revoked device" after a restore
      // done from this screen): `AccountRecoveryScreen.tsx`'s onboarding restore already sets this flag
      // so `IdentityReconciler` re-registers the device with the server post-restore (a destructive
      // restore replaces `device_keys` locally, which can leave the server's device registry out of
      // sync) — this screen's restore never set it, so that reconciliation never ran for a
      // Settings-triggered restore. Set unconditionally on any successful restore, matching that
      // screen's own precedent.
      await setItem(RECONCILE_FLAG, '1');
      setTimeout(() => notifyAuthShouldRecheck(), 1200);
    } catch (err) {
      if (err instanceof RestoreCancelledError) {
        setImportState('idle');
      } else {
        setImportError(err instanceof Error ? err.message : 'Restore failed');
        setImportState('error');
      }
    } finally {
      setRestorePhase(null);
      restoreAbortRef.current = null;
    }
  }

  /** The AutoBackupCard's "belongs to another account" (`foreign_blob`) banner's CTA — jumps down to
   *  and focuses the passphrase field on the restore card below, since that's the one thing that
   *  actually resolves that state. Both cards already live on this same screen, so this is a same-page
   *  scroll+focus rather than a navigation — same `measureLayout` pattern `ExpenseForm.tsx`'s
   *  `focusPanel` already uses to scroll a child into view relative to a `ScrollView` ref. */
  function focusRestorePassphrase() {
    restoreCardRef.current?.measureLayout(
      scrollRef.current as unknown as View,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }),
      () => {}
    );
    setRestoreFocusRequest((n) => n + 1);
  }

  // ── Restore from Google Drive (alongside file-restore above) ─────────────────
  const cloudEnabled = isCloudBackupConfigured() && hasEntitlement('cloud_backup');
  const [cloudRestoreState, setCloudRestoreState] = useState<CloudRestoreState>('idle');
  const [cloudError, setCloudError] = useState('');

  // Navigation lock while a restore (either source) is in flight (2026-08-21, real-device testing
  // feedback: nothing stopped a user from backgrounding the app or leaving mid-restore — CLAUDE.md's
  // own reliability rule on this exact class of screen). Header back-chevron hidden via
  // `chromeLocked`; Android's hardware back is a separate OS-level event `useRegisterHeaderScreen`
  // doesn't cover, so it gets its own `BackHandler` listener, same pattern as `ChangePinPage.tsx`'s
  // forced-reset lock. Both `importState`/`cloudRestoreState` are guaranteed to land back on `'done'`
  // or `'error'` (never stuck on the in-flight value) by the try/catch already wrapping every restore
  // path above, so this lock always releases on its own.
  const restoring = importState === 'importing' || cloudRestoreState === 'restoring';
  const navigation = useNavigation();
  useRegisterHeaderScreen(
    'Backup',
    useCallback(() => navigation.goBack(), [navigation]),
    restoring
  );
  useEffect(() => {
    if (!restoring) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [restoring]);

  async function handleCloudRestore() {
    if (!passphrase) {
      setCloudError('Enter your passphrase above first.');
      setCloudRestoreState('error');
      return;
    }
    setCloudRestoreState('restoring');
    setCloudError('');
    setRestorePhase(1);
    const controller = new AbortController();
    restoreAbortRef.current = controller;
    try {
      const text = await googleDriveBackup.fetchLatest();
      if (!text) {
        setCloudError('No Penny backup found in your Drive.');
        setCloudRestoreState('error');
        return;
      }
      await importBackup(text, passphrase, { signal: controller.signal, onPhase2Start: () => setRestorePhase(2) });
      // Real-device testing feedback, 2026-08-21: this success path called `notifyAuthShouldRecheck()`
      // and just... returned, never resetting `cloudRestoreState` away from `'restoring'` — unlike
      // `handleImport` (file restore) right above, which does set a `'done'` state. The button's
      // `loading={cloudRestoreState === 'restoring'}` therefore never cleared, spinning forever even
      // though the restore itself had already succeeded — confirmed via the row-counts/post-write
      // diagnostics above, which showed correct data on every attempt the user made, despite the button
      // never reflecting that.
      setCloudRestoreState('done');
      // Code-review finding, 2026-08-21: `handleImport` (file restore) delays this by 1200ms
      // specifically so the "Restored — relocking session…" banner is visible for a beat before the
      // screen relocks — this path called it synchronously instead, an incomplete port of that same
      // fix that would relock before the user ever saw the confirmation.
      // See `handleImport`'s matching comment, 2026-08-22, on why this flag is set here too.
      await setItem(RECONCILE_FLAG, '1');
      setTimeout(() => notifyAuthShouldRecheck(), 1200);
    } catch (err) {
      if (err instanceof RestoreCancelledError) {
        setCloudRestoreState('idle');
      } else {
        setCloudError(err instanceof Error ? err.message : 'Restore failed');
        setCloudRestoreState('error');
      }
    } finally {
      setRestorePhase(null);
      restoreAbortRef.current = null;
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
      <ScrollView ref={scrollRef}>
        <View className="px-4 pt-4 pb-6 gap-5">
          {restoring && (
            <Banner variant="warning" icon="ti-loader-2" title="Restoring — don't close the app">
              This can take a little while on a large history. Leaving or closing the app now could interrupt it.
            </Banner>
          )}

          <AutoBackupCard onFixForeignBlob={focusRestorePassphrase} />

          {/* Plain `View` wrapper (not a ref on `Card` itself) so `focusRestorePassphrase`'s
           *  `measureLayout` can target it — same precedent as `ExpenseForm.tsx`'s panel refs, which
           *  wrap a raw `View` rather than adding ref-forwarding to a shared primitive. */}
          <View ref={restoreCardRef}>
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
                    Replaces everything on this device — back up first if you're unsure.
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
                  <Text className="text-sm" style={{ color: selectedFile ? theme.textPrimary : theme.textTertiary }}>
                    {selectedFile?.name ?? 'Choose .penny file…'}
                  </Text>
                </Pressable>
              </View>

              <TextInput
                key={`restore-passphrase-${restoreFocusRequest}`}
                autoFocus={restoreFocusRequest > 0}
                label="Passphrase"
                secureTextEntry
                value={passphrase}
                onChange={setPassphrase}
                placeholder="Your original passphrase"
              />

              {importState === 'done' || cloudRestoreState === 'done' ? (
                <View
                  className="flex-row items-center gap-2 rounded-xl px-3 py-2"
                  style={{ backgroundColor: tint(theme.success, 10) }}
                >
                  <Icon name="ti-circle-check" size={16} color={theme.success} />
                  <Text className="text-xs font-medium" style={{ color: theme.success }}>
                    Restored — relocking session…
                  </Text>
                </View>
              ) : null}
              {importState === 'error' ? (
                <Text className="text-xs" style={{ color: theme.danger }}>
                  {importError}
                </Text>
              ) : null}
              {cloudRestoreState === 'error' ? (
                <Text className="text-xs" style={{ color: theme.danger }}>
                  {cloudError}
                </Text>
              ) : null}

              {/* Prominent-but-compact warning strip, right before the restore buttons (last thing seen
               *  before committing) — previously buried as a small tertiary caption inside the 3-sentence
               *  copy above. Same one strip regardless of source (file vs. Drive): the PIN that unlocks
               *  after restore is whatever was active on the device *when the backup was made*, which can
               *  differ from this device's PIN today (e.g. after a PIN change since that backup). */}
              <View
                className="flex-row items-start gap-2 rounded-xl px-3 py-2.5 border"
                style={{ backgroundColor: tint(theme.warning, 12), borderColor: tint(theme.warning, 35) }}
              >
                <Icon name="ti-key" size={14} color={theme.warning} />
                <Text className="text-[11px] flex-1 leading-relaxed" style={{ color: theme.textPrimary }}>
                  Use the PIN{' '}
                  <Text style={{ fontWeight: '700', color: theme.warning }}>
                    active on this device when this backup was made
                  </Text>{' '}
                  — not necessarily today's PIN.
                </Text>
              </View>

              {restoring ? (
                // Two-phase progress (item 3) — mapped to importBackup's real onPhase2Start callback, not
                // a fixed delay. Phase 1 (parse/derive-key/decrypt): nothing's written yet, Cancel is real
                // and wired to an AbortController importBackup actually checks. Phase 2 (restoreTables'
                // atomic bulk write): Cancel disappears — cancelling mid-write would be unsafe — and the
                // copy shifts to "don't close the app" (same framing the banner above already uses).
                <View className="gap-3">
                  <View className="flex-row items-center gap-2.5">
                    {restorePhase === 1 ? (
                      <PennyLoader size="sm" />
                    ) : (
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{ backgroundColor: tint(theme.success, 14) }}
                      >
                        <Icon name="ti-check" size={12} color={theme.success} />
                      </View>
                    )}
                    <Text
                      className="text-xs font-medium flex-1"
                      style={{ color: restorePhase === 1 ? theme.textPrimary : theme.textSecondary }}
                    >
                      Preparing your backup…
                    </Text>
                  </View>
                  <View style={{ width: 1.5, height: 14, marginLeft: 9, backgroundColor: theme.border }} />
                  <View className="flex-row items-center gap-2.5">
                    {restorePhase === 2 ? (
                      <PennyLoader size="sm" />
                    ) : (
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center border"
                        style={{ borderColor: theme.border }}
                      >
                        <Text className="text-[10px] font-bold" style={{ color: theme.textTertiary }}>
                          2
                        </Text>
                      </View>
                    )}
                    <Text
                      className="text-xs font-medium flex-1"
                      style={{ color: restorePhase === 2 ? theme.textPrimary : theme.textTertiary }}
                    >
                      Applying to your data
                    </Text>
                  </View>
                  <Text className="text-[11px] leading-relaxed" style={{ color: theme.textSecondary }}>
                    {restorePhase === 2 ? (
                      <>
                        <Text style={{ fontWeight: '700', color: theme.textPrimary }}>Writing to your device now</Text>{' '}
                        — please don't close the app.
                      </>
                    ) : (
                      "Nothing's been changed yet."
                    )}
                  </Text>
                  {restorePhase === 1 && (
                    <Pressable onPress={cancelRestore} accessibilityLabel="Cancel restore" hitSlop={8}>
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: theme.textSecondary, textDecorationLine: 'underline' }}
                      >
                        Cancel
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <>
                  <View className="flex-row gap-3">
                    <Button
                      variant="primary"
                      className="flex-1"
                      onPress={() => setShowConfirm(true)}
                      disabled={!selectedFile || !passphrase || importState === 'done'}
                    >
                      Restore from file
                    </Button>
                    {cloudEnabled && (
                      <Button
                        variant="primary"
                        color={DRIVE_BLUE}
                        className="flex-1"
                        onPress={() => void handleCloudRestore()}
                        disabled={!passphrase || cloudRestoreState === 'done'}
                      >
                        Restore from Drive
                      </Button>
                    )}
                  </View>
                  {/* Both buttons above are disabled purely on `!passphrase` with no other reason —
                   *  without this, they look broken/permanently disabled rather than "waiting on the
                   *  field above" (real-device testing feedback, 2026-08-18). */}
                  {!passphrase && (
                    <Text className="text-xs text-tertiary text-center">Enter your passphrase above first</Text>
                  )}
                </>
              )}
            </Card>
          </View>

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
        // Closes immediately rather than waiting for handleImport to resolve (which used to only set
        // `showConfirm(false)` on success) — otherwise this modal's own backdrop sits on top of the
        // Restore card for the whole restore, hiding the two-phase progress panel/Cancel underneath it
        // the entire time it matters most. handleImport's own `setShowConfirm(false)` on success is now
        // just a harmless no-op guard, not the only path that closes this.
        onConfirm={() => {
          setShowConfirm(false);
          void handleImport();
        }}
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
