// Builds the standalone SMS-parser verifier (tools/sms-parser-verifier/) into one dependency-free HTML
// file — bundles the REAL parser + pattern data straight from packages/core (via esbuild's `alias`,
// mirroring packages/core/vitest.config.ts's own `@` → `src` mapping) so there is exactly one copy of
// the matching logic, never a hand-duplicated one. `import.meta.env` (Vite-only, used transitively by
// packages/core/src/core/net/apiBase.ts) is statically replaced with `{}` — this tool never calls
// getSmsPatternBundle()'s live-fetch path by default, only parseSms() + the bundled fallback, so the
// resulting `undefined` values are harmless.
//
// Run: `pnpm build:sms-verifier`. Re-run and re-commit the generated HTML whenever
// packages/core/src/core/sms-import/{smsParser,smsPatterns,smsSampleMessages}.ts change.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const toolDir = path.join(root, 'tools', 'sms-parser-verifier');

const result = await build({
  entryPoints: [path.join(toolDir, 'entry.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  alias: { '@': path.join(root, 'packages', 'core', 'src') },
  define: { 'import.meta.env': '{}' },
  logLevel: 'info'
});

const script = result.outputFiles[0].text;
const template = await readFile(path.join(toolDir, 'index.template.html'), 'utf8');
// A function replacer (not a string one) — the bundled JS legitimately contains literal `$&`-shaped
// substrings (e.g. a regex-escaping helper's own `'\\$&'` replacement string), which `String.replace`
// would otherwise reinterpret as a special substitution pattern when the replacement itself is a
// plain string, corrupting the output. A function replacer's return value is always inserted verbatim.
const html = template.replace('/*__SCRIPT__*/', () => script);

const outPath = path.join(toolDir, 'sms-parser-verifier.html');
await writeFile(outPath, html, 'utf8');
console.log(`✓ Built ${path.relative(root, outPath)} (${(html.length / 1024).toFixed(0)} KB)`);
