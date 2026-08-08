#!/usr/bin/env node
// Pre-commit PII gate — blocks accidentally committing real personal data.
//
// Triggered by the incident on 2026-08-07: a real EPFO passbook PDF shared for feature
// development had its on-screen image redacted, but its underlying PDF text layer still
// carried a real UAN, member ID, and full name (visual redaction != text-layer redaction).
// The file was never committed, but nothing would have stopped it from being committed if
// it had been `git add`-ed — this gate is that missing check.
//
// Two independent checks, both intentionally high-precision / low-noise so the gate stays
// useful instead of being reflexively bypassed with --no-verify:
//
//   1. Risky binary document files (pdf/xlsx/xls/csv/doc/docx/db/sqlite/sqlite3) being
//      added or modified — these are exactly the shapes real financial exports/statements
//      come in. Blocked unless the path is an explicitly-allowed synthetic test fixture.
//   2. Distinctive-format PII patterns (PAN, IFSC, Aadhaar-as-spaced-groups, UAN-labelled
//      12-digit numbers, non-fake email domains) appearing in newly ADDED lines of the
//      diff. Deliberately does NOT include a bare "9-18 digit number" or "10-digit mobile"
//      pattern here (unlike the runtime AI-context gate in
//      packages/core/src/core/ai-safety/piiScanner.ts) — those are far too noisy against a
//      finance app's own source (epoch timestamps, mock amounts, test IDs) and would just
//      train people to reach for --no-verify.
//
// Modes:
//   node scripts/check-pii.mjs           — scan the currently staged diff (pre-commit hook)
//   node scripts/check-pii.mjs --full    — scan every tracked file in the repo (manual audit)
//
// Escape hatch for a confirmed false positive on a specific line: append `pii-ignore` as a
// trailing comment on that line. There's no blanket env-var bypass by design — `git commit
// --no-verify` already exists for genuine emergencies and shows up in shell history.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FULL_SCAN = process.argv.includes('--full');

const RISKY_BINARY_EXTENSIONS = /\.(pdf|xlsx|xls|csv|doc|docx|db|sqlite|sqlite3)$/i;

// Compiled/opaque binary formats — never text-scanned. Matching embedded ASCII byte runs in a
// compiled binary (e.g. third-party native-library copyright/author strings baked into an APK)
// isn't meaningful PII detection and is pure noise; the real concern with build artifacts like
// APKs living in the repo is a repo-hygiene one (bloat, shouldn't be version-controlled at all),
// not something this content-pattern gate can or should adjudicate.
const OPAQUE_BINARY_EXTENSIONS = /\.(apk|aab|ipa|so|dylib|dll|exe|jar|zip|png|jpe?g|gif|webp|ico|ttf|otf|woff2?)$/i;

// A staged risky-binary file is allowed through only if it matches one of these — i.e. it's
// an obviously-synthetic test fixture, not a real export. Keep this list narrow on purpose.
const ALLOWED_BINARY_PATH_PATTERNS = [/\/(tests?|fixtures)\/.*synthetic[^/]*$/i];

// Files deliberately excluded from text-content scanning entirely, rather than per-line
// `pii-ignore`d — because they either (a) exist specifically to hold PII-shaped strings as
// test fixtures for the *runtime* PII scanner (packages/core/src/core/ai-safety/piiScanner.ts)
// and would need one on nearly every line, or (b) are machine-generated dependency manifests
// that will always contain real (but public, third-party, non-Penny-user) maintainer emails.
// Keep this list narrow and each entry commented — it's an audit trail, not a place to dump
// exclusions to silence noise.
const EXCLUDED_FILES = [
  'packages/core/tests/pii-gate/piiGate.test.ts', // tests the scanner itself with PII-shaped strings
  'pnpm-lock.yaml', // auto-generated; contains public npm maintainer emails, not user data
  'package-lock.json',
  'yarn.lock'
];

