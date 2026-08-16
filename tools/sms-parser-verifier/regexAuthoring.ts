// Everything about drafting/testing a regex pattern in isolation — compile-validity checks, the
// single/forced synthetic test bundles, the fuzzy "did you mean"/overlap heuristics, and the regex
// helper panel (common capture-group snippets + syntax cheat sheet). No dependency on the tool's mutable
// selection/modal state — these are pure functions and self-contained UI builders.
import type {
  SmsPatternBundle,
  BankSmsPatternSet,
  SmsTemplateEntry,
  SmsTransactionType
} from '@/core/sms-import/smsPatterns';
import { CAPTURE_GROUP_NAMES } from '@/core/sms-import/smsParser';
import type { BankPresetId } from '@/core/db/types';
import { el } from './dom';
import { highlightedPattern, findNamedGroupSpans } from './highlighting';
import {
  effectiveSnippets,
  isDuplicateSnippet,
  saveSnippet,
  deleteCustomSnippet,
  isSnippetModified,
  isSnippetCustom,
  type CommonSnippet
} from './state';

export function tryCompile(pattern: string): { ok: true } | { ok: false; error: string } {
  try {
    new RegExp(pattern, 'i');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function singleTemplateBundle(
  bankId: string,
  template: SmsTemplateEntry,
  senderIdPatterns: string[]
): SmsPatternBundle {
  return { version: 1, banks: [{ bankId: bankId as BankPresetId, senderIdPatterns, templates: [template] }] };
}

/** Skips the sender-recognition gate entirely — every message tested against this gets every one of the
 *  bank's current (effective) templates tried regardless of sender, for the "Force against this bank"
 *  tester mode (isolating "does my regex fit the body" from "is the sender recognized"). */
export function forcedBankBundle(bank: BankSmsPatternSet): SmsPatternBundle {
  return { version: 1, banks: [{ ...bank, senderIdPatterns: ['.*'] }] };
}

// ── Fuzzy "did you mean" + sender-pattern overlap — cheap, explainable literal-fragment heuristics ─────

function literalFragments(pattern: string): string[] {
  return pattern.toUpperCase().match(/[A-Z]{3,}/g) ?? [];
}

/** Two fragments/strings are "similar enough" if one contains the other whole, OR they share a leading
 *  run of 3+ characters — the second case is what actually catches the realistic scenario (a bank's own
 *  shortcode variants, e.g. "SBIINB" vs "SBIPSG", share only a "SBI" prefix, not a full substring). */
function sharesSignificantPrefixOrSubstring(a: string, b: string): boolean {
  if (a.includes(b) || b.includes(a)) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 3;
}

export function suggestBankForSender(
  sender: string,
  bundle: SmsPatternBundle
): { bankId: BankPresetId; fragment: string } | null {
  const upper = sender.toUpperCase();
  for (const bank of bundle.banks) {
    for (const pattern of bank.senderIdPatterns) {
      for (const fragment of literalFragments(pattern)) {
        if (sharesSignificantPrefixOrSubstring(upper, fragment)) return { bankId: bank.bankId, fragment };
      }
    }
  }
  return null;
}

/** Warns (never blocks) when a sender pattern being added would also plausibly match another bank's
 *  existing patterns — `traceSms()` matches banks in bundle order, so a careless overlap would silently
 *  shadow one bank's messages behind another's, with no error. Some real-world overlap (a shared
 *  aggregator shortcode) is legitimate, so this is a "double-check this" nudge, not a hard block. */
export function findSenderPatternOverlap(
  newPattern: string,
  targetBankId: string,
  bundle: SmsPatternBundle
): BankPresetId | null {
  const newFragments = literalFragments(newPattern);
  if (newFragments.length === 0) return null;
  for (const bank of bundle.banks) {
    if (bank.bankId === targetBankId) continue;
    const existingFragments = bank.senderIdPatterns.flatMap(literalFragments);
    if (newFragments.some((f) => existingFragments.some((ef) => sharesSignificantPrefixOrSubstring(f, ef))))
      return bank.bankId;
  }
  return null;
}

/** Same regex-escaping idiom already used in `packages/core/src/core/bank-import/csvParser.ts` — the
 *  `$&`/replacement-string special-casing is deliberate here (it means "insert the whole match"), not the
 *  earlier build-script gotcha documented in this tool's own decision log (a DIFFERENT bug: using a plain
 *  string as the replacement argument for an unrelated placeholder token). */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Regex helper panel — an editable common capture-group snippet library (session-editable via
// `state.ts`'s `effectiveSnippets()`/`saveSnippet()`/`deleteCustomSnippet()`) + a general regex-syntax
// cheat sheet ───────────────────────────────────────────────────────────────────────────────────────────

/** A regex a tester just wrote uses a named group the real parser doesn't recognize at all (see
 *  `CAPTURE_GROUP_NAMES` in `smsParser.ts`) — it compiles fine, and can even still let `matched` be true
 *  (if `amount` is separately present), but that field's value is silently dropped: never read into
 *  `candidate`, never present in `captureRanges`, so it's never highlighted or extracted in production
 *  either. Surfacing this explicitly is what actually explains "why isn't my account number highlighted"
 *  — the field name itself has to be exactly right, not just present as *a* capture group. */
export function findUnrecognizedGroupNames(pattern: string): string[] {
  const known = new Set<string>(CAPTURE_GROUP_NAMES);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const span of findNamedGroupSpans(pattern)) {
    if (known.has(span.name) || seen.has(span.name)) continue;
    seen.add(span.name);
    result.push(span.name);
  }
  return result;
}

/** After saving a template, checks whether any of its named-group sub-patterns aren't already
 *  represented (as a literal substring) in the common-pattern library — a cheap, explainable way to
 *  suggest "this looks like a reusable fragment nobody's catalogued yet" without requiring an exact,
 *  brittle full-snippet match (a library entry usually wraps the same group in its own surrounding
 *  literal text, e.g. `X+(?<acctLast4>\d{3,6})` contains the bare `(?<acctLast4>\d{3,6})`). */
export function findUncatalogedGroupPatterns(pattern: string): { name: string; fragment: string }[] {
  const catalog = effectiveSnippets();
  const seen = new Set<string>();
  const result: { name: string; fragment: string }[] = [];
  for (const span of findNamedGroupSpans(pattern)) {
    const fragment = pattern.slice(span.start, span.end);
    if (seen.has(fragment)) continue;
    seen.add(fragment);
    if (!catalog.some((c) => c.snippet.includes(fragment))) result.push({ name: span.name, fragment });
  }
  return result;
}

const REGEX_SYNTAX_CHEATSHEET: { category: string; rows: [string, string][] }[] = [
  {
    category: 'Character classes',
    rows: [
      ['.', 'any character except newline'],
      ['\\w \\d \\s', 'word, digit, whitespace'],
      ['\\W \\D \\S', 'not word, digit, whitespace'],
      ['[abc]', 'any of a, b, or c'],
      ['[^abc]', 'not a, b, or c'],
      ['[a-g]', 'character between a & g']
    ]
  },
  {
    category: 'Anchors',
    rows: [
      ['^abc$', 'start / end of the string'],
      ['\\b \\B', 'word, not-word boundary']
    ]
  },
  {
    category: 'Escaped characters',
    rows: [
      ['\\. \\* \\\\', 'escaped special characters'],
      ['\\t \\n \\r', 'tab, linefeed, carriage return']
    ]
  },
  {
    category: 'Groups & lookaround',
    rows: [
      ['(abc)', 'capture group'],
      ['\\1', 'backreference to group #1'],
      ['(?:abc)', 'non-capturing group'],
      ['(?=abc)', 'positive lookahead'],
      ['(?!abc)', 'negative lookahead']
    ]
  },
  {
    category: 'Quantifiers & alternation',
    rows: [
      ['a* a+ a?', '0 or more, 1 or more, 0 or 1'],
      ['a{5} a{2,}', 'exactly five, two or more'],
      ['a{1,3}', 'between one & three'],
      ['a+? a{2,}?', 'match as few as possible'],
      ['ab|cd', 'match ab or cd']
    ]
  }
];

export function renderRegexHelper(onInsert: (snippet: string) => void): HTMLElement {
  let tab: 'common' | 'syntax' = 'common';
  let editing: number | 'new' | null = null;
  const body = el('div', {});
  const tabsEl = el('div', { className: 'helpertabs' });
  // Populated fresh each `renderCommonTab()` call — used only to visually highlight an existing row when
  // the add/edit form detects it's a duplicate (see `checkDuplicate` below). `el()`'s builder assigns
  // props as plain JS properties, not HTML attributes, so a `data-*` + `querySelector` approach doesn't
  // work here — a direct element reference does.
  let rowElements = new Map<number, HTMLElement>();

  /** Live duplicate-check for the add/edit form — warns AND visually highlights the existing matching
   *  row (never blocks; the tester may genuinely want a near-duplicate variant). `excludeIndex` is the
   *  entry being edited itself, so editing a snippet never flags itself as a duplicate of itself. */
  function renderEditForm(initial: CommonSnippet, index: number | 'new'): HTMLElement {
    const labelInput = el('input', { value: initial.label, placeholder: 'e.g. upiRefNo' });
    const snippetTa = el('textarea', {
      rows: 2,
      value: initial.snippet,
      placeholder: '(?<fieldName>...)',
      style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '10px' }
    });
    const warnBox = el('div', {});
    function checkDuplicate() {
      for (const row of rowElements.values()) row.classList.remove('dup');
      const dupIndex = isDuplicateSnippet(
        { label: labelInput.value, snippet: snippetTa.value },
        index === 'new' ? undefined : index
      );
      if (dupIndex === null) {
        warnBox.replaceChildren();
        return;
      }
      const existingRow = rowElements.get(dupIndex);
      existingRow?.classList.add('dup');
      // Optional chained call, not just optional access — `scrollIntoView` isn't implemented in every
      // environment (jsdom notably lacks it), and letting it throw here would abort the rest of this
      // duplicate check (including the warning text actually being set), a real functional gap, not just
      // a test-environment quirk.
      existingRow?.scrollIntoView?.({ block: 'nearest' });
      warnBox.replaceChildren(
        el('div', { className: 'regexstatus err' }, [
          el('i', { className: 'ti ti-alert-triangle' }),
          ` This exact pattern already exists as "${effectiveSnippets()[dupIndex]?.label ?? ''}" (highlighted below).`
        ])
      );
    }
    snippetTa.addEventListener('input', checkDuplicate);
    checkDuplicate();
    const saveBtn = el('div', { className: 'formbtn primary' }, ['Save']);
    saveBtn.addEventListener('click', () => {
      if (!labelInput.value.trim() || !snippetTa.value.trim()) return;
      saveSnippet(index, { label: labelInput.value.trim(), snippet: snippetTa.value.trim() });
      editing = null;
      renderCommonTab();
    });
    const cancelBtn = el('div', { className: 'formbtn ghost' }, ['Cancel']);
    cancelBtn.addEventListener('click', () => {
      editing = null;
      renderCommonTab();
    });
    return el('div', { className: 'snippet-editform' }, [
      el('div', { className: 'formfield' }, [el('label', {}, ['Label']), labelInput]),
      el('div', { className: 'formfield' }, [el('label', {}, ['Snippet']), snippetTa]),
      warnBox,
      el('div', { className: 'formbtnrow' }, [cancelBtn, saveBtn])
    ]);
  }

  function renderCommonTab() {
    rowElements = new Map<number, HTMLElement>();
    const nodes: HTMLElement[] = [el('div', { className: 'htitle' }, ['Insert at cursor'])];
    effectiveSnippets().forEach((s, i) => {
      if (editing === i) {
        nodes.push(renderEditForm(s, i));
        return;
      }
      const kindPill = isSnippetCustom(i)
        ? el('span', { className: 'minipill draft' }, ['custom'])
        : isSnippetModified(i)
          ? el('span', { className: 'minipill modified' }, ['edited'])
          : null;
      const row = el('div', { className: 'snippetrow' }, [
        el('span', { className: 'lbl' }, [el('b', {}, [s.label]), ...(kindPill ? [' ', kindPill] : [])]),
        el('span', { className: 'insrt' }, ['+ insert'])
      ]);
      rowElements.set(i, row);
      row.addEventListener('click', () => onInsert(s.snippet));
      const code = el('div', { className: 'cheatcode' }, [s.snippet]);
      const editLink = el('span', { className: 'paperlink' }, ['Edit']);
      editLink.addEventListener('click', (e) => {
        e.stopPropagation();
        editing = i;
        renderCommonTab();
      });
      const links = [editLink];
      if (isSnippetCustom(i)) {
        const deleteLink = el('span', { className: 'paperlink danger' }, ['Delete']);
        deleteLink.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteCustomSnippet(i);
          renderCommonTab();
        });
        links.push(deleteLink);
      }
      const linksRow = el('div', { className: 'snippetlinks' }, links);
      linksRow.addEventListener('click', (e) => e.stopPropagation());
      nodes.push(row, code, linksRow);
    });
    const addBtn = el('div', { className: 'addtplbtn', style: { marginTop: '4px' } }, ['+ Add a common pattern']);
    addBtn.addEventListener('click', () => {
      editing = 'new';
      renderCommonTab();
    });
    nodes.push(addBtn);
    if (editing === 'new') nodes.push(renderEditForm({ label: '', snippet: '' }, 'new'));
    body.replaceChildren(...nodes);
  }

  function renderSyntaxTab() {
    body.replaceChildren(
      ...REGEX_SYNTAX_CHEATSHEET.flatMap(({ category, rows }) => [
        el('div', { className: 'htitle' }, [category]),
        el(
          'div',
          { className: 'cheatgrid2' },
          rows.flatMap(([k, v]) => [el('span', { className: 'k' }, [k]), el('span', { className: 'v' }, [v])])
        )
      ])
    );
  }

  function renderBody() {
    editing = null;
    if (tab === 'common') renderCommonTab();
    else renderSyntaxTab();
  }

  function renderTabs() {
    const commonTab = el('div', { className: `helpertab${tab === 'common' ? ' active' : ''}` }, ['Common patterns']);
    commonTab.addEventListener('click', () => {
      tab = 'common';
      renderTabs();
      renderBody();
    });
    const syntaxTab = el('div', { className: `helpertab${tab === 'syntax' ? ' active' : ''}` }, ['Regex syntax']);
    syntaxTab.addEventListener('click', () => {
      tab = 'syntax';
      renderTabs();
      renderBody();
    });
    tabsEl.replaceChildren(commonTab, syntaxTab);
  }

  renderTabs();
  renderBody();
  return el('div', { className: 'helper' }, [tabsEl, body]);
}

