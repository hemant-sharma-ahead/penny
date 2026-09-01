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
  /** Every test message a tester has saved against a template, from the template modal's own samples
   *  list — persisted so the right panel's reference card can show real sample(s) (highlighted, with a
   *  matched/no-match pill each, cycled via a small pager once there's more than one) for a session-added
   *  template, which otherwise has no official sample at all. Also lets a tester correct/replace an
   *  OFFICIAL template's own sample, or add MORE samples alongside it — one regex can genuinely match
   *  several differently-worded real messages, and one saved sample can't confirm that (2026-08-18). Same
   *  effective-index addressing as `overrides`/`disabledTemplates`. bankId -> { [effectiveIndex]:
   *  samples[] }. Was a single `{sender,body}` before 2026-08-18 — `loadSession()` migrates that shape. */
  draftSamples: Record<string, Record<number, { sender: string; body: string }[]>>;
  /** Common-pattern snippets a tester has added themselves, appended after `BUILTIN_SNIPPETS` in the
   *  regex helper panel — additive only, same convention as `newTemplates`. */
  customSnippets: CommonSnippet[];
  /** Session-local replacement of one of `BUILTIN_SNIPPETS` by its own index — never mutates the
   *  built-in array, same "override by index" convention as `overrides` above. */
  snippetOverrides: Record<number, CommonSnippet>;
  /** Senders a tester has manually marked "never a transaction" (a promotional shortcode, a
   *  KYC-reminder service, etc.) — every message from a literal sender in this list is bucketed as
   *  Excluded regardless of what `traceSms()` itself would have said, everywhere a result is shown
   *  (stat strip, table, pass-rate). Distinct from the automatic TRAI −P/−G suffix classification
   *  (`isAutoExcludedCategory()` below, a pure computed check — not stored here at all), and distinct
   *  from `disabledTemplates` (which excludes one template from matching, not a whole sender from
   *  ever counting as a transaction candidate). */
  excludedSenders: string[];
  /** Senders whose automatic −P/−G suffix classification a tester has manually overridden back to
   *  "treat normally" — since suffix categorization isn't guaranteed accurate (an older pre-2025
   *  message has no suffix at all; a bank could plausibly mis-register a template's category). */
  autoExcludeOverrides: string[];
  /** Individual messages marked "not a transaction," keyed by `` `${sender}::${body}` `` — for a
   *  sender that sends a mix of real transactions and noise, where excluding the whole sender would
   *  wrongly hide the real ones too. */
  excludedMessageKeys: string[];
  /** Official/modified templates a tester has removed outright — "some templates might not be good"
   *  (2026-08-18). Distinct from `disabledTemplates`: a disabled template stays visible, dimmed, in the
   *  right panel; a removed one is hidden from that list entirely (only surfaced via a compact "N
   *  removed — Restore" line), and — like disabled — excluded from `effectiveBundleForTesting()`.
   *  Deliberately does NOT delete the entry from `effectiveBundle()`'s own array (unlike a draft's real
   *  `Delete`, which safely splices since drafts always sit at the array's tail) — every other
   *  session-state map here (`overrides`/`disabledTemplates`/`draftSamples`) addresses a template by its
   *  position in that SAME array, so removing an official template from the middle would silently shift
   *  every later template's effective index and corrupt that bookkeeping. bankId -> removed indices. */
  removedTemplates: Record<string, number[]>;
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
    snippetOverrides: {},
    excludedSenders: [],
    autoExcludeOverrides: [],
    excludedMessageKeys: [],
    removedTemplates: {}
  };
}

/** `draftSamples` was a single `{sender,body}` per template before 2026-08-18 — wraps any old-shaped
 *  entry (a plain object, not an array) in a one-item array so an existing tester's session doesn't just
 *  silently lose its one saved sample the first time they open the tool after this change. */
