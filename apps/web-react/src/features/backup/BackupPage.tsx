import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importBackup } from '@/core/backup/backupManager';
import { googleDriveBackup, isCloudBackupConfigured } from '@/core/backup/cloudBackup';
import { wipeAllData } from '@/core/crypto/securityManager';
import { deregisterAccount, getClaimState } from '@/core/identity/claim';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { Card, TextInput, Button, ConfirmDialog, PageHeader } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
import { AutoBackupCard } from './AutoBackupCard';

type ImportState = 'idle' | 'importing' | 'done' | 'error';
type CloudRestoreState = 'idle' | 'restoring' | 'error';

/**
 * Only 3 cards now — Automatic backup, Restore from backup, Reset Penny — after consolidating away the
 * standalone Export backup and Back up to Google Drive cards 2026-07-27 (they duplicated what
 * AutoBackupCard's tabs already did; see docs/DESIGN_GUIDELINES.md §1 "One capability, one control").
 * Restore keeps two sources: a picked .penny file, or (once Drive is configured) the latest Drive
 * backup directly.
 */
export function BackupPage() {
  const navigate = useNavigate();

  // ── Import ──────────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [importError, setImportError] = useState('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null);
    setImportError('');
    setImportState('idle');
  }

  async function handleImport() {
    if (!selectedFile || !passphrase) return;
    setImportState('importing');
    setImportError('');
    try {
      const text = await selectedFile.text();
      await importBackup(text, passphrase);
      setImportState('done');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Restore failed');
      setImportState('error');
    }
  }

  // ── Restore from Google Drive (alongside file-restore above) ─────────────────
  const cloudEnabled = isCloudBackupConfigured() && hasEntitlement('cloud_backup');
  const [cloudRestoreState, setCloudRestoreState] = useState<CloudRestoreState>('idle');
  const [cloudError, setCloudError] = useState('');

  async function handleCloudRestore() {
    if (!passphrase) {
      setCloudError('Enter your passphrase above first.');
      setCloudRestoreState('error');
      return;
    }
    setCloudRestoreState('restoring');
    setCloudError('');
    try {
      const text = await googleDriveBackup.fetchLatest();
      if (!text) {
        setCloudError('No Penny backup found in your Drive.');
        setCloudRestoreState('error');
        return;
      }
      await importBackup(text, passphrase);
      window.location.reload();
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Restore failed');
      setCloudRestoreState('error');
    }
  }

  // ── Full reset ────────────────────────────────────────────────────────────────
  const [showReset, setShowReset] = useState(false);
  // Set when deregister fails for a claimed account — we warn before wiping so the user can retry online
  // instead of silently orphaning their username (Track F, F2a).
  const [orphanWarnUser, setOrphanWarnUser] = useState<string | null>(null);

  async function performWipe() {
    setOrphanWarnUser(null);
    await wipeAllData();
    window.location.href = '/'; // → router redirects to onboarding
  }

  async function handleReset() {
    setShowReset(false);
    // Nothing to release if this device never claimed an account — wipe straight away.
    const claim = await getClaimState();
    if (!claim.claimed) {
      await performWipe();
      return;
    }
    // Deregister from the server first (while we still hold the keys) so the username is released and no
    // orphaned record is left behind. If it fails (offline / server error), DON'T silently wipe — warn,
    // because after the wipe the username stays reserved to a dead account and can't be reclaimed here.
    try {
      await deregisterAccount();
      await performWipe();
    } catch {
      setOrphanWarnUser(claim.username ?? '');
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Backup & Restore"
        leading={
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Back"
            className="w-8 h-8 rounded-lg hover:text-primary"
            onClick={() => navigate(-1)}
          />
        }
      />
      <div className="px-4 pt-4 pb-6 flex flex-col gap-5">
        {/* Automatic backup + sync (Track D) — the one place This device / Drive / iCloud backup lives */}
        <AutoBackupCard />

        {/* Restore card */}
        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning-subtle flex items-center justify-center flex-shrink-0">
              <i className="ti ti-cloud-upload" style={{ fontSize: 20, color: STATUS.warning }} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Restore from backup</p>
              <p className="text-xs mt-0.5 leading-relaxed text-tertiary">
                Select a <span className="font-medium">.penny</span> file
                {cloudEnabled ? ', or restore straight from Google Drive,' : ''} and enter your passphrase. Your current
                data will be replaced. Afterward, unlock with the PIN that was active when this backup was created — not
                necessarily this device's current one.
              </p>
            </div>
          </div>

          {/* File picker */}
          <div>
            <label className="text-xs font-medium text-secondary">Backup file</label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1.5 w-full rounded-xl border border-theme bg-surface-2 px-3 py-2.5 text-sm text-left flex items-center gap-2"
            >
              <i className="ti ti-file text-tertiary" style={{ fontSize: 16 }} aria-hidden="true" />
              <span style={{ color: selectedFile ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                {selectedFile ? selectedFile.name : 'Choose .penny file…'}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".penny,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <TextInput
            label="Passphrase"
            type="password"
            value={passphrase}
            onChange={setPassphrase}
            placeholder="Your original passphrase"
          />

          {importState === 'done' && (
            <div className="flex items-center gap-2 text-success bg-success-subtle rounded-xl px-3 py-2">
              <i className="ti ti-circle-check" style={{ fontSize: 16 }} aria-hidden="true" />
              <p className="text-xs font-medium">Restored — relocking session…</p>
            </div>
          )}
          {importState === 'error' && <p className="text-xs text-danger">{importError}</p>}
          {cloudRestoreState === 'error' && <p className="text-xs text-danger">{cloudError}</p>}

          <Button
            variant="primary"
            fullWidth
            onClick={() => setShowConfirm(true)}
            disabled={!selectedFile || !passphrase || importState === 'importing' || importState === 'done'}
            loading={importState === 'importing'}
          >
            {importState === 'importing' ? 'Restoring…' : 'Restore backup'}
          </Button>

          {cloudEnabled && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => void handleCloudRestore()}
              disabled={!passphrase}
              loading={cloudRestoreState === 'restoring'}
            >
              Restore from Google Drive
            </Button>
          )}
        </Card>

        {/* Danger zone — full reset */}
        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-danger-subtle flex items-center justify-center flex-shrink-0">
              <i className="ti ti-alert-triangle text-danger" style={{ fontSize: 20 }} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Reset Penny</p>
              <p className="text-xs mt-0.5 leading-relaxed text-tertiary">
                Erases everything on this device and returns to onboarding. There is no recovery unless you have a
                backup.
              </p>
            </div>
          </div>
          <Button variant="danger" fullWidth onClick={() => setShowReset(true)}>
            Erase all data
          </Button>
        </Card>

        <ConfirmDialog
          isOpen={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => void handleImport()}
          title="Replace all data?"
          message="All current data — expenses, goals, portfolio, and settings — will be permanently replaced with the contents of the backup file. This cannot be undone."
          confirmLabel="Yes, restore"
          confirmVariant="danger"
          loading={importState === 'importing'}
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
      </div>
    </div>
  );
}