// High-precision only — see the file-header comment for why bare digit-run patterns are
// deliberately excluded from this gate.
const TEXT_PATTERNS = [
  { name: 'PAN', regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
  { name: 'IFSC', regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { name: 'Aadhaar (spaced)', regex: /\b\d{4}[ -]\d{4}[ -]\d{4}\b/g },
  { name: 'UAN (labelled)', regex: /\bUAN\b[^\n]{0,20}?\b\d{12}\b/gi },
  { name: 'Member ID (labelled)', regex: /\bMember\s*ID\b[^\n]{0,20}?\b[A-Z]{2,6}\d{10,17}\b/gi }
];

// Domains that are obviously placeholder/fake — anything else in an email match is flagged.
const SAFE_EMAIL_DOMAINS = [
  'example.com',
  'example.org',
  'test.com',
  'penny.app',
  'penny.local',
  'ahead.com',
  'anthropic.com',
  'workers.dev',
  'noreply.github.com'
];
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
}

function getStagedFiles() {
  return sh('git diff --cached --name-only --diff-filter=ACM').split('\n').filter(Boolean);
}

function getTrackedFiles() {
  return sh('git ls-files').split('\n').filter(Boolean);
}

function getStagedAddedLines(file) {
  // Only lines actually being added in this commit — never flag unrelated pre-existing
  // lines just because the file they live in happens to be touched.
  let diff;
  try {
    diff = sh(`git diff --cached -U0 -- ${JSON.stringify(file)}`);
  } catch {
    return [];
  }
  return diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));
}

function scanTextLines(lines, findings, file) {
  for (const line of lines) {
    if (/pii-ignore/.test(line)) continue;

    for (const { name, regex } of TEXT_PATTERNS) {
      regex.lastIndex = 0;
      const m = regex.exec(line);
      if (m) findings.push({ file, kind: name, snippet: m[0] });
    }

    EMAIL_REGEX.lastIndex = 0;
    let m;
    while ((m = EMAIL_REGEX.exec(line))) {
      const domain = m[1].toLowerCase();
      if (!SAFE_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
        findings.push({ file, kind: 'email (non-placeholder domain)', snippet: m[0] });
      }
    }
  }
}

function isAllowedBinary(file) {
  return ALLOWED_BINARY_PATH_PATTERNS.some((p) => p.test(file));
}

function main() {
  const findings = [];
  const blockedBinaries = [];

  const files = (FULL_SCAN ? getTrackedFiles() : getStagedFiles()).filter((f) => !EXCLUDED_FILES.includes(f));

  for (const file of files) {
    if (RISKY_BINARY_EXTENSIONS.test(file)) {
      if (!isAllowedBinary(file)) blockedBinaries.push(file);
      continue; // don't try to text-scan binary content
    }

    if (OPAQUE_BINARY_EXTENSIONS.test(file)) continue;

    if (FULL_SCAN) {
      let content;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue; // unreadable/binary — skip
      }
      scanTextLines(content.split('\n'), findings, file);
    } else {
      scanTextLines(getStagedAddedLines(file), findings, file);
    }
  }

  if (blockedBinaries.length === 0 && findings.length === 0) {
    if (!FULL_SCAN) console.log('✓ PII gate: no risky binary files or PII patterns staged.');
    return 0;
  }

  console.error(`\n🚫 PII gate ${FULL_SCAN ? 'scan' : 'check'} found issues:\n`);

  if (blockedBinaries.length > 0) {
    console.error('Risky document files (real exports carry PII even when "redacted"):');
    for (const f of blockedBinaries) console.error(`  - ${f}`);
    console.error(
      '  → If this is a real user file, do not commit it. If it is a synthetic test\n' +
        '    fixture, move/rename it to match a *.../tests|fixtures/.../*synthetic* path.\n'
    );
  }

  if (findings.length > 0) {
    console.error('Suspected PII in added content:');
    for (const f of findings) console.error(`  - ${f.file}: ${f.kind} → "${f.snippet}"`);
    console.error(
      '  → If this is a genuine false positive, add a trailing `pii-ignore` comment on\n' + '    that line.\n'
    );
  }

  if (!FULL_SCAN) {
    console.error('Commit blocked. Fix the above, or in a genuine emergency: git commit --no-verify\n');
  }

  return FULL_SCAN ? 0 : 1;
}

process.exit(main());
