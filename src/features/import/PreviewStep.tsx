import { Button, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import type { PreviewRow } from '@/core/import/importPipeline';

interface PreviewStepProps {
  preview: PreviewRow[];
  toImport: PreviewRow[];
  unrecognisedCount: number;
  duplicateCount: number;
  importing: boolean;
  onBack: () => void;
  onImport: () => void;
}

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function PreviewStep({
  preview,
  toImport,
  unrecognisedCount,
  duplicateCount,
  importing,
  onBack,
  onImport
}: PreviewStepProps) {
  return (
    <>
      {/* Summary */}
      <Card padding="sm" radius="md" className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-primary">{preview.length} rows found</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {toImport.length > 0 && <span className="text-xs text-secondary">{toImport.length} to import</span>}
          {unrecognisedCount > 0 && (
            <span className="text-xs" style={{ color: '#f59e0b' }}>
              {unrecognisedCount} category unrecognised → Other
            </span>
          )}
          {duplicateCount > 0 && (
            <span className="text-xs text-tertiary">
              {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} skipped
            </span>
          )}
        </div>
      </Card>

      {/* Row list */}
      <div className="surface rounded-xl overflow-hidden divide-y divide-theme">
        {preview.map((row, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3" style={{ opacity: row.duplicate ? 0.45 : 1 }}>
            <div
              className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
              style={{
                backgroundColor: row.duplicate ? 'var(--color-text-tertiary)' : row.unrecognised ? '#f59e0b' : '#22c55e'
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-primary truncate">{row.description}</span>
                <span
                  className="text-sm font-semibold flex-shrink-0"
                  style={{
                    color: row.type === 'income' ? '#10b981' : 'var(--color-text-primary)',
                    textDecoration: row.duplicate ? 'line-through' : undefined
                  }}
                >
                  {row.type === 'income' ? '+' : ''}
                  {formatCurrency(row.amount)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-tertiary">{fmtShortDate(row.date)}</span>
                <span className="text-tertiary text-xs">·</span>
                <span
                  className="text-xs"
                  style={{ color: row.unrecognised ? '#f59e0b' : 'var(--color-text-secondary)' }}
                >
                  {row.matchedCategoryName}
                  {row.unrecognised && ' (unrecognised)'}
                </span>
                {row.duplicate && (
                  <>
                    <span className="text-tertiary text-xs">·</span>
                    <span className="text-xs text-tertiary">duplicate</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pb-4">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          loading={importing}
          disabled={importing || toImport.length === 0}
          onClick={onImport}
        >
          {importing ? 'Importing…' : `Import ${toImport.length} expense${toImport.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </>
  );
}
