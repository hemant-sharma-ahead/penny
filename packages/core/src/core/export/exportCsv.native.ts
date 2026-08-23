// Explicit RN-specific subpath (not the bare `@zip.js/zip.js` specifier) — its package.json `exports`
// map has a real, meaningfully different `react-native` condition build (`index-native.cjs`, ~9KB
// bigger than the generic `index.cjs`) for exactly this reason, but which one Metro's resolver actually
// picks for a static ES `import` vs. the dynamic `import()` this used to be is unverified/inconsistent
// (2026-08-05) — naming the subpath directly removes that ambiguity rather than trusting resolution.
import { Uint8ArrayWriter, Uint8ArrayReader, ZipWriter, configure } from '@zip.js/zip.js/index-native.js';

export { exportExpensesAsCsv, type ExportCsvContext } from './exportCsv.shared';

/**
 * RN port of core/export/exportCsv.ts. Web's `downloadCsv`/`downloadProtectedZip` build a browser
 * `Blob`, an object URL, and a synthetic `<a download>` click — none of which exist on RN. Both are
 * rewritten to write to `expo-file-system`'s cache directory, then hand the file to `expo-sharing`'s
 * native share sheet (same pattern already proven for Home's Stories share flow) instead of a direct
 * browser download. `exportExpensesAsCsv` (pure string building, no DOM) is unchanged.
 *
 * `@zip.js/zip.js` is a static top-level import here (2026-08-05), not lazy `await import(...)` —
 * it originally was, specifically to keep it out of the initial bundle, but that dynamic import
 * reproducibly crashed on-device with `Requiring unknown module "NNNN"` (Metro's async-require
 * mechanism failing to resolve a module inside the on-demand-fetched chunk — this package's dynamic
 * import pulls in ~40 sub-modules, unlike e.g. `xlsx`'s single-file dynamic import elsewhere in this
 * codebase, which works fine). Confirmed NOT a stale-cache/stale-Metro issue (reproduced across
 * multiple from-scratch rebuilds with cleared caches) and not fixed by disabling Metro's dev-only
 * lazy-bundling feature (`EXPO_NO_METRO_LAZY=1`) either — something more fundamental in Metro's
 * async-require/chunk-splitting breaks for this package's dependency graph. Static import sidesteps
 * the whole mechanism: the cost is `@zip.js/zip.js` now ships in the main bundle even for a session
 * that never exports, not a genuinely lazy chunk — a small, acceptable trade-off for correctness.
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
  // `File.write()` is async (`Promise<void>`) — was firing `shareFile` before the write landed. Same
  // missing-`await` bug found independently in several other native export flows (backup export,
  // XLSX/loan-planner export, SMS export) — see `apps/mobile/src/features/backup/AutoBackupCard.tsx`'s
  // fix note (2026-08-21) for the full writeup. Notably, this exact file already documents "undefined
  // is not a function" as this app's uninformative on-device error text for an unrelated bug below —
  // the same generic message very plausibly also covers this one.
  await file.write(content);
  await shareFile(file.uri, 'text/csv');
}

// Shares the CSV as an AES-256 password-protected ZIP (WinZip/7-Zip compatible)
export async function downloadProtectedZip(csv: string, zipFilename: string, password: string): Promise<void> {
  // Disable Web Workers — not available on RN's JS engine, same reasoning as web's CSP-based disable.
  configure({ useWebWorkers: false });

  // Root cause (2026-08-05, found via a real stack trace captured through `adb logcat` — the on-device
  // error overlay only ever showed the unhelpful `TypeError: undefined is not a function` with no
  // origin): `TextReader` extends zip.js's `BlobReader`, whose `readUint8Array()` calls
  // `blob.arrayBuffer()` on a `Blob` it constructs internally from the string. RN's own `Blob` class
  // (`Libraries/Blob/Blob.js`) implements exactly three methods — `constructor`, `slice()`, `close()` —
  // no `.arrayBuffer()` at all, so that call always threw. Works on RN Web because that's a real
  // browser's Blob. Fixed by using `Uint8ArrayReader` (a direct, Blob-free `Reader` implementation)
  // fed pre-encoded bytes via `TextEncoder` (already used safely elsewhere in this codebase, e.g.
  // `core/crypto/engine.ts`) instead of `TextReader`, avoiding RN's Blob entirely rather than working
  // around one specific missing method — the same underlying RN-Blob-incompatibility class of bug as
  // `PlannerResults.tsx`'s `downloadXlsx` fix earlier this session, just a different missing method in
  // a different library. (An earlier attempt at this bug hid `crypto.subtle` to force zip.js's pure-JS
  // PBKDF2 fallback, on a theory that `react-native-quick-crypto`'s WebCrypto shim was the cause — ruled
  // out by reproducing zip.js's encryption path directly in Node with both real and absent `subtle`,
  // neither of which reproduced this error; removed once the real cause was found.)
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    password,
    encryptionStrength: 3 // AES-256
  });
  await writer.add('penny-expenses.csv', new Uint8ArrayReader(new TextEncoder().encode(csv)));
  const bytes = await writer.close();

  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, zipFilename);
  // Same missing-`await` bug as `downloadCsv` above.
  await file.write(bytes);
  await shareFile(file.uri, 'application/zip');
}
