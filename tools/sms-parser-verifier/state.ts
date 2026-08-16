// State + data layer for the SMS parser verifier — session persistence, the official+session merge
// (`effectiveBundle()`), and every shared state shape the rendering modules (in entry.ts) read/write.
// Deliberately has ZERO dependency on any rendering code, so it can be understood/edited/tested in
// isolation — this is the piece split out first per the "long single file makes edits slower and
// riskier" concern raised during this redesign (2026-08-16).
import { traceSms, type SmsParseTrace } from '@/core/sms-import/smsParser';
import {
  SMS_PATTERNS_FALLBACK,
  type SmsPatternBundle,
  type BankSmsPatternSet,
  type SmsTemplateEntry
} from '@/core/sms-import/smsPatterns';
import { SMS_SAMPLE_MESSAGES, type SmsSampleMessage } from '@/core/sms-import/smsSampleMessages';
import type { BankPresetId } from '@/core/db/types';

export const RECEIVED_AT = Date.now();

// ── Session state — every edit/addition a tester makes, persisted to localStorage for convenience ─────
//
// Deliberately additive/non-destructive: nothing here ever mutates `baseBundle` (the real shipped data).
// `effectiveBundle()` below is the one place all four pieces get merged into what every other function in
// the tool actually reads/tests against.

export interface SessionState {
  /** Bank IDs created this session that don't exist in the base bundle at all. This list's only job is
   *  telling `effectiveBundle()` "still show this bank even with zero official presence" — a new bank's
   *  own sender patterns/templates live in the two maps below exactly like any other addition. */
  newBankIds: string[];
  /** Sender patterns a tester added — for an existing official bank (appended alongside its real
   *  patterns) or a brand-new bank (its only patterns). bankId -> patterns. */
  extraSenderPatterns: Record<string, string[]>;
  /** New templates added to any bank — appended after that bank's official templates (or the only
   *  templates, for a brand-new bank). bankId -> templates. */
  newTemplates: Record<string, SmsTemplateEntry[]>;
  /** Session-local replacement of an OFFICIAL bank's own template at a given array index — never mutates
   *  the real shipped data (`baseBundle`); "Revert to official" just deletes the entry here.
   *  bankId -> { [officialTemplateIndex]: overrideTemplate }. */
  overrides: Record<string, Record<number, SmsTemplateEntry>>;
  /** Templates a tester has turned off without deleting them — indices into the SAME effective-template
   *  array shape `overrides`/drafts already address (official templates first, then drafts appended).
   *  Excluded from `effectiveBundleForTesting()` (what the bank-scoped tester/Bulk test/pass-rate dot
   *  actually run against) but still shown, dimmed, in the right panel's reference cards so re-enabling
   *  is one click, not a re-add. bankId -> disabled indices. */
  disabledTemplates: Record<string, number[]>;
  /** The message a tester last tested a template against, from the template modal's own test box —
   *  persisted so the right panel's reference card can show a real sample (highlighted, with the
   *  matched/no-match pill) for a session-added template, which otherwise has no official sample at all.
   *  Also lets a tester's own edited/replacement sample stick for an OFFICIAL template, rather than only
   *  living for the lifetime of that one modal session. Same effective-index addressing as `overrides`/
   *  `disabledTemplates`. bankId -> { [effectiveIndex]: sample }. */
  draftSamples: Record<string, Record<number, { sender: string; body: string }>>;
  /** Common-pattern snippets a tester has added themselves, appended after `BUILTIN_SNIPPETS` in the
   *  regex helper panel — additive only, same convention as `newTemplates`. */
  customSnippets: CommonSnippet[];
  /** Session-local replacement of one of `BUILTIN_SNIPPETS` by its own index — never mutates the
   *  built-in array, same "override by index" convention as `overrides` above. */
  snippetOverrides: Record<number, CommonSnippet>;
}

const SESSION_KEY = 'smsVerifierSessionV2';

function emptySession(): SessionState {
  return {
    newBankIds: [],
    extraSenderPatterns: {},
    newTemplates: {},
    overrides: {},
    disabledTemplates: {},
    draftSamples: {},
    customSnippets: [],
    snippetOverrides: {}
  };
}