export function insertAtCursor(textarea: HTMLTextAreaElement, snippet: string): void {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
  const pos = start + snippet.length;
  textarea.focus();
  textarea.setSelectionRange(pos, pos);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Pattern textarea + live syntax status + the unrecognized-group-name warning, paired with the regex
 *  helper panel — one shared layout used by both the "edit an existing template" form and the "add a new
 *  template" form. `extraLeftFields` (the Test sender/Test message body fields, in practice) render
 *  BELOW the pattern field in this same left column, filling the space the helper panel's own taller
 *  content already occupies on the right — rather than needing their own separate full-width row further
 *  down the modal. */
export function renderPatternFieldWithHelper(
  textarea: HTMLTextAreaElement,
  status: HTMLElement,
  warning: HTMLElement,
  extraLeftFields: HTMLElement[] = []
): HTMLElement {
  return el('div', { className: 'helperwrap' }, [
    el('div', { className: 'field' }, [
      el('div', { className: 'formfield' }, [
        el('label', {}, ['Regex pattern (amount, acctLast4, cardLast4, counterparty, ref, balance, dateStr)']),
        textarea,
        status,
        warning
      ]),
      ...(extraLeftFields.length > 0 ? [el('div', { className: 'field-extra' }, extraLeftFields)] : [])
    ]),
    renderRegexHelper((snippet) => insertAtCursor(textarea, snippet))
  ]);
}

// ── Template edit/add form fields — shared shape between the "edit existing" and "add new" modal bodies ─

export interface TemplateFormFields {
  typeSelect: HTMLSelectElement;
  dateFormatInput: HTMLInputElement;
  labelInput: HTMLInputElement;
  patternTa: HTMLTextAreaElement;
  patternStatus: HTMLElement;
  /** Shown when the pattern's own named group(s) include a name the real parser doesn't recognize —
   *  see `findUnrecognizedGroupNames()`. Populated by the caller's own live-preview update, not here. */
  patternWarning: HTMLElement;
}

export function buildTemplateFormFields(template: {
  transactionType: SmsTransactionType;
  dateFormat?: string;
  addedAt: string;
  pattern: string;
}): TemplateFormFields {
  const typeSelect = el(
    'select',
    {},
    (['debit', 'credit', 'upi_sent', 'upi_received', 'card_swipe', 'refund'] as SmsTransactionType[]).map((t) =>
      el('option', { value: t, selected: t === template.transactionType }, [t])
    )
  );
  const dateFormatInput = el('input', { value: template.dateFormat ?? '', placeholder: 'e.g. DD-MMM-YY' });
  const labelInput = el('input', { value: template.addedAt, placeholder: 'your own note, like addedAt' });
  const patternTa = el('textarea', {
    rows: 4,
    value: template.pattern,
    placeholder: 'Rs\\.?(?<amount>[\\d,]+\\.?\\d*) debited...'
  });
  const patternStatus = el('div', { className: 'regexstatus ok' }, [
    el('i', { className: 'ti ti-circle-check' }),
    ' Valid regex syntax'
  ]);
  const patternWarning = el('div', {});
  return { typeSelect, dateFormatInput, labelInput, patternTa, patternStatus, patternWarning };
}

export function currentTemplateFromFields(fields: TemplateFormFields, fallbackLabel: string): SmsTemplateEntry {
  return {
    transactionType: fields.typeSelect.value as SmsTransactionType,
    addedAt: fields.labelInput.value.trim() || fallbackLabel,
    pattern: fields.patternTa.value,
    ...(fields.dateFormatInput.value.trim() ? { dateFormat: fields.dateFormatInput.value.trim() } : {})
  };
}

// Re-exported so callers that need to show a live regex preview don't need a separate import for the one
// highlighting call every template-edit/add form makes.
export { highlightedPattern };
