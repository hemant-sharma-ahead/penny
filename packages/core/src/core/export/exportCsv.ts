export { exportExpensesAsCsv } from './exportCsv.shared';

// Plain (unprotected) file download — used for non-sensitive files like the import template
export function downloadCsv(content: string, filename: string): void {
  triggerDownload(new Blob([content], { type: 'text/csv;charset=utf-8;' }), filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Downloads the CSV as an AES-256 password-protected ZIP (WinZip/7-Zip compatible)
export async function downloadProtectedZip(csv: string, zipFilename: string, password: string): Promise<void> {
  // Lazy-load zip.js only when the user exports — keeps it out of the initial bundle.
  const { BlobWriter, TextReader, ZipWriter, configure } = await import('@zip.js/zip.js');
  // Disable Web Workers — the app CSP blocks blob worker URLs and CSV files are small enough to compress on the main thread
  configure({ useWebWorkers: false });
  const writer = new ZipWriter(new BlobWriter('application/zip'), {
    password,
    encryptionStrength: 3 // AES-256
  });
  await writer.add('penny-expenses.csv', new TextReader(csv));
  const blob = await writer.close();
  triggerDownload(blob, zipFilename);
}