function migrateDraftSamples(raw: unknown): Record<string, Record<number, { sender: string; body: string }[]>> {
  const result: Record<string, Record<number, { sender: string; body: string }[]>> = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [bankId, byIndex] of Object.entries(raw as Record<string, unknown>)) {
    if (!byIndex || typeof byIndex !== 'object') continue;
    result[bankId] = {};
    for (const [indexStr, value] of Object.entries(byIndex as Record<string, unknown>)) {
      if (!value) continue;
      result[bankId][Number(indexStr)] = Array.isArray(value) ? value : [value as { sender: string; body: string }];
    }
  }
  return result;
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
      draftSamples: migrateDraftSamples(parsed.draftSamples),
      customSnippets: parsed.customSnippets ?? [],
      snippetOverrides: parsed.snippetOverrides ?? {},
      excludedSenders: parsed.excludedSenders ?? [],
      autoExcludeOverrides: parsed.autoExcludeOverrides ?? [],
      excludedMessageKeys: parsed.excludedMessageKeys ?? [],
      removedTemplates: parsed.removedTemplates ?? {}
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

export function isTemplateRemoved(bankId: string, index: number): boolean {
  return (session.removedTemplates[bankId] ?? []).includes(index);
}

/** For an official/modified template — a draft's own "Delete" already truly splices it out of
 *  `session.newTemplates`, which is safe there; this is the equivalent action for a template that can't
 *  be safely spliced (see the field's own doc comment on `SessionState`). */
export function removeTemplate(bankId: string, index: number): void {
  const current = session.removedTemplates[bankId] ?? [];
  if (!current.includes(index)) session.removedTemplates[bankId] = [...current, index];
  saveSession();
}

export function restoreTemplate(bankId: string, index: number): void {
  session.removedTemplates[bankId] = (session.removedTemplates[bankId] ?? []).filter((i) => i !== index);
  saveSession();
}

export function getDraftSamples(bankId: string, index: number): { sender: string; body: string }[] {
  return session.draftSamples[bankId]?.[index] ?? [];
}

/** Called from the template modal's Save action whenever at least one non-blank test sample was provided
 *  — this is what makes a session-added template show real reference sample(s) (highlighted, with their
 *  own matched/no-match pill) in the right panel afterward, instead of "no sample on file." Also lets a
 *  tester correct/replace an OFFICIAL template's own sample, or save several alongside it. Replaces the
 *  WHOLE saved list for this template with `samples` (the modal always passes its complete current list,
 *  not a single addition) — blank entries are the caller's job to filter out before calling this. */
export function setDraftSamples(bankId: string, index: number, samples: { sender: string; body: string }[]): void {
  session.draftSamples[bankId] ??= {};
  session.draftSamples[bankId][index] = samples;
  saveSession();
}

/** Same merge as `effectiveBundle()`, minus any template a tester has disabled OR removed — this is what
 *  the bank-scoped tester, Bulk test, and the sidebar pass-rate dot actually run against (the "what does
 *  my CURRENTLY ACTIVE configuration do" question), whereas `effectiveBundle()` itself (including
 *  disabled/removed templates, so their session-state indices stay valid) backs the right panel's own
 *  rendering logic, which is what actually decides whether to show a disabled (dimmed) or removed
 *  (hidden) card. */
