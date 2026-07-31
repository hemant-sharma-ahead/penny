export { exportExpensesAsCsv } from './exportCsv.shared';

/**
 * RN port of core/export/exportCsv.ts. Web's `downloadCsv`/`downloadProtectedZip` build a browser
 * `Blob`, an object URL, and a synthetic `<a download>` click — none of which exist on RN. Both are
 * rewritten to write to `expo-file-system`'s cache directory, then hand the file to `expo-sharing`'s
 * native share sheet (same pattern already proven for Home's Stories share flow) instead of a direct
 * browser download. `exportExpensesAsCsv` (pure string building, no DOM) is unchanged.
 */

async function shareFile(uri: string, mimeType: string): Promise<void> {
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, { mimeType });
}

// Plain (unprotected) file — used for non-sensitive files like the import template
export async function downloadCsv(content: string, filename: string): Promise<void> {
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, filename);
  file.write(content);
  await shareFile(file.uri, 'text/csv');
}

// Shares the CSV as an AES-256 password-protected ZIP (WinZip/7-Zip compatible)
export async function downloadProtectedZip(csv: string, zipFilename: string, password: string): Promise<void> {
  // Lazy-load zip.js only when the user exports — keeps it out of the initial bundle. Uses
  // Uint8ArrayWriter (not BlobWriter) since RN's Blob shim doesn't support everything zip.js needs
  // internally for streaming compression.
  const { Uint8ArrayWriter, TextReader, ZipWriter, configure } = await import('@zip.js/zip.js');
  // Disable Web Workers — not available on RN's JS engine, same reasoning as web's CSP-based disable.
  configure({ useWebWorkers: false });
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    password,
    encryptionStrength: 3 // AES-256
  });
  await writer.add('penny-expenses.csv', new TextReader(csv));
  const bytes = await writer.close();

  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, zipFilename);
  file.write(bytes);
  await shareFile(file.uri, 'application/zip');
}