function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return {
      newBankIds: parsed.newBankIds ?? [],
      extraSenderPatterns: parsed.extraSenderPatterns ?? {},
      newTemplates: parsed.newTemplates ?? {},
      overrides: parsed.overrides ?? {},
      disabledTemplates: parsed.disabledTemplates ?? {},
      draftSamples: parsed.draftSamples ?? {},
      customSnippets: parsed.customSnippets ?? [],
      snippetOverrides: parsed.snippetOverrides ?? {}
    };
  } catch {
    return emptySession();
  }
}

/** Never reassigned — a `const` reference whose contents are mutated in place by the rendering modules
 *  (`session.newTemplates[bankId] = [...]`, etc.), so importing it elsewhere as `{ session }` always sees
 *  live updates without needing a setter. */
export const session: SessionState = loadSession();

export function saveSession(): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage full/unavailable — session just won't survive a reload, not fatal
  }
}

// ── Pattern source (bundled fallback, or a fetched URL) + session merge ────────────────────────────────

export let baseBundle: SmsPatternBundle = SMS_PATTERNS_FALLBACK;
export let baseBundleLabel = 'Bundled fallback (offline, ships in the app)';

/** The only way to reassign `baseBundle`/`baseBundleLabel` from outside this module — reading them
 *  elsewhere via a plain `import { baseBundle } from './state'` already sees live updates (ES module
 *  bindings), but writing them from another module needs an explicit function. */
export function setBaseBundle(bundle: SmsPatternBundle, label: string): void {
  baseBundle = bundle;
  baseBundleLabel = label;
}

export function officialCountFor(bankId: string): number {
  return baseBundle.banks.find((b) => b.bankId === bankId)?.templates.length ?? 0;
}

/** The one place official data + every session addition merge — every other function in the tool reads
 *  from this, never from `baseBundle`/`session` directly, so there is exactly one merge implementation. */
export function effectiveBundle(): SmsPatternBundle {
  const byBank = new Map<string, BankSmsPatternSet>();
  for (const b of baseBundle.banks) {
    const templates = b.templates.map((t, i) => session.overrides[b.bankId]?.[i] ?? t);
    byBank.set(b.bankId, {
      bankId: b.bankId,
      senderIdPatterns: [...b.senderIdPatterns, ...(session.extraSenderPatterns[b.bankId] ?? [])],
      templates: [...templates, ...(session.newTemplates[b.bankId] ?? [])]
    });
  }
  for (const bankId of session.newBankIds) {
    if (byBank.has(bankId)) continue;
    byBank.set(bankId, {
      bankId: bankId as BankPresetId, // tester-typed, not yet a real BankPresetId — harmless at runtime,
      // TS types don't exist post-build.
      senderIdPatterns: session.extraSenderPatterns[bankId] ?? [],
      templates: session.newTemplates[bankId] ?? []
    });
  }
  return { version: baseBundle.version, banks: [...byBank.values()] };
}

export function isTemplateDisabled(bankId: string, index: number): boolean {
  return (session.disabledTemplates[bankId] ?? []).includes(index);
}

/** Toggling never deletes anything — a disabled template stays fully visible (dimmed) in the right
 *  panel's reference cards, at the same effective index, so re-enabling it is one click, not a re-add. */
export function toggleTemplateDisabled(bankId: string, index: number): void {
  const current = session.disabledTemplates[bankId] ?? [];
  session.disabledTemplates[bankId] = current.includes(index)
    ? current.filter((i) => i !== index)
    : [...current, index];
  saveSession();
}

export function getDraftSample(bankId: string, index: number): { sender: string; body: string } | undefined {
  return session.draftSamples[bankId]?.[index];
}

/** Called from the template modal's Save action whenever a test message was actually provided — this is
 *  what makes a session-added template show a real reference sample (highlighted, with its own
 *  matched/no-match pill) in the right panel afterward, instead of "no sample on file." Also lets an
 *  edited/replacement sample for an OFFICIAL template stick beyond that one modal session. */
export function setDraftSample(bankId: string, index: number, sample: { sender: string; body: string }): void {
  session.draftSamples[bankId] ??= {};
  session.draftSamples[bankId][index] = sample;
  saveSession();
}

/** Same merge as `effectiveBundle()`, minus any template a tester has disabled — this is what the
 *  bank-scoped tester, Bulk test, and the sidebar pass-rate dot actually run against (the "what does my
 *  CURRENTLY ACTIVE configuration do" question), whereas `effectiveBundle()` itself (including disabled
 *  templates) backs the right panel's reference view so a disabled template stays visible to re-enable. */
