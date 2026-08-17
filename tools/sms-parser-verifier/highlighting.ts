// Capture-group highlighting — one shared primitive (`markedNodes()`) for BOTH a matched message's
// capture offsets AND a regex pattern's own named-group spans, so there's exactly one "wrap ranges in
// colored <mark>" loop in the whole tool, not two. Zero dependency on the tool's mutable state.
import type { SmsTemplateTraceEntry, SmsCaptureGroupName } from '@/core/sms-import/smsParser';
import { el } from './dom';

/** Preferred colors for the parser's own recognized capture-group names — kept stable across every
 *  template so e.g. `account` always reads the same everywhere. `amount` maps to `''` (the default/
 *  unclassed `<mark>`, colored green by its base CSS rule) rather than being absent from this map. */
const GROUP_COLOR_CLASS: Record<SmsCaptureGroupName, string> = {
  amount: '',
  account: 'f2',
  card: 'f2',
  counterparty: 'f3',
  reference: 'f4',
  balance: 'f5',
  date: 'f6'
};
const COLOR_PALETTE = ['', 'f2', 'f3', 'f4', 'f5', 'f6'];

/** A tester's own regex can name a capture group anything (`(?<acct>...)` instead of `account`) — the
 *  real parser only reads the fixed names above (see `CAPTURE_GROUP_NAMES` in `smsParser.ts`), but the
 *  PATTERN preview itself should never leave an unrecognized name uncolored just because it isn't one of
 *  them (that reads as "broken", not as the actual signal — "this field won't be captured in
 *  production," which the regex-authoring warning surfaces explicitly instead). Every custom name still
 *  gets a real, distinct color the first time it's seen, remembered for the rest of the session so the
 *  same name always renders the same color everywhere it appears. */
const customGroupColors = new Map<string, string>();
let nextCustomColorIndex = 0;
function colorClassFor(name: string): string {
  const known = GROUP_COLOR_CLASS[name as SmsCaptureGroupName];
  if (known !== undefined) return known;
  let assigned = customGroupColors.get(name);
  if (assigned === undefined) {
    assigned = COLOR_PALETTE[nextCustomColorIndex % COLOR_PALETTE.length] ?? '';
    nextCustomColorIndex++;
    customGroupColors.set(name, assigned);
  }
  return assigned;
}

export interface NamedSpan {
  name: string;
  start: number;
  end: number;
}

/** Locates every `(?<name>...)` group's start/end offsets directly in a regex SOURCE string — a static
 *  parse (balanced-paren walk), not a runtime match. This is what lets the regex pattern itself be
 *  colorized the same way a matched message is, so a template card can show "this part of the regex" next
 *  to "this part of the message it produced" in the same colors. */
export function findNamedGroupSpans(pattern: string): NamedSpan[] {
  const spans: NamedSpan[] = [];
  const startRe = /\(\?<([a-zA-Z_][a-zA-Z0-9_]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(pattern))) {
    const name = m[1];
    if (!name) continue;
    const groupStart = m.index;
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < pattern.length && depth > 0; i++) {
      const c = pattern[i];
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    spans.push({ name, start: groupStart, end: i });
  }
  return spans;
}

export function markedNodes(text: string, ranges: NamedSpan[]): (Node | string)[] {
  const nodes: (Node | string)[] = [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const { name, start, end } of sorted) {
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const mark = el('mark', { className: colorClassFor(name) });
    mark.textContent = text.slice(start, end);
    nodes.push(mark);
    cursor = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function captureRangesToSpans(captureRanges: SmsTemplateTraceEntry['captureRanges']): NamedSpan[] {
  if (!captureRanges) return [];
  return (Object.entries(captureRanges) as [SmsCaptureGroupName, [number, number] | undefined][])
    .filter((entry): entry is [SmsCaptureGroupName, [number, number]] => !!entry[1])
    .map(([name, [start, end]]) => ({ name, start, end }));
}

/** A matched (or unmatched) message body, highlighted — thin wrapper over `markedNodes()`. */
export function highlightedText(body: string, captureRanges: SmsTemplateTraceEntry['captureRanges']): HTMLElement {
  const container = el('div', { className: 'smstext' });
  container.append(...markedNodes(body, captureRangesToSpans(captureRanges)));
  return container;
}

/** A regex PATTERN, highlighted using its own named-group spans — same colors, same primitive, applied to
 *  the pattern's source text instead of a matched message. */
export function highlightedPattern(pattern: string): HTMLElement {
  const container = el('div', { className: 'paperregex' });
  container.append(...markedNodes(pattern, findNamedGroupSpans(pattern)));
  return container;
}

/** Authoring-only variant of `highlightedText()` — while actively writing/testing a template (the
 *  modal's own live preview), a custom-named group (`(?<acct>...)` instead of `account`) should still
 *  visibly highlight, so a tester can actually SEE their own regex is matching what they intended,
 *  instead of it silently looking broken. `captureRanges` (the real production trace) is authoritative
 *  for the 7 recognized names; any OTHER named group the pattern defines is highlighted too, computed
 *  directly from a fresh exec against `body` — this is deliberately NOT used anywhere the tool shows a
 *  saved/production-accurate result (the right panel's papercard sample, the results table), where only
 *  what the real parser actually extracts should ever appear highlighted. */
export function highlightedTextForAuthoring(
  body: string,
  pattern: string,
  captureRanges: SmsTemplateTraceEntry['captureRanges']
): HTMLElement {
  const known = captureRangesToSpans(captureRanges);
  const knownNames = new Set(known.map((s) => s.name));
  let extra: NamedSpan[] = [];
  try {
    const m = new RegExp(pattern, 'di').exec(body) as
      (RegExpExecArray & { indices?: { groups?: Record<string, [number, number]> } }) | null;
    const groups = m?.indices?.groups;
    if (groups) {
      extra = Object.entries(groups)
        .filter((entry): entry is [string, [number, number]] => !!entry[1] && !knownNames.has(entry[0]))
        .map(([name, [start, end]]) => ({ name, start, end }));
    }
  } catch {
    // Invalid regex — `known` (empty, since a real trace couldn't have been computed either) is enough.
  }
  const container = el('div', { className: 'smstext' });
  container.append(...markedNodes(body, [...known, ...extra]));
  return container;
}

/** Same highlighting, for a dense table cell (Bulk test / bank-scoped tester results) — the Message
 *  column renders the real highlighted text directly, not flat gray, per real-usage feedback that
 *  expanding every row just to see this was too much friction at scale. `trailing` (e.g. a per-row copy
 *  icon) renders inside the SAME cell, next to the text it acts on, rather than as its own column — the
 *  text itself sits in an inner `.msgtext` span so its own ellipsis-truncation doesn't fight whatever
 *  `trailing` element sits beside it. */
export function markedTableCell(
  text: string,
  captureRanges: SmsTemplateTraceEntry['captureRanges'],
  trailing?: HTMLElement
): HTMLElement {
  const td = el('td', { className: 'msgcell' });
  const textSpan = el('span', { className: 'msgtext' });
  textSpan.append(...markedNodes(text, captureRangesToSpans(captureRanges)));
  td.append(textSpan);
  if (trailing) td.append(trailing);
  return td;
}

// `fieldChips()` (a labeled-chip legend below the regex/sample) was removed 2026-08-18 once the template
// card's regex and sample got distinct per-field colors matched between the two — the chips existed only
// to translate those colors back into field names, which the color pairing itself now does directly.