export function effectiveBundleForTesting(): SmsPatternBundle {
  const full = effectiveBundle();
  return {
    version: full.version,
    banks: full.banks.map((b) => ({
      ...b,
      templates: b.templates.filter((_, i) => !isTemplateDisabled(b.bankId, i) && !isTemplateRemoved(b.bankId, i))
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

// ── Sender/message exclusion — "this is not a transaction," distinct from "no template matches yet" ────
//
// Splits what used to be a single ambiguous "Unparsed" bucket into two genuinely different things: a
// real coverage gap (recognized bank, wrong wording — worth a new template) vs. not a transaction at
// all (OTP, promotional, government, non-financial service pings — no template should ever be written
// for these, and lumping them in with real gaps wastes review effort). Automatic where cheaply reliable
// (OTP keyword matching, already existed via `traceSms().excludedAsOtp`; the TRAI 2025 header suffix
// below), manual everywhere else — both sender-wide and per-message, since a sender can genuinely mix
// real transactions with noise (excluding the whole sender would wrongly hide the real ones too).

export type SmsSenderCategory = 'T' | 'S' | 'P' | 'G' | null;

/** Reads the TRAI 2025 header-suffix category straight off the sender string — a pure, stateless
 *  classification, not persisted session state at all (unlike everything else in this section). */
export function senderCategory(sender: string): SmsSenderCategory {
  const m = /-([TSPG])$/i.exec(sender.trim());
  return m ? ((m[1] as string).toUpperCase() as Exclude<SmsSenderCategory, null>) : null;
}

/** Promotional/Government are near-certain non-transactional; Service is deliberately NOT auto-excluded
 *  — real bank transaction alerts commonly register under Service too (confirmed during the TRAI
 *  suffix sender-pattern research), so auto-excluding it would risk hiding genuine transactions. */
export function isAutoExcludedCategory(sender: string): boolean {
  const cat = senderCategory(sender);
  return cat === 'P' || cat === 'G';
}

export function isSenderManuallyExcluded(sender: string): boolean {
  return session.excludedSenders.includes(sender);
}

export function excludeSender(sender: string): void {
  if (!session.excludedSenders.includes(sender)) session.excludedSenders.push(sender);
  saveSession();
}

export function includeSender(sender: string): void {
  session.excludedSenders = session.excludedSenders.filter((s) => s !== sender);
  saveSession();
}

/** Reverts an automatically-excluded (−P/−G) sender back to normal handling — independent of, and
 *  checked ahead of, `isAutoExcludedCategory()` itself, since suffix categorization isn't guaranteed
 *  accurate (an older pre-2025 message has no suffix at all; a bank could mis-register a template). */
export function isAutoExcludeOverridden(sender: string): boolean {
  return session.autoExcludeOverrides.includes(sender);
}
export function setAutoExcludeOverride(sender: string, overridden: boolean): void {
  session.autoExcludeOverrides = session.autoExcludeOverrides.filter((s) => s !== sender);
  if (overridden) session.autoExcludeOverrides.push(sender);
  saveSession();
}

export function isSenderExcluded(sender: string): boolean {
  if (isSenderManuallyExcluded(sender)) return true;
  return isAutoExcludedCategory(sender) && !isAutoExcludeOverridden(sender);
}

// Exported so the results table's row checkboxes (bulk-exclude, 2026-08-18) can key their own
// `selectedKeys` set identically to how `excludeMessage()`/`includeMessage()`/`isMessageExcluded()`
// already do — one canonical "identity" for a message, not two independent ones that could drift.
export function messageKey(sender: string, body: string): string {
  return `${sender}::${body}`;
}
export function isMessageExcluded(sender: string, body: string): boolean {
  return session.excludedMessageKeys.includes(messageKey(sender, body));
}
export function excludeMessage(sender: string, body: string): void {
  const key = messageKey(sender, body);
  if (!session.excludedMessageKeys.includes(key)) session.excludedMessageKeys.push(key);
  saveSession();
}
export function includeMessage(sender: string, body: string): void {
  const key = messageKey(sender, body);
  session.excludedMessageKeys = session.excludedMessageKeys.filter((k) => k !== key);
  saveSession();
}

/** The one place a raw parse trace becomes the bucket every stat card/filter/badge shows — purely
 *  trace-based (OTP + parsed/partial/unrecognized), no session/exclusion awareness. Kept separate from
 *  `effectiveOutcomeKind()` below so a caller that genuinely only has a trace (not a full `TestResult`)
 *  still has something to call. */
export function outcomeFilterKind(trace: SmsParseTrace): ResultFilter {
  if (trace.excludedAsOtp) return 'excluded';
  if (trace.outcome.kind === 'parsed') return 'parsed';
  if (trace.outcome.kind === 'unparsed_known_bank') return 'partial';
  return 'unrecognized';
}

/** Human-readable "why excluded" — `null` for anything not currently excluded. Distinguishes OTP
 *  (permanent parser behavior, nothing to undo) from the three reversible cases, so the UI can offer
 *  the right undo action for each. */
export type ExclusionReason =
  { kind: 'otp' } | { kind: 'auto'; category: 'P' | 'G' } | { kind: 'sender' } | { kind: 'message' };

export function exclusionReasonFor(result: TestResult): ExclusionReason | null {
  if (result.trace.excludedAsOtp) return { kind: 'otp' };
  if (isMessageExcluded(result.sender, result.body)) return { kind: 'message' };
  if (isSenderManuallyExcluded(result.sender)) return { kind: 'sender' };
  const cat = senderCategory(result.sender);
  if ((cat === 'P' || cat === 'G') && !isAutoExcludeOverridden(result.sender)) return { kind: 'auto', category: cat };
  return null;
}

/** The bucket a tested message ACTUALLY shows under — sender/message exclusion (manual, or automatic
 *  −P/−G) takes priority over whatever `traceSms()` itself concluded, since "this sender/message is
 *  categorically not a transaction" is a stronger, tester-asserted fact than a structural regex
 *  match/non-match. Every stat-strip count, filter, badge, and export in the results table reads from
 *  this — never `outcomeFilterKind()` directly. */
export function effectiveOutcomeKind(result: TestResult): ResultFilter {
  return exclusionReasonFor(result) ? 'excluded' : outcomeFilterKind(result.trace);
}

export interface SenderSummary {
  sender: string;
  bankLabel: string;
  count: number;
  /** How many of `count` structurally parsed (`outcomeFilterKind() === 'parsed'`) — deliberately the pure
   *  trace-based outcome, not `effectiveOutcomeKind()`, so excluding a sender/message doesn't make an
   *  otherwise-genuinely-parsed message stop counting as parsed here. */
  parsedCount: number;
  category: SmsSenderCategory;
  excluded: boolean;
  /** True only when the CURRENT exclusion comes from the automatic −P/−G classification (not a manual
   *  exclude) — lets the UI show the reversible "🤖 Auto-excluded" note only where it actually applies. */
  autoExcluded: boolean;
}

/** One row per distinct sender actually present in `results` — the "Senders in this batch" summary
 *  strip's data source, sorted by message count descending (the sender most worth a decision first).
 *  Recomputed fresh from whatever's currently in the results table, not persisted itself (only the
 *  exclusion decisions it surfaces are). */
export function summarizeSenders(results: TestResult[]): SenderSummary[] {
  const bySender = new Map<string, TestResult[]>();
  for (const r of results) {
    const arr = bySender.get(r.sender) ?? [];
    arr.push(r);
    bySender.set(r.sender, arr);
  }
  return [...bySender.entries()]
    .map(([sender, rows]) => {
      const bankId = rows.find((r) => r.trace.matchedSenderBanks.length > 0)?.trace.matchedSenderBanks[0];
      return {
        sender,
        bankLabel: bankId ? bankId.toUpperCase() : '—',
        count: rows.length,
        parsedCount: rows.filter((r) => outcomeFilterKind(r.trace) === 'parsed').length,
        category: senderCategory(sender),
        excluded: isSenderExcluded(sender),
        autoExcluded:
          !isSenderManuallyExcluded(sender) && isAutoExcludedCategory(sender) && !isAutoExcludeOverridden(sender)
      };
    })
    .sort((a, b) => b.count - a.count);
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
  /** Rows checked for the bulk Exclude/Include action bar (2026-08-18) — keyed by the same
   *  `` `${sender}::${body}` `` message key `excludeMessage()`/`includeMessage()` already use, not by row
   *  index, since index shifts with pagination/filtering/sorting and would silently "select" the wrong
   *  row otherwise. Ephemeral, same lifecycle as `expandedIndex` — reset on every fresh test run. */
  selectedKeys: Set<string>;
}
export function emptyResultsState(): ResultsTableState {
  return {
    results: [],
    filter: 'all',
    search: '',
    expandedIndex: null,
    page: 1,
    pageSize: 100,
    hasRun: false,
    selectedKeys: new Set()
  };
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

// ── Right panel — ephemeral UI-only display state, NOT persisted (unlike `SessionState` above) — purely
// "what's currently expanded/shown right now," never anything a tester would expect to survive a reload.
// (2026-08-18, moving the sender summary + a redesigned template card into the right panel.) ─────────────

const expandedTemplateCards = new Set<string>();
function templateCardKey(bankId: string, index: number): string {
  return `${bankId}#${index}`;
}
export function isTemplateCardExpanded(bankId: string, index: number): boolean {
  return expandedTemplateCards.has(templateCardKey(bankId, index));
}
export function toggleTemplateCardExpanded(bankId: string, index: number): void {
  const key = templateCardKey(bankId, index);
  if (expandedTemplateCards.has(key)) expandedTemplateCards.delete(key);
  else expandedTemplateCards.add(key);
}

/** "Show senders from other banks too" — a bank workspace's Senders section defaults to just THIS bank's
 *  own senders (auto-detect mode can still surface a message recognized under a different bank, or none
 *  at all), off by default, per bank. Deliberately visual-only: unlike `excludeSender()`, toggling this
 *  never changes what counts as excluded anywhere else in the tool — it only decides whether the "other
 *  banks" group is expanded on THIS bank's page right now. */
const showOtherBankSenders: Record<string, boolean> = {};
export function isShowingOtherBankSenders(bankId: string): boolean {
  return showOtherBankSenders[bankId] ?? false;
}
export function toggleShowOtherBankSenders(bankId: string): void {
  showOtherBankSenders[bankId] = !isShowingOtherBankSenders(bankId);
}

/** Collapsible Included/Excluded sender groups — Excluded starts collapsed (the common case needs no
 *  attention), Included starts open. One shared pair of toggles rather than per-bank/per-scope — simpler,
 *  and "did I open this section" is a reasonable thing to carry across switching banks/Bulk test. */
let includedSendersOpen = true;
let excludedSendersOpen = false;
export function isSenderGroupOpen(group: 'included' | 'excluded'): boolean {
  return group === 'included' ? includedSendersOpen : excludedSendersOpen;
}
export function toggleSenderGroupOpen(group: 'included' | 'excluded'): void {
  if (group === 'included') includedSendersOpen = !includedSendersOpen;
  else excludedSendersOpen = !excludedSendersOpen;
}

/** The right panel's Templates/Senders split height (px, top pane) — remembered across re-renders within
 *  the same page load (nearly every session-state edit rebuilds this panel from scratch) so a drag-resize
 *  doesn't get silently undone by the next unrelated click, but never persisted to storage; a fresh
 *  reload starts back at the default. */
export let rightPaneTopHeight = 300;
export function setRightPaneTopHeight(px: number): void {
  rightPaneTopHeight = px;
}

/** The regex helper panel's own width inside the template add/edit modal (2026-08-18: was a fixed
 *  260px — too narrow to read a longer snippet/example comfortably) — same "remembered across re-renders,
 *  never persisted" convention as `rightPaneTopHeight` above, since the modal itself is rebuilt fresh
 *  every time it's opened anyway (a stale width from a differently-sized template wouldn't mean much). */
export let helperPanelWidth = 260;
export function setHelperPanelWidth(px: number): void {
  helperPanelWidth = px;
}

/** Which saved sample (index into `getDraftSamples()`'s array) a template's expanded card is currently
 *  showing — the pager's own position. Ephemeral/per-card, defaults to the first sample; resets to 0 the
 *  next time a card is collapsed and re-expanded (not worth persisting beyond that). */
const activeSampleIndex = new Map<string, number>();
export function getActiveSampleIndex(bankId: string, index: number): number {
  return activeSampleIndex.get(templateCardKey(bankId, index)) ?? 0;
}
export function setActiveSampleIndex(bankId: string, index: number, sampleIndex: number): void {
  activeSampleIndex.set(templateCardKey(bankId, index), sampleIndex);
}

// ── Common-pattern snippet library — the regex helper panel's "insert at cursor" list, editable/
// extendable per session (never mutates the curated defaults below; overrides/additions are additive,
// same convention as templates/sender patterns) ─────────────────────────────────────────────────────────

export interface CommonSnippet {
  label: string;
  snippet: string;
  /** A real "matches X in Y" example — required for every built-in (authored below), optional for a
   *  tester's own custom snippet (asking them to always write one would be friction for a quick add). */
  example?: string;
}

/** Curated defaults, grounded in the real, already-shipped `smsPatterns.ts` — not invented. Session
 *  edits never mutate this array; see `snippetOverrides`/`customSnippets` above. */
export const BUILTIN_SNIPPETS: CommonSnippet[] = [
  { label: 'amount', snippet: 'Rs\\.?\\s?(?<amount>[\\d,]+\\.?\\d*)', example: '"Rs.500.00 debited..." → 500.00' },
  { label: 'account', snippet: 'X+(?<account>\\d{3,6})', example: '"...a/c XX1234 on..." → 1234' },
  { label: 'card', snippet: 'X(?<card>\\d{4})', example: '"...card XXXX4410 at..." → 4410' },
  {
    label: 'counterparty',
    snippet: '(?<counterparty>[\\w .@-]+)',
    example: '"...to VPA merchant@ybl (UPI..." → merchant@ybl'
  },
  {
    label: 'reference',
    snippet: '(?:UPI )?Ref(?:erence)?\\.?\\s*No\\.?\\s*(?<reference>\\d+)',
    example: '"...(UPI Ref No 123456789012)" → 123456789012'
  },
  {
    label: 'balance',
    snippet: 'Avl\\.?\\s*Bal\\.?\\s*Rs\\.?\\s?(?<balance>[\\d,]+\\.?\\d*)',
    example: '"Avl Bal Rs.10,482.50" → 10,482.50'
  },
  {
    label: 'date (DD-Mon-YY)',
    snippet: '(?<date>\\d{2}-[A-Za-z]{3}-\\d{2})',
    example: '"...on 15-Aug-26 to..." → 15-Aug-26'
  },
  {
    label: 'date (DD/MM/YY)',
    snippet: '(?<date>\\d{2}\\/\\d{2}\\/\\d{2})',
    example: '"...on 15/08/26." → 15/08/26'
  },
  {
    label: 'date (DD-MM-YYYY)',
    snippet: '(?<date>\\d{2}-\\d{2}-\\d{4})',
    example: '"...on 15-08-2026" → 15-08-2026'
  }
];

/** Built-ins (with any session override applied) followed by session-added custom snippets — the one
 *  merge every renderer of the regex helper panel reads from, same "one merge function" convention as
 *  `effectiveBundle()`. Index into this array is the "effective index" `saveSnippet()`/
 *  `deleteCustomSnippet()`/`isSnippetModified()`/`isSnippetCustom()` all address. */
export function effectiveSnippets(): CommonSnippet[] {
  return [...BUILTIN_SNIPPETS.map((s, i) => session.snippetOverrides[i] ?? s), ...session.customSnippets];
}

export interface SnippetUsageEntry {
  bankId: string;
  index: number;
  /** `template.addedAt` — shown as "T{index+1} (label)", same format as the right panel's own card
   *  header, so a tester recognizes it as the exact same template they'd find there. */
  label: string;
}

/** Every template, across every bank, whose regex contains this snippet's exact text as a substring —
 *  same "does pattern contain this fragment" check `findUncatalogedGroupPatterns()` already uses, just
 *  run in the other direction (given a snippet, find its templates, rather than given a template, find
 *  its uncatalogued snippets). Backs both the Common Patterns list's "Used in N templates" count and the
 *  popup listing them (2026-08-18). */
export function snippetUsage(snippet: CommonSnippet): SnippetUsageEntry[] {
  if (!snippet.snippet.trim()) return [];
  const bundle = effectiveBundle();
  const entries: SnippetUsageEntry[] = [];
  for (const bank of bundle.banks) {
    bank.templates.forEach((t, index) => {
      if (t.pattern.includes(snippet.snippet)) entries.push({ bankId: bank.bankId, index, label: t.addedAt });
    });
  }
  return entries;
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