export function effectiveBundleForTesting(): SmsPatternBundle {
  const full = effectiveBundle();
  return {
    version: full.version,
    banks: full.banks.map((b) => ({
      ...b,
      templates: b.templates.filter((_, i) => !isTemplateDisabled(b.bankId, i))
    }))
  };
}

/** Samples are authored in `smsSampleMessages.ts` in the same order as each bank's real (official)
 *  template list — grouping by bank here and indexing by position recovers "which sample goes with
 *  official template N" without a fragile label-matching heuristic. Session-added templates have no
 *  original sample (see the template-modal rendering in entry.ts — those get a manual "test against"
 *  box instead). */
export function samplesByBank(): Map<string, SmsSampleMessage[]> {
  const map = new Map<string, SmsSampleMessage[]>();
  for (const s of SMS_SAMPLE_MESSAGES) {
    const list = map.get(s.bankId) ?? [];
    list.push(s);
    map.set(s.bankId, list);
  }
  return map;
}

/** Sidebar dot color — green if every bundled sample for this bank currently parses, amber if some do,
 *  gray if none/no samples exist at all. */
export function bankPassState(bankId: string): 'pass' | 'partial' | 'none' {
  const samples = samplesByBank().get(bankId) ?? [];
  const bundle = effectiveBundleForTesting();
  if (samples.length === 0) return 'none';
  let passCount = 0;
  for (const s of samples) {
    if (traceSms(s.sender, s.body, RECEIVED_AT, bundle).outcome.kind === 'parsed') passCount++;
  }
  if (passCount === samples.length) return 'pass';
  if (passCount > 0) return 'partial';
  return 'none';
}

// ── Sidebar/main selection + modal — the app's top-level "what's on screen" state ───────────────────────

export type Selection = { kind: 'bulk' } | { kind: 'bank'; bankId: string };
export let selection: Selection = { kind: 'bank', bankId: 'hdfc' };
export function setSelection(next: Selection): void {
  selection = next;
}

/** Every editing surface is a popup (never inline card takeover) — one modal state drives all four
 *  kinds. `prefillSender`/`prefillBody` seed a brand-new template's manual test box when opened via a
 *  results row's "add a template, pre-filled from this message" action. */
export type ModalState =
  | { kind: 'template'; bankId: string; index: number | 'new'; prefillSender?: string; prefillBody?: string }
  | { kind: 'senders'; bankId: string }
  | { kind: 'export'; scopeBankId?: string }
  | { kind: 'import' }
  | { kind: 'newBank' }
  | null;
export let modal: ModalState = null;
export function setModal(next: ModalState): void {
  modal = next;
}

export let bankFilterQuery = '';
export function setBankFilterQuery(next: string): void {
  bankFilterQuery = next;
}

// ── Results-table state — shared shape for both the bank-scoped tester and the Bulk-test page ───────────

export type ResultFilter = 'all' | 'parsed' | 'partial' | 'unrecognized' | 'excluded';
export interface TestResult {
  sender: string;
  body: string;
  trace: SmsParseTrace;
}
export interface ResultsTableState {
  results: TestResult[];
  filter: ResultFilter;
  search: string;
  expandedIndex: number | null;
  page: number;
  pageSize: number;
  /** False until ▸ Test/Parse has actually been clicked once — the whole results block (stat strip,
   *  table, pagination) stays hidden until then, rather than showing an empty "Nothing tested yet" table
   *  before the tester has done anything. */
  hasRun: boolean;
}
export function emptyResultsState(): ResultsTableState {
  return { results: [], filter: 'all', search: '', expandedIndex: null, page: 1, pageSize: 100, hasRun: false };
}

export let bulkRaw = '';
export function setBulkRaw(next: string): void {
  bulkRaw = next;
}
export const bulkState: ResultsTableState = emptyResultsState();

/** Bank-scoped tester state, kept PER bank (keyed by bankId) — switching banks and back doesn't lose
 *  whatever you'd pasted/run there. */
export interface BankTesterState {
  mode: 'auto' | 'force';
  raw: string;
  state: ResultsTableState;
}
const bankTesters: Record<string, BankTesterState> = {};
export function bankTesterFor(bankId: string): BankTesterState {
  return (bankTesters[bankId] ??= { mode: 'auto', raw: '', state: emptyResultsState() });
}

// ── Common-pattern snippet library — the regex helper panel's "insert at cursor" list, editable/
// extendable per session (never mutates the curated defaults below; overrides/additions are additive,
// same convention as templates/sender patterns) ─────────────────────────────────────────────────────────

