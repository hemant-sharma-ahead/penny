import { useRef, useState } from 'react';
import { exportBackup, importBackup } from '@/core/backup/backupManager';

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
    setShowConfirm(false);
    setImportState('importing');
    setImportError('');
    try {
      const text = await selectedFile.text();
      await importBackup(text, passphrase);
      setImportState('done');
      // Session is now locked — reload so AuthGuard re-evaluates and shows lock screen.
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Restore failed');
      setImportState('error');
    }
  }

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-5">
      <h2 className="text-xl font-semibold text-slate-900">Backup & Restore</h2>

      {/* Export card */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
            <i className="ti ti-cloud-download" style={{ fontSize: 20, color: '#00a86b' }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Export backup</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
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

        <button
          onClick={() => void handleExport()}
          disabled={exportState === 'exporting'}
          className="w-full py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {exportState === 'exporting' ? 'Preparing backup…' : 'Download backup'}
        </button>
      </div>

      {/* Import card */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <i className="ti ti-cloud-upload" style={{ fontSize: 20, color: '#f59e0b' }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Restore from backup</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Select a <span className="font-medium">.penny</span> file and enter your passphrase to restore. Your
              current data will be replaced.
            </p>
          </div>
        </div>

        {/* File picker */}
        <div>
          <label className="text-xs font-medium text-slate-500">Backup file</label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-left flex items-center gap-2"
          >
            <i className="ti ti-file text-slate-400" style={{ fontSize: 16 }} aria-hidden="true" />
            <span className={selectedFile ? 'text-slate-800' : 'text-slate-400'}>
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

        {/* Passphrase */}
        <div>
          <label className="text-xs font-medium text-slate-500">Passphrase</label>
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="Your original passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>

        {importState === 'done' && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl px-3 py-2">
            <i className="ti ti-circle-check" style={{ fontSize: 16 }} aria-hidden="true" />
            <p className="text-xs font-medium">Restored — relocking session…</p>
          </div>
        )}
        {importState === 'error' && <p className="text-xs text-red-500">{importError}</p>}

        <button
          onClick={() => setShowConfirm(true)}
          disabled={!selectedFile || !passphrase || importState === 'importing' || importState === 'done'}
          className="w-full py-3 rounded-xl border border-amber-300 text-amber-700 text-sm font-medium disabled:opacity-40"
        >
          {importState === 'importing' ? 'Restoring…' : 'Restore backup'}
        </button>
      </div>

      {/* Confirmation overlay */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-60 flex items-end"
          style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfirm(false)} />
          <div className="relative w-full bg-white rounded-t-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <i className="ti ti-alert-triangle text-red-500" style={{ fontSize: 20 }} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Replace all data?</p>
                <p className="text-xs text-slate-400 mt-0.5">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              All current data — expenses, goals, portfolio, and settings — will be permanently replaced with the
              contents of the backup file.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleImport()}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-medium"
              >
                Yes, restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
