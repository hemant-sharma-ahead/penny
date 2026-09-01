// EPF Member Passbook PDF parser (2026-08-07) — see docs/plans/epf-passbook-import.md §4/§8. Pure
// function, no I/O (mirrors `bank-import/xlsxParser.ts`'s shape) — takes raw PDF bytes in, returns
// structured passbook data out. Platform file-picking/reading (`expo-document-picker` +
// `expo-file-system`) stays in the apps/mobile UI layer, exactly as every other import flow in this
// codebase already does it.
//
// Verified against two real samples during this feature's feasibility spike: a genuine EPFO
// passbook PDF (`unpdf`'s `extractText()` cleanly extracts ~2,600 characters, no OCR needed — see
// §8) and a negative example (a screenshot-as-PDF from a blog post, zero extractable text) — the
// negative example is exactly why `parseEpfPassbookPdf` validates a real text layer exists before
// attempting to parse anything, rather than assuming every uploaded PDF is a genuine passbook.
//
// The PDF's table headers render in a legacy non-Unicode Devanagari font — text extraction produces
// clean English text but garbage ("mojibake") for the Hindi half of every bilingual label. All
// matching below is done on the English half only (via distinctive anchor substrings/patterns),
// exactly as the one real open-source reference parser found during this feature's research
// (pdfplumber-based, Python) also does — see the design doc's §4 for the verified column layout.
import * as pdfjsModule from 'unpdf/pdfjs';
import { definePDFJSModule, getDocumentProxy, extractText } from 'unpdf';

/** Real, root-caused device bug, 2026-08-29 — see this file's other doc comments below for the full
 *  investigation. React Native/Hermes's own built-in `structuredClone` throws `TypeError: Cannot read
 *  property 'json' of null` on certain values PDF.js's internal message-passing protocol sends between
 *  its "main" and "fake worker" MessageHandler instances (`LoopbackPort.postMessage()` calls
 *  `structuredClone()` directly) — confirmed via direct instrumentation: the *request* side of a
 *  `GetDocRequest` clones fine, but the *reply* clone (the worker's response, once parsing succeeds)
 *  throws. Since `LoopbackPort.postMessage()` has no error handling around that call, the thrown
 *  exception is swallowed by whatever dispatches the reply, and the reply is simply never delivered —
 *  the original caller's promise waits forever for a response that will never arrive. This is a bug in
 *  Hermes's/RN's own `structuredClone` implementation, not in PDF.js or this app's own code. Since
 *  `LoopbackPort` never actually crosses a real thread boundary (it's an in-process loopback, not a
 *  real `Worker`), a manual deep-clone that just COPIES rather than truly "structured-clones" is a
 *  behaviorally-correct replacement here — swapped in globally, once, before PDF.js ever runs. */
function manualDeepClone<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return seen.get(value as object) as T;
  if (value instanceof Uint8Array) return value.slice() as T;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new (view.constructor as new (buf: ArrayBufferLike, byteOffset: number, length: number) => T)(
      view.buffer.slice(0),
      view.byteOffset,
      (view as unknown as { length: number }).length
    );
  }
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof RegExp) return new RegExp(value.source, value.flags) as T;
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) clone.push(manualDeepClone(item, seen));
    return clone as T;
  }
  if (value instanceof Map) {
    const clone = new Map();
    seen.set(value, clone);
    for (const [k, v] of value) clone.set(manualDeepClone(k, seen), manualDeepClone(v, seen));
    return clone as T;
  }
  if (value instanceof Set) {
    const clone = new Set();
    seen.set(value, clone);
    for (const v of value) clone.add(manualDeepClone(v, seen));
    return clone as T;
  }
  // Plain object (or a PDF.js-internal class instance carried across the loopback "port" as data) —
  // clone own enumerable properties. `Object.create(null)`-shaped objects and real plain objects both
  // land here; anything with exotic own accessors is out of scope for this message-passing use case.
  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const key of Object.keys(value as object)) {
    clone[key] = manualDeepClone((value as Record<string, unknown>)[key], seen);
  }
  return clone as T;
}

let structuredCloneReplaced = false;
function ensureWorkingStructuredClone(): void {
  if (structuredCloneReplaced) return;
  structuredCloneReplaced = true;
  globalThis.structuredClone = ((value: unknown) => manualDeepClone(value)) as typeof structuredClone;
}

