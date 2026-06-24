import { useRef, useState } from 'react';
import { exportBackup, importBackup } from '@/core/backup/backupManager';
import { Card, TextInput, Button, ConfirmDialog } from '@/components/ui';

type ExportState = 'idle' | 'exporting' | 'done' | 'error';
type ImportState = 'idle' | 'importing' | 'done' | 'error';

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

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-5">
      <h2 className="text-xl font-semibold text-primary">Backup & Restore</h2>

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
          <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl px-3 py-2">
            <i className="ti ti-circle-check" style={{ fontSize: 16 }} aria-hidden="true" />
            <p className="text-xs font-medium">Backup downloaded successfully</p>
          </div>
        )}
        {exportState === 'error' && <p className="text-xs text-red-500">{exportError}</p>}

        <Button variant="primary" fullWidth onClick={() => void handleExport()} loading={exportState === 'exporting'}>
          {exportState === 'exporting' ? 'Preparing backup…' : 'Download backup'}
        </Button>
      </Card>

      {/* Import card */}
      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <i className="ti ti-cloud-upload" style={{ fontSize: 20, color: '#f59e0b' }} aria-hidden="true" />
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
          <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl px-3 py-2">
            <i className="ti ti-circle-check" style={{ fontSize: 16 }} aria-hidden="true" />
            <p className="text-xs font-medium">Restored — relocking session…</p>
          </div>
        )}
        {importState === 'error' && <p className="text-xs text-red-500">{importError}</p>}

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

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => void handleImport()}
        title="Replace all data?"
        message="All current data — expenses, goals, portfolio, and settings — will be permanently replaced with the contents of the backup file. This cannot be undone."
        confirmLabel="Yes, restore"
        confirmVariant="danger"
      />
    </div>
  );
}
