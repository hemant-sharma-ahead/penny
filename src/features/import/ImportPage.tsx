import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { expenseCategoriesRepo, expensesRepo } from '@/core/db/repositories';
import type { ExpenseCategory } from '@/core/db/types';
import { CATEGORY_MIGRATION_MAP } from '@/core/db/defaultCategories';
import { parseByFormat, PENNY_TEMPLATE, type ImportFormat, type ParsedRow } from '@/core/import/importParsers';
import { downloadCsv } from '@/core/export/exportCsv';
import { formatCurrency } from '@/lib/formatters';
import { PATHS } from '@/router/paths';

interface PreviewRow extends ParsedRow {
  matchedCategoryId: string;
  matchedCategoryName: string;
  unrecognised: boolean;
  duplicate: boolean;
  sourceRef: string;
}

function dedupKey(date: number, amount: number, desc: string): string {
  return `${new Date(date).toISOString().slice(0, 10)}|${amount}|${desc.toLowerCase().trim()}`;
}

function matchCategory(
  name: string,
  categories: ExpenseCategory[]
): { id: string; name: string; unrecognised: boolean } {
  const lower = name.toLowerCase().trim();
  const fromMap = CATEGORY_MIGRATION_MAP[lower];
  if (fromMap) {
    const cat = categories.find((c) => c.id === fromMap);
    if (cat) return { id: cat.id, name: cat.name, unrecognised: false };
  }
  const direct = categories.find((c) => c.name.toLowerCase() === lower);
  if (direct) return { id: direct.id, name: direct.name, unrecognised: false };
  const other = categories.find((c) => c.id === 'cat-other');
  return { id: other?.id ?? 'cat-other', name: 'Other', unrecognised: true };
}

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const FORMAT_LABELS: Record<ImportFormat, string> = {
  penny: 'Penny CSV',
  ynab: 'YNAB',
  cashew: 'Cashew',
  moneyview: 'MoneyView'
};

export function ImportPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [format, setFormat] = useState<ImportFormat>('penny');
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [parseError, setParseError] = useState('');

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([expenseCategoriesRepo.getAll(), expensesRepo.getAll()]).then(([cats, exps]) => {
      setCategories(cats);
      setExistingKeys(new Set(exps.map((e) => dedupKey(e.date, e.amount, e.description))));
    });
  }, []);

  function handleFile(file: File) {
    setParseError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const rows = parseByFormat(text, format);
        if (rows.length === 0) {
          setParseError('No valid rows found. Check the file format or that you selected the correct parser.');
          return;
        }
        const enriched: PreviewRow[] = rows.map((row) => {
          const { id, name, unrecognised } = matchCategory(row.categoryName, categories);
          const ref = dedupKey(row.date, row.amount, row.description);
          return {
            ...row,
            matchedCategoryId: id,
            matchedCategoryName: name,
            unrecognised,
            duplicate: existingKeys.has(ref),
            sourceRef: ref
          };
        });
        setPreview(enriched);
        setStep('preview');
      } catch {
        setParseError('Could not parse the file. Make sure it is a valid CSV.');
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    const toImport = preview.filter((r) => !r.duplicate);
    let count = 0;
    for (const row of toImport) {
      const now = Date.now();
      await expensesRepo.put({
        id: crypto.randomUUID(),
        amount: row.amount,
        categoryId: row.matchedCategoryId,
        description: row.description,
        date: row.date,
        hashtags: row.hashtags,
        isRecurring: false,
        ...(row.paymentMode && { paymentMode: row.paymentMode }),
        ...(row.notes && { notes: row.notes }),
        type: row.type,
        source: 'import',
        sourceRef: row.sourceRef,
        createdAt: now,
        updatedAt: now
      });
      count++;
    }
    setImportedCount(count);
    setImporting(false);
    setStep('done');
  }

  const toImport = preview.filter((r) => !r.duplicate);
  const unrecognisedCount = preview.filter((r) => r.unrecognised && !r.duplicate).length;
  const duplicateCount = preview.filter((r) => r.duplicate).length;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme flex items-center gap-3">
        <button
          onClick={() => (step === 'upload' ? navigate(PATHS.app.expenses) : setStep('upload'))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden="true" />
        </button>
        <h2 className="text-xl font-semibold text-primary">Import expenses</h2>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4 flex-1">
        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <>
            {/* Format selector */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Format</p>
              <div className="grid grid-cols-2 gap-2">
                {(['penny', 'ynab', 'cashew', 'moneyview'] as ImportFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className="py-2.5 px-3 rounded-xl text-sm font-medium border transition-colors text-left"
                    style={{
                      backgroundColor: format === f ? 'var(--color-primary)' : 'var(--color-surface)',
                      borderColor: format === f ? 'var(--color-primary)' : 'var(--color-border)',
                      color: format === f ? '#fff' : 'var(--color-text-primary)'
                    }}
                  >
                    {FORMAT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>

            {/* Penny template download */}
            {format === 'penny' && (
              <button
                onClick={() => downloadCsv(PENNY_TEMPLATE, 'penny-import-template.csv')}
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: 'var(--color-primary)' }}
              >
                <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true" />
                Download Penny CSV template
              </button>
            )}

            {/* File picker */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">File</p>
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
              {parseError && <p className="text-xs text-red-500">{parseError}</p>}
            </div>

            {/* Format hints */}
            <div className="surface rounded-xl p-3.5 flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-secondary">Expected columns for {FORMAT_LABELS[format]}</p>
              <p className="text-xs text-tertiary font-mono leading-relaxed">
                {format === 'penny' && 'Date, Amount, Description, Category, Type, PaymentMode, Tags, Notes'}
                {format === 'ynab' && 'Date, Payee, Memo, Outflow, Inflow (or Amount)'}
                {format === 'cashew' && 'Date, Title, Amount, Category, Account'}
                {format === 'moneyview' && 'Date, Description, Amount, Category'}
              </p>
            </div>
          </>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 'preview' && (
          <>
            {/* Summary */}
            <div className="surface rounded-xl p-3.5 flex flex-col gap-1">
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
            </div>

            {/* Row list */}
            <div className="surface rounded-xl overflow-hidden divide-y divide-theme">
              {preview.map((row, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3" style={{ opacity: row.duplicate ? 0.45 : 1 }}>
                  {/* Status dot */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{
                      backgroundColor: row.duplicate
                        ? 'var(--color-text-tertiary)'
                        : row.unrecognised
                          ? '#f59e0b'
                          : '#22c55e'
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
              <button
                onClick={() => setStep('upload')}
                className="flex-1 py-3 rounded-xl border border-theme text-sm font-medium text-secondary"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing || toImport.length === 0}
                className="flex-[2] py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {importing ? 'Importing…' : `Import ${toImport.length} expense${toImport.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Done ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center gap-6 flex-1 py-12">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#10b98120' }}
            >
              <i className="ti ti-check" style={{ fontSize: 32, color: '#10b981' }} aria-hidden="true" />
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-primary">Import complete</p>
              <p className="text-sm text-secondary mt-1">
                {importedCount} expense{importedCount !== 1 ? 's' : ''} added to your vault
              </p>
            </div>
            <button
              onClick={() => navigate(PATHS.app.expenses)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Go to Expenses
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
