import { useEffect, useMemo, useState } from 'react';
import { expenseCategoriesRepo, expensesRepo } from '@/core/db/repositories';
import { logActivity } from '@/core/db/activityLog';
import type { ExpenseCategory } from '@/core/db/types';
import { parseByFormat, type ImportFormat } from '@/core/import/importParsers';
import { buildPreviewRows, dedupKey, type PreviewRow } from '@/core/import/importPipeline';

type Step = 'upload' | 'preview' | 'done';

/**
 * RN port of apps/web-legacy/src/features/import/useImport.ts — unchanged logic. Owns the CSV-import
 * wizard: format selection, parse + enrich into preview rows, duplicate detection, and persisting the
 * non-duplicate rows. File reading stays in the UI (platform glue) — mobile's `UploadStep` uses
 * `expo-document-picker`/`expo-file-system` instead of web's `<input type=file>`, but both hand this
 * hook already-decoded text.
 */
export function useImport() {
  const [format, setFormat] = useState<ImportFormat>('penny');
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [parseError, setParseError] = useState('');

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([expenseCategoriesRepo.getAll(), expensesRepo.getAll()])
      .then(([cats, exps]) => {
        setCategories(cats);
        setExistingKeys(new Set(exps.map((e) => dedupKey(e.date, e.amount, e.description))));
      })
      .catch(() => {});
  }, []);

  /** Parses decoded file text in the selected format and moves to the preview step. */
  function importFromText(text: string) {
    setParseError('');
    try {
      const rows = parseByFormat(text, format);
      if (rows.length === 0) {
        setParseError('No valid rows found. Check the file format or that you selected the correct parser.');
        return;
      }
      setPreview(buildPreviewRows(rows, categories, existingKeys));
      setStep('preview');
    } catch {
      setParseError('Could not parse the file. Make sure it is a valid CSV.');
    }
  }

  async function runImport() {
    setImporting(true);
    const rows = preview.filter((r) => !r.duplicate);
    for (const row of rows) {
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
    }
    if (rows.length > 0) {
      logActivity({
        action: 'IMPORT',
        entityType: 'expense',
        entityId: 'import',
        summary: `Imported ${rows.length} transaction${rows.length === 1 ? '' : 's'}`,
        entityCount: rows.length
      });
    }
    setImportedCount(rows.length);
    setImporting(false);
    setStep('done');
  }

  const toImport = useMemo(() => preview.filter((r) => !r.duplicate), [preview]);
  const unrecognisedCount = useMemo(() => preview.filter((r) => r.unrecognised && !r.duplicate).length, [preview]);
  const duplicateCount = useMemo(() => preview.filter((r) => r.duplicate).length, [preview]);

  return {
    format,
    setFormat,
    step,
    setStep,
    preview,
    importing,
    importedCount,
    parseError,
    toImport,
    unrecognisedCount,
    duplicateCount,
    importFromText,
    runImport
  };
}