export class EpfPassbookParseError extends Error {}

/** Real-device bug, 2026-08-29: `unpdf`'s own internal PDF.js loader (`resolvePDFJSImport()`)
 *  resolves its ~1.6MB serverless PDF.js bundle via its own `await import('unpdf/pdfjs')` — a dynamic
 *  import of a third-party submodule, unreliable in this project's Metro/Expo setup (a genuine hang
 *  in a release build; a different, Metro-dev-server-chunk-fetch-specific error in a debug build).
 *  Routed around here via a plain static top-level import instead, handed to `unpdf`'s own documented
 *  escape hatch (`definePDFJSModule`) so `getDocumentProxy`/`extractText` never invoke unpdf's
 *  internal dynamic-import resolver at all. */
let pdfjsModuleReady: Promise<void> | null = null;
function ensurePdfjsModuleDefined(): Promise<void> {
  pdfjsModuleReady ??= definePDFJSModule(async () => pdfjsModule);
  return pdfjsModuleReady;
}

/** Defensive safety net, 2026-08-29. The actual on-device hang was root-caused to a real Hermes/RN
 *  bug — see `ensureWorkingStructuredClone`'s doc comment above — and is now fixed. Kept as a hard
 *  timeout regardless, so any *other*, still-undiscovered on-device PDF.js issue fails honestly
 *  instead of leaving the UI stuck on a loading state forever. */
const PDF_PARSE_TIMEOUT_MS = 15_000;

async function withParseTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error('PDF parsing timed out')), PDF_PARSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface ParsedEpfPassbookRow {
  /** "YYYY-MM" — the wage/salary month this row's contribution relates to. Meaningless for a
   *  `transfer_in`/`withdrawal` row (the table has no separate column for these — the wage-month
   *  cell is just whatever calendar month the event posted in) — never used for those rowTypes. */
  wagesMonth: string;
  /** epoch ms — the real transaction/deposit date parsed from the passbook (NEVER inferred from
   *  wagesMonth — see docs/plans/epf-passbook-import.md §5's "don't infer, use the real value"
   *  principle). */
  date: number;
  /** The passbook's own row label, e.g. "Cont. for Due-Month 122014", "TRANSFER IN - ...". Kept as
   *  raw provenance — see `EpfTransaction.sourceParticulars`. */
  particulars: string;
  epfWages: number;
  epsWages: number;
  employeeAmount: number;
  employerAmount: number;
  pensionAmount: number;
  /** Which real transaction type this row represents — classified from the row's own CR/DR flag and
   *  `particulars` text (see `classifyRow` below). Optional/defaults to `'contribution'` when absent
   *  so `ParsedEpfExcelEmployerStatement.rows` (`epfExcelImport.ts`, whose rows are always
   *  already-contribution by construction — see that file's own doc comment) doesn't need to set it.
   *  A REAL, previously-uncaught bug this fixes: every row's TYPE was being hardcoded to
   *  `'contribution'` regardless of what it actually was — a "TRANSFER IN - Old Member Id ..." row
   *  was silently written as a monthly contribution with a fabricated `wagesMonth`, both mislabeling
   *  it and (via the resulting bogus wage-vs-salary comparison) triggering false "wage discrepancy"
   *  noise instead of being recognized as the one-time lump-sum transfer it actually is. */
  rowType?: 'contribution' | 'transfer_in' | 'withdrawal';
}

/** Classifies a row's real transaction type from its CR/DR flag and particulars text. EPFO's own
 *  passbook table has no dedicated "type" column — every row (contribution, transfer, withdrawal)
 *  shares the exact same 5-numeric-column shape, distinguished only by what the particulars text
 *  says and whether the row is a credit or debit to the account. Checked in this order because a
 *  particulars string is the more specific/reliable signal when present; CR/DR alone is the
 *  fallback for any debit row whose particulars don't match a recognized keyword (a settlement/
 *  withdrawal we don't have a more specific label for, but which must not be silently treated as if
 *  it were a monthly contribution — see the header comment above for why that's a real bug this
 *  exists to fix, not a hypothetical). */
