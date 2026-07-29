import { useRef, useState } from 'react';
import { Button, Card, OptionButton, SectionLabel } from '@/components/ui';
import { downloadCsv } from '@/core/export/exportCsv';
import {
  PENNY_TEMPLATE,
  IMPORT_FORMATS,
  FORMAT_LABELS,
  FORMAT_COLUMNS,
  type ImportFormat
} from '@/core/import/importParsers';
import { ImportCleanupPanel } from './ImportCleanupPanel';

interface UploadStepProps {
  format: ImportFormat;
  setFormat: (f: ImportFormat) => void;
  parseError: string;
  onText: (text: string) => void;
}

export function UploadStep({ format, setFormat, parseError, onText }: UploadStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => onText((e.target?.result as string) ?? '');
    reader.readAsText(file);
  }

  return (
    <>
      {/* Format selector */}
      <div className="flex flex-col gap-2">
        <SectionLabel className="">Format</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {[...IMPORT_FORMATS, 'custom' as const].map((f) => (
            <OptionButton
              key={f}
              label={FORMAT_LABELS[f]}
              selected={format === f}
              onClick={() => setFormat(f)}
              compact
            />
          ))}
        </div>
      </div>

      {/* Penny template download */}
      {format === 'penny' && (
        <Button
          variant="ghost"
          size="sm"
          icon="ti-download"
          style={{ color: 'var(--color-primary)' }}
          onClick={() => downloadCsv(PENNY_TEMPLATE, 'penny-import-template.csv')}
        >
          Download Penny CSV template
        </Button>
      )}

      {/* File picker */}
      <div className="flex flex-col gap-2">
        <SectionLabel className="">File</SectionLabel>
        <button
          onClick={() => fileRef.current?.click()}
          className="surface rounded-xl p-6 flex flex-col items-center gap-3 border-2 border-dashed border-theme hover:border-theme-strong transition-colors"
        >
          <i
            className="ti ti-file-upload"
            style={{ fontSize: 32, color: 'var(--color-text-tertiary)' }}
            aria-hidden="true"
          />
          <span className="text-sm text-secondary text-center">Tap to select a CSV file</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        {parseError && <p className="text-xs text-danger">{parseError}</p>}
      </div>

      {/* Format hints */}
      <Card padding="sm" radius="md" className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-secondary">Expected columns for {FORMAT_LABELS[format]}</p>
        <p className="text-xs text-tertiary font-mono leading-relaxed">{FORMAT_COLUMNS[format]}</p>
      </Card>

      {/* Temporary — see ImportCleanupPanel's doc comment */}
      <Button variant="ghost" size="sm" icon="ti-trash" onClick={() => setCleanupOpen(true)}>
        Clean up unused categories &amp; accounts
      </Button>
      {cleanupOpen && <ImportCleanupPanel onClose={() => setCleanupOpen(false)} />}
    </>
  );
}