export interface CommonSnippet {
  label: string;
  snippet: string;
}

/** Curated defaults, grounded in the real, already-shipped `smsPatterns.ts` — not invented. Session
 *  edits never mutate this array; see `snippetOverrides`/`customSnippets` above. */
export const BUILTIN_SNIPPETS: CommonSnippet[] = [
  { label: 'amount', snippet: 'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)' },
  { label: 'acctLast4', snippet: 'X+(?<acctLast4>\\d{3,6})' },
  { label: 'cardLast4', snippet: 'X(?<cardLast4>\\d{4})' },
  { label: 'counterparty', snippet: '(?<counterparty>[\\w .@-]+)' },
  { label: 'ref', snippet: '(?:UPI )?Ref(?:erence)?\\.?\\s*No\\.?\\s*(?<ref>\\d+)' },
  { label: 'balance', snippet: 'Avl\\.?\\s*Bal\\.?\\s*Rs\\.?\\s?(?<balance>[\\d,]+\\.?\\d*)' },
  { label: 'dateStr (DD-Mon-YY)', snippet: '(?<dateStr>\\d{2}-[A-Za-z]{3}-\\d{2})' },
  { label: 'dateStr (DD/MM/YY)', snippet: '(?<dateStr>\\d{2}\\/\\d{2}\\/\\d{2})' },
  { label: 'dateStr (DD-MM-YYYY)', snippet: '(?<dateStr>\\d{2}-\\d{2}-\\d{4})' }
];

/** Built-ins (with any session override applied) followed by session-added custom snippets — the one
 *  merge every renderer of the regex helper panel reads from, same "one merge function" convention as
 *  `effectiveBundle()`. Index into this array is the "effective index" `saveSnippet()`/
 *  `deleteCustomSnippet()`/`isSnippetModified()`/`isSnippetCustom()` all address. */
export function effectiveSnippets(): CommonSnippet[] {
  return [...BUILTIN_SNIPPETS.map((s, i) => session.snippetOverrides[i] ?? s), ...session.customSnippets];
}

export function isSnippetCustom(effectiveIndex: number): boolean {
  return effectiveIndex >= BUILTIN_SNIPPETS.length;
}

export function isSnippetModified(effectiveIndex: number): boolean {
  return effectiveIndex < BUILTIN_SNIPPETS.length && session.snippetOverrides[effectiveIndex] !== undefined;
}

/** Warns (never blocks, same spirit as `findSenderPatternOverlap()`) when a snippet's own regex text is
 *  identical to one already in the library — returns the existing entry's effective index, or `null`.
 *  `excludeEffectiveIndex` skips the entry being edited itself so editing a snippet in place never
 *  reports itself as a duplicate of itself. */
export function isDuplicateSnippet(candidate: CommonSnippet, excludeEffectiveIndex?: number): number | null {
  const normalized = candidate.snippet.trim();
  if (!normalized) return null;
  const list = effectiveSnippets();
  for (let i = 0; i < list.length; i++) {
    if (i === excludeEffectiveIndex) continue;
    if (list[i].snippet.trim() === normalized) return i;
  }
  return null;
}

/** `effectiveIndex: 'new'` appends a session-added snippet; an existing effective index either
 *  overrides a built-in (index < `BUILTIN_SNIPPETS.length`) or edits a custom one in place. */
export function saveSnippet(effectiveIndex: number | 'new', snippet: CommonSnippet): void {
  if (effectiveIndex === 'new') {
    session.customSnippets = [...session.customSnippets, snippet];
  } else if (effectiveIndex < BUILTIN_SNIPPETS.length) {
    session.snippetOverrides[effectiveIndex] = snippet;
  } else {
    const customIndex = effectiveIndex - BUILTIN_SNIPPETS.length;
    const arr = [...session.customSnippets];
    arr[customIndex] = snippet;
    session.customSnippets = arr;
  }
  saveSession();
}

/** Only a session-added (custom) snippet can be deleted outright — a built-in can only be reverted by
 *  editing it back, never removed from the list entirely, so the panel always has its full curated set. */
export function deleteCustomSnippet(effectiveIndex: number): void {
  if (!isSnippetCustom(effectiveIndex)) return;
  const customIndex = effectiveIndex - BUILTIN_SNIPPETS.length;
  session.customSnippets = session.customSnippets.filter((_, i) => i !== customIndex);
  saveSession();
}