export function classifyRow(crDr: string, particulars: string): NonNullable<ParsedEpfPassbookRow['rowType']> {
  if (/transfer.{0,3}in/i.test(particulars)) return 'transfer_in';
  if (/transfer.{0,3}out|settl(e(d|ment)?)|final\s*settlement|\bclaim\b/i.test(particulars)) return 'withdrawal';
  if (crDr.toUpperCase() === 'DR') return 'withdrawal';
  return 'contribution';
}

export interface ParsedEpfBalanceCheckpoint {
  asOfDate: number;
  employeeBalance: number;
  employerBalance: number;
  pensionBalance: number;
}

export interface ParsedEpfPassbook {
  establishmentId: string;
  establishmentName: string;
  memberId: string;
  memberName: string;
  /** "YYYY" — the financial year's start year, e.g. 2014 for "Financial Year - 2014-2015". */
  fyStartYear: number;
  rows: ParsedEpfPassbookRow[];
  /** The passbook's `OB Int. Updated upto` row — the opening balance for this FY, inclusive of all
   *  interest credited up to that date. */
  openingCheckpoint: ParsedEpfBalanceCheckpoint | null;
  /** The passbook's `Closing Balance as on` row. */
  closingCheckpoint: ParsedEpfBalanceCheckpoint | null;
  /** The passbook's OWN credited interest for this year (its own later `Int. Updated upto` row —
   *  distinct from `openingCheckpoint`, which is a balance figure, not an interest amount). Null if
   *  not yet credited (a real, expected state — EPFO often doesn't declare/credit a year's interest
   *  until well after that year ends; one reference sample literally showed "Interest details N/A"
   *  for this exact reason). */
  creditedInterest: { employeeAmount: number; employerAmount: number; pensionAmount: number } | null;
}

const RUPEE_NUMBER = /-?[\d,]+(?:\.\d+)?/;

function parseRupeeNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, '')) || 0;
}

/** DD/MM/YYYY or DD-MM-YYYY → epoch ms. Returns null if unparseable — callers must treat this as a
 *  structural parse failure, never guess a date. */
function parseDdMmYyyy(raw: string): number | null {
  const m = /(\d{2})[/-](\d{2})[/-](\d{4})/.exec(raw);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d.getTime();
}

