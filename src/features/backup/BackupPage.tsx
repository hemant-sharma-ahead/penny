import { useRef, useState } from 'react';
import { exportBackup, importBackup } from '@/core/backup/backupManager';
import { googleDriveBackup, isCloudBackupConfigured } from '@/core/backup/cloudBackup';
import { wipeAllData } from '@/core/crypto/securityManager';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { Card, TextInput, Button, ConfirmDialog } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
import { AutoBackupCard } from './AutoBackupCard';

type ExportState = 'idle' | 'exporting' | 'done' | 'error';
type ImportState = 'idle' | 'importing' | 'done' | 'error';
type CloudState = 'idle' | 'uploading' | 'uploaded' | 'restoring' | 'error';

export function BackupPage() {
  // ── Export ──────────────────────────────────────────────────────────────────
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportError, setExportError] = useState('');

  async function handleExport() {
    setExportState('exporting');
    setExportError('');
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `penny-backup-${date}.penny`;
      a.click();
      URL.revokeObjectURL(url);
      setExportState('done');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
      setExportState('error');
    }
  }

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
      window.location.reload();
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Restore failed');
      setCloudState('error');
    }
  }

  // ── Full reset ────────────────────────────────────────────────────────────────
  const [showReset, setShowReset] = useState(false);

  async function handleReset() {
    await wipeAllData();
    window.location.href = '/'; // → router redirects to onboarding
  }

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-5">
      <h2 className="text-xl font-semibold text-primary">Backup & Restore</h2>

      {/* Automatic backup + sync (Track D) */}
      <AutoBackupCard />

      {/* Export card */}
      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
            <i className="ti ti-cloud-download" style={{ fontSize: 20, color: '#00a86b' }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Export backup</p>
            <p className="text-xs mt-0.5 leading-relaxed text-tertiary">
              Downloads a <span className="font-medium">.penny</span> file encrypted with your passphrase. Store it
              somewhere safe.
            </p>
          </div>
        </div>

        {exportState === 'done' && (
          <div className="flex items-center gap-2 text-success bg-success-subtle rounded-xl px-3 py-2">
            <i className="ti ti-circle-check" style={{ fontSize: 16 }} aria-hidden="true" />
            <p className="text-xs font-medium">Backup downloaded successfully</p>
          </div>
        )}
        {exportState === 'error' && <p className="text-xs text-danger">{exportError}</p>}

        <Button variant="primary" fullWidth onClick={() => void handleExport()} loading={exportState === 'exporting'}>
          {exportState === 'exporting' ? 'Preparing backup…' : 'Download backup'}
        </Button>
      </Card>

      {/* Import card */}
      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning-subtle flex items-center justify-center flex-shrink-0">
            <i className="ti ti-cloud-upload" style={{ fontSize: 20, color: STATUS.warning }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Restore from backup</p>
            <p className="text-xs mt-0.5 leading-relaxed text-tertiary">
              Select a <span className="font-medium">.penny</span> file and enter your passphrase to restore. Your
              current data will be replaced.
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

        <Button
          variant="primary"
          fullWidth
          onClick={() => setShowConfirm(true)}
          disabled={!selectedFile || !passphrase || importState === 'importing' || importState === 'done'}
          loading={importState === 'importing'}
        >
          {importState === 'importing' ? 'Restoring…' : 'Restore backup'}
        </Button>
      </Card>

      {/* Cloud backup card */}
      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-info-subtle flex items-center justify-center flex-shrink-0">
            <i className="ti ti-brand-google-drive" style={{ fontSize: 20, color: STATUS.info }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Back up to Google Drive</p>
            <p className="text-xs mt-0.5 leading-relaxed text-tertiary">
              Stores the same encrypted <span className="font-medium">.penny</span> file in your own Google Drive —
              neither Google nor we can read it.
            </p>
          </div>
        </div>

        {cloudEnabled ? (
          <>
            {cloudState === 'uploaded' && (
              <div className="flex items-center gap-2 text-success bg-success-subtle rounded-xl px-3 py-2">
                <i className="ti ti-circle-check" style={{ fontSize: 16 }} aria-hidden="true" />
                <p className="text-xs font-medium">Backed up to your Google Drive</p>
              </div>
            )}
            {cloudState === 'error' && <p className="text-xs text-danger">{cloudError}</p>}
            <div className="flex gap-3">
              <Button
                variant="primary"
                className="flex-1"
                loading={cloudState === 'uploading'}
                onClick={() => void handleCloudBackup()}
              >
                Back up now
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                loading={cloudState === 'restoring'}
                onClick={() => void handleCloudRestore()}
              >
                Restore
              </Button>
            </div>
            <p className="text-[11px] text-tertiary">Restore uses the passphrase entered above.</p>
          </>
        ) : (
          <div className="flex items-start gap-2 bg-surface-2 rounded-xl px-3 py-2.5">
            <i className="ti ti-info-circle text-tertiary mt-0.5" style={{ fontSize: 15 }} aria-hidden="true" />
            <p className="text-xs text-tertiary leading-relaxed">
              Google Drive backup activates once a Google client ID (and the matching CSP entries) are configured. Until
              then, use the encrypted file export above.
            </p>
          </div>
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
              Erases everything on this device and returns to onboarding. There is no recovery unless you have a backup.
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
    </div>
  );
}