/** "Mon-YYYY" (e.g. "Nov-2014") → "YYYY-MM". Returns null if unrecognised. */
function parseWageMonth(raw: string): string | null {
  const m = /([A-Za-z]{3})-(\d{4})/.exec(raw);
  if (!m) return null;
  const [, mon = '', yyyy] = m;
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
    mon.toLowerCase()
  );
  if (monthIndex < 0) return null;
  return `${yyyy}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/** Extracts one `<label> <ID> / <name, possibly wrapped across 1+ following lines>` header field —
 *  e.g. "Establishment ID/Name TNMAS0031309000 / COGNIZANT TECHNOLOGY SOLUTIONS INDIA PRIVATE" with
 *  "LIMITED" wrapping onto the next line (confirmed: a real sample does exactly this). Deliberately
 *  line-based rather than one large regex spanning multiple lines — a real sample also has a
 *  Hindi-mojibake "junk | " prefix on the line introducing the NEXT label (`nextLabel`), which
 *  earlier attempts at a single cross-line regex either swallowed into the captured value or
 *  required to be present at all (breaking on a passbook variant without it, e.g. a synthetic test
 *  fixture with no bilingual labels). Splitting into lines and stopping the moment any line simply
 *  *contains* `nextLabel` anywhere in it sidesteps both problems — it doesn't care what, if
 *  anything, appears before that label on its own line. */
function extractWrappedField(lines: string[], label: string, nextLabel: string): { id: string; value: string } | null {
  const startIdx = lines.findIndex((line) => line.includes(label));
  if (startIdx === -1) return null;

  const labelLine = lines[startIdx] ?? '';
  const afterLabel = labelLine.slice(labelLine.indexOf(label) + label.length).trim();
  const valueLines = [afterLabel];
  for (const line of lines.slice(startIdx + 1)) {
    if (line.includes(nextLabel)) break;
    valueLines.push(line.trim());
  }

  const m = /^([A-Z0-9]+)\s*\/\s*([\s\S]+)$/.exec(valueLines.join('\n').trim());
  if (!m) return null;
  return { id: m[1] ?? '', value: (m[2] ?? '').replace(/\s+/g, ' ').trim() };
}

/** Extracts the header block's `label | value` pairs — establishment/member identity, and which
 *  financial year this passbook covers. Every field here is required; a genuine EPFO passbook
 *  always has all of them, so a missing one signals this isn't actually a passbook PDF (or the
 *  format has changed in a way this parser doesn't yet handle) rather than something to silently
 *  work around. */
function parseHeader(text: string): {
  establishmentId: string;
  establishmentName: string;
  memberId: string;
  memberName: string;
  fyStartYear: number;
} {
  const lines = text.split('\n');
  const est = extractWrappedField(lines, 'Establishment ID/Name', 'Member ID/Name');
  const member = extractWrappedField(lines, 'Member ID/Name', 'Date of Birth');
  const fyMatch = /Financial Year\s*-\s*(\d{4})-(\d{4})/.exec(text);

  if (!est || !member || !fyMatch) {
    throw new EpfPassbookParseError(
      "This doesn't look like an EPFO Member Passbook — couldn't find the establishment/member header. " +
        'Make sure you uploaded the actual passbook PDF downloaded from the EPFO portal.'
    );
  }

  return {
    establishmentId: est.id,
    establishmentName: est.value,
    memberId: member.id,
    memberName: member.value,
    fyStartYear: Number(fyMatch[1])
  };
}

/** Matches every transaction row: "Nov-2014 01-12-2014 CR Cont. for Due-Month 122014 7,092 7,092
 *  851 260 591" — wage month, date, CR/DR flag, particulars, then exactly 5 trailing numeric
 *  columns (EPF wages, EPS wages, employee, employer, pension — see the design doc's §4 verified
 *  column order).
 *
 *  The particulars group is matched GREEDILY (`.+`, not `.+?`) anchored to end-of-line (`$` with the
 *  `m` flag) rather than stopped early at the first run of digits — real particulars text routinely
 *  contains its own numbers that aren't part of the 5 trailing columns at all (e.g. "Cont. for
 *  Due-Month 122014"'s own due-month reference code, or "TRANSFER IN - Old Member Id
 *  <alphanumeric>"). A non-greedy match stops at the FIRST plausible number sequence, misreading
 *  that embedded reference code as one of the 5 real numeric columns and shifting every column
 *  after it by one — confirmed as a real bug against an actual sample passbook during this
 *  feature's development, not a hypothetical edge case. Greedy + end-of-line anchoring instead
 *  finds the actual LAST 5 whitespace-separated numeric tokens on the line, which is unambiguous
 *  since a wage-month/date/CR-DR prefix never itself ends a line. */
const ROW_PATTERN = new RegExp(
  `^([A-Za-z]{3}-\\d{4})\\s+(\\d{2}[/-]\\d{2}[/-]\\d{4})\\s+(CR|DR)\\s+(.+)\\s+` +
    `(${RUPEE_NUMBER.source})\\s+(${RUPEE_NUMBER.source})\\s+(${RUPEE_NUMBER.source})\\s+(${RUPEE_NUMBER.source})\\s+(${RUPEE_NUMBER.source})$`,
  'gm'
);

/** Non-global counterpart of `ROW_PATTERN`, used only to TEST whether a single (possibly already
 *  merged) line is a complete row yet — a global regex's `lastIndex` state makes `.test()` unsafe to
 *  call repeatedly on different strings, so this exists purely to avoid that footgun in
 *  `reflowWrappedRows` below. */
const ROW_PATTERN_SINGLE = new RegExp(ROW_PATTERN.source);

/** A real, previously-silent bug found 2026-08-30 via a genuine multi-employer EPF transfer: pdf.js's
 *  text extraction can split ONE transaction table row across several physical text lines when its
 *  particulars text is long enough — routinely true for a real "TRANSFER IN - Old Member Id ..." row,
 *  which is far longer than a plain "Cont. for Due-Month ..." row. The date+CR/DR prefix lands on its
 *  own line with nothing else after it, the particulars text (sometimes an old member ID broken across
 *  more than one line) wraps across one or more further lines, and the row's own 5 trailing numeric
 *  columns can end up on a line of their OWN, entirely separate from the particulars text. `ROW_PATTERN`
 *  only ever matches a row that's complete on ONE line — such a row was previously invisible to the
 *  parser entirely (never even reaching `classifyRow`), which is exactly how a real transfer-in credit
 *  could be completely absent from Penny even though it's genuinely present in the passbook's own text.
 *  Confirmed against a real sample: 4 genuine `transfer_in` rows recovered, all previously silently
 *  dropped, 0 false merges against every other already-correctly-parsing sample checked.
 *
 *  Reassembles the text BEFORE `parseRows` runs: whenever a line matches ONLY the row's own date+CR/DR
 *  prefix (nothing else on it), greedily absorbs the following lines onto the same line until the
 *  merged result is a complete, matchable row — stopping the moment it hits a blank line, the start of
 *  a genuinely new row, or a hard cap (defensive — real samples needed at most a handful of lines),
 *  rather than guessing how many lines to absorb. A row that was already complete on one line is
 *  untouched (its own line never matches the "prefix only" trigger), so the common case is unaffected —
 *  confirmed against every other real sample already parsing correctly before this fix. */
const WRAPPED_ROW_PREFIX_ONLY = /^[A-Za-z]{3}-\d{4}\s+\d{2}[/-]\d{2}[/-]\d{4}\s+(CR|DR)\s*$/;
const WRAPPED_ROW_PREFIX = /^[A-Za-z]{3}-\d{4}\s+\d{2}[/-]\d{2}[/-]\d{4}\s+(CR|DR)\b/;
const MAX_WRAPPED_CONTINUATION_LINES = 10;

/** Exported purely for direct unit testing (packages/core/tests/portfolio/epfPassbookParser.test.ts) —
 *  operates on already-extracted text, so it's testable with plain strings, no real/synthetic PDF
 *  needed. Not meant to be called from outside this module otherwise. */
export function reflowWrappedRows(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? '').trim();
    if (!WRAPPED_ROW_PREFIX_ONLY.test(line)) {
      result.push(lines[i] ?? '');
      i++;
      continue;
    }
    let merged = line;
    let absorbed = 0;
    while (absorbed < MAX_WRAPPED_CONTINUATION_LINES && !ROW_PATTERN_SINGLE.test(merged)) {
      const next = (lines[i + 1 + absorbed] ?? '').trim();
      // A blank line or the start of the NEXT real row means this row's own continuation ran out —
      // stop rather than swallowing unrelated content into a guessed match.
      if (next === '' || WRAPPED_ROW_PREFIX.test(next)) break;
      merged += ` ${next}`;
      absorbed++;
    }
    result.push(merged);
    i += 1 + absorbed;
  }
  return result.join('\n');
}

function parseRows(text: string): ParsedEpfPassbookRow[] {
  const rows: ParsedEpfPassbookRow[] = [];
  for (const m of reflowWrappedRows(text).matchAll(ROW_PATTERN)) {
    const [, wageMonthRaw, dateRaw, crDr, particulars, epfWages, epsWages, employee, employer, pension] = m;
    const wagesMonth = parseWageMonth(wageMonthRaw ?? '');
    const date = parseDdMmYyyy(dateRaw ?? '');
    if (!wagesMonth || date === null) continue; // structurally malformed row — skip, don't guess
    const trimmedParticulars = (particulars ?? '').trim();
    rows.push({
      wagesMonth,
      date,
      particulars: trimmedParticulars,
      epfWages: parseRupeeNumber(epfWages ?? '0'),
      epsWages: parseRupeeNumber(epsWages ?? '0'),
      employeeAmount: parseRupeeNumber(employee ?? '0'),
      employerAmount: parseRupeeNumber(employer ?? '0'),
      pensionAmount: parseRupeeNumber(pension ?? '0'),
      rowType: classifyRow(crDr ?? '', trimmedParticulars)
    });
  }
  return rows;
}

/** Matches a labelled 3-column balance row, e.g. "OB Int. Updated upto 31/03/2014 0 0 0" or
 *  "Closing Balance as on 31/03/2015 3,725 1,139 2,559". `labelPattern` anchors which specific row
 *  to find — the passbook has multiple rows shaped like "<label> <date> <n> <n> <n>". */
function parseBalanceCheckpoint(text: string, labelPattern: RegExp): ParsedEpfBalanceCheckpoint | null {
  const combined = new RegExp(
    `${labelPattern.source}\\s+(\\d{2}[/-]\\d{2}[/-]\\d{4})\\s+(${RUPEE_NUMBER.source})\\s+(${RUPEE_NUMBER.source})\\s+(${RUPEE_NUMBER.source})`
  );
  const m = combined.exec(text);
  if (!m) return null;
  const [, dateRaw, employee, employer, pension] = m;
  const asOfDate = parseDdMmYyyy(dateRaw ?? '');
  if (asOfDate === null) return null;
  return {
    asOfDate,
    employeeBalance: parseRupeeNumber(employee ?? '0'),
    employerBalance: parseRupeeNumber(employer ?? '0'),
    pensionBalance: parseRupeeNumber(pension ?? '0')
  };
}

/** The passbook's own credited interest for the year — its SECOND `Int. Updated upto` occurrence
 *  (the first is the OPENING-balance row, matched separately by `openingCheckpoint` above; this one
 *  appears later, right before `Closing Balance as on`, and its 3 numbers are the actual interest
 *  AMOUNT credited, not a balance). Distinguishing the two occurrences by position (this one
 *  immediately precedes "Closing Balance as on") rather than order-of-appearance alone, since a
 *  malformed/incomplete PDF could otherwise cause the wrong one to be picked. Returns null if this
 *  year's interest hasn't been credited yet — a normal state, not a parse failure (EPFO often
 *  doesn't declare/credit a year's rate until well after that year ends). */
function parseCreditedInterest(
  text: string
): { employeeAmount: number; employerAmount: number; pensionAmount: number } | null {
  const m = new RegExp(
    `Int\\. Updated upto\\s+\\d{2}[/-]\\d{2}[/-]\\d{4}\\s+(${RUPEE_NUMBER.source})\\s+(${RUPEE_NUMBER.source})\\s+(${RUPEE_NUMBER.source})\\s*(?=Closing Balance as on)`
  ).exec(text);
  if (!m) return null;
  const [, employee, employer, pension] = m;
  return {
    employeeAmount: parseRupeeNumber(employee ?? '0'),
    employerAmount: parseRupeeNumber(employer ?? '0'),
    pensionAmount: parseRupeeNumber(pension ?? '0')
  };
}

/** Parses a real EPFO Member Passbook PDF (raw bytes) into structured data. Throws
 *  `EpfPassbookParseError` if the PDF has no extractable text at all (e.g. a scanned image or a
 *  screenshot saved as PDF — a real negative case hit during this feature's own research) or
 *  doesn't contain the expected header fields (not a genuine passbook export). Never silently
 *  returns partial/guessed data for a structural failure — the caller's review screen is
 *  responsible for surfacing any error to the user before anything is written. */
export async function parseEpfPassbookPdf(data: Uint8Array): Promise<ParsedEpfPassbook> {
  let text: string;
  try {
    await ensurePdfjsModuleDefined();
    ensureWorkingStructuredClone();
    // extractText() never needs real glyph rendering, only the text layer — `getDocumentProxy()`'s
    // own Node-only defaults (`disableFontFace`/`standardFontDataUrl`/`cMapUrl`) never apply outside
    // Node, so without this, PDF.js would otherwise attempt browser-only font-substitution machinery
    // for this file's embedded non-standard fonts (a legacy Devanagari font, plus a Latin font) —
    // verified in plain Node to produce identical extracted text with these options set.
    const fontOptions = { useSystemFonts: false, disableFontFace: true, isEvalSupported: false };
    const pdf = await withParseTimeout(getDocumentProxy(data, fontOptions));
    const extracted = await withParseTimeout(extractText(pdf, { mergePages: true }));
    text = extracted.text;
  } catch {
    throw new EpfPassbookParseError('Could not read this file as a PDF.');
  }

  if (!text || text.trim().length === 0) {
    throw new EpfPassbookParseError(
      'This PDF has no readable text — it may be a scanned image or a screenshot rather than a real ' +
        'EPFO passbook export. Download the passbook directly from the EPFO portal and try again.'
    );
  }

  const header = parseHeader(text);
  const rows = parseRows(text);
  const openingCheckpoint = parseBalanceCheckpoint(text, /OB Int\. Updated upto/);
  const closingCheckpoint = parseBalanceCheckpoint(text, /Closing Balance as on/);
  const creditedInterest = parseCreditedInterest(text);

  return { ...header, rows, openingCheckpoint, closingCheckpoint, creditedInterest };
}
