# SMS Parser Verifier

A standalone, offline HTML page for testing Penny's SMS-transaction parser
(`packages/core/src/core/sms-import/smsParser.ts`) against real bank messages — without needing the
app, a device, or any code. Built for testers with years of real bank SMS history to quickly find gaps
in the pattern library (`smsPatterns.ts`) before real-device rollout.

## For testers — just open the file

**`sms-parser-verifier.html`** in this folder is the whole tool. Download it and open it in any browser
— no install, no server, no internet connection needed.

**Nothing you paste into it is ever transmitted anywhere.** It runs the exact same parsing code the real
app uses, entirely in your browser. There's no server behind the page at all.

A light, three-column "Unified Workspace" layout, built around testing thousands of real messages per
bank as the primary case, not an edge case:

- **Left sidebar** — a pinned **⚡ Bulk test — all banks** entry, then every configured bank (with a
  pass-rate dot and minipills for new/modified/draft/disabled counts), then **+ New bank…**, then
  Export/Import. Drag its right edge to resize.
- **Middle column** — test input + results ONLY for whatever's selected in the sidebar (paste or upload a
  `.txt` file, ▸ Test/Parse, then a paginated, searchable, filterable results table). Nothing here is
  templates or sender patterns — that's all in the right panel, so this column stays dedicated entirely to
  running real messages through the parser at scale (chunked parsing with a live progress bar, not one
  blocking loop). Clicking Test/Parse with nothing pasted (and no file uploaded) shows a clear inline
  error instead of rendering an empty results block.
- **Right panel** — a read-only-at-a-glance reference for whichever bank is selected: its **Sender ID
  patterns** (official ones locked 🔒, plus any you've added — checked live against every other bank's
  patterns and flagged, not blocked, if they'd overlap) and every configured **template**, shown as a
  "paper" card with its regex and sample message side by side, both color-coded (every distinct capture
  group gets its own color automatically, not just a fixed few — see below) so you can trace exactly which
  part of the regex produced which highlighted part of the message, plus a matched/no-match pill. Each
  card has **Copy regex** / **Edit** / **Disable** (or **Enable**, if already disabled — dims the template
  and excludes it from testing without deleting it, one click to bring back) / **Delete** (draft templates
  only). Drag the panel's left edge to resize it.

**Editing/adding a template or sender pattern always opens a popup** (never displaces the reference panel
or the test column) — every popup can be resized by dragging its bottom-right corner if you want more
room. The template popup:

- Transaction type / date format / label share one row; the regex pattern field sits next to the regex
  helper panel, with **Test sender** / **Test message body** underneath the pattern field (in the same
  column) so you can see a live, color-coded preview of your in-progress regex re-tested against a real
  message as you type. Reopening a template you've already tested brings back whatever you last tested it
  with — it's saved as that template's own reference sample.
- If your regex names a capture group the real parser doesn't recognize (only `amount`, `acctLast4`,
  `cardLast4`, `counterparty`, `ref`, `balance`, `dateStr` are read into a parsed transaction) — a warning
  tells you so directly. A group like that still compiles and still highlights in the pattern preview
  here, but its value is silently dropped in production: never extracted, never highlighted in a real test
  message — this warning is the actual explanation, not a silent mystery.
- The **Common patterns** tab (in the regex helper panel) is fully editable, not just a fixed reference
  list: **+ Add a common pattern** catalogs your own reusable snippet; every entry (built-in or your own)
  has an **Edit** link; typing an exact duplicate of an existing snippet warns you and highlights the
  existing match, rather than silently letting you add a second copy of the same thing. After you save a
  template, if its regex used a capture-group sub-pattern that isn't in the library yet, you're offered a
  one-click "+ Add to Common Patterns" for it, so the next tester who reaches for the helper panel doesn't
  have to retype it from scratch.

- **Bulk test — all banks** (the pinned sidebar entry) — for testing a large, mixed real-world corpus
  across every bank's sender-matching at once, same paste/upload + filter tabs (All / Parsed / Partial /
  Unrecognized / Excluded) in the middle column's results table. Every row shows the full, un-truncated
  message text (wraps rather than crops), a Sender column colored green/red by whether it was recognized,
  a Bank column, a compact colored **trace-strip** (● matched / ● tried, no match / ○ not attempted) so
  you can scan hundreds of rows without expanding each one, and a copy icon right next to the message text
  itself. Only Partial/Unrecognized/Excluded rows expand further, for the full trace, field chips, and (for
  an unrecognized sender) a **"Did you mean [bank]?"** suggestion when the sender looks like a near-miss of
  a configured pattern, one click away from being added. "Copy (redacted)"/"Copy (unredacted)" export the
  currently-filtered rows as plain text — redacted masks every digit and is the one to reach for by
  default; unredacted keeps the real numbers, only for when you actually mean to share raw data.

- **Senders in this batch** (above the results table) — one card per distinct sender actually present,
  sorted by message count so the sender most worth a decision shows first: a TRAI header-category badge
  (T/S/P/G, from the sender's own `-T`/`-S`/`-P`/`-G` suffix, per the 6-May-2025 mandate), "View all"
  (fills the search box with that sender — the drill-down for "is this sender's whole batch actually
  legit?"), and "Exclude sender"/"Include" per card. A `-P`/`-G` sender auto-buckets into Excluded (with
  a reversible "🤖 Auto-excluded" note — suffix categorization isn't guaranteed accurate) since a
  Promotional/Government message is essentially never a real transaction; `-S`/`-T` never auto-exclude,
  since real bank transaction alerts commonly register as Service, not just Transactional. Every
  Partial/Unrecognized row also gets a "🚫 Not a transaction — exclude this message" action (for a
  sender that mixes real transactions with noise, where excluding the whole sender would wrongly hide
  the real ones too) alongside "🚫 Exclude sender entirely" — both undoable from the same expanded row.
  This is the split between "a real coverage gap, worth a new template" (Partial) and "not a
  transaction at all, no template should exist for this" (Excluded) that the stat strip previously
  conflated.

- **A bank's page** (selected from the sidebar) gives you a tester scoped to just that bank, with a
  toggle: **Auto-detect sender** (real app behavior — the sender must match this bank's patterns first) or
  **Force against this bank's templates** (skips the sender gate entirely, so you can check "does the
  message body match" independently of "is this sender recognized yet"). Results land in the same table
  described above. The bank's own sender patterns and templates live in the right panel, not on this page.

- **Export / Import** (sidebar footer, or a bank-scoped "Export this bank only" button on its page) —
  Export dumps the current effective bundle (every official bank, every override, every draft/new bank/
  template) as JSON, confirmed identical in shape to `workers/api-proxy`'s real `/sms-patterns` response —
  copy or download it directly, no reshaping needed to hand to a developer. Import accepts a same-shaped
  JSON (paste or upload) and merges it into your own session's drafts — useful for two testers handing off
  work without re-doing each other's edits by hand.

## For developers — module layout

The tool's own code (bundled by esbuild, not shipped product code) is split into focused modules rather
than one long file, so an edit only ever touches the one piece it actually concerns:

- **`state.ts`** — zero dependency on any rendering code. Session persistence (`localStorage`, key
  `smsVerifierSessionV2`), the official+session merge (`effectiveBundle()`/`effectiveBundleForTesting()`),
  and the Common Patterns library (`BUILTIN_SNIPPETS`/`effectiveSnippets()`/`saveSnippet()`/
  `deleteCustomSnippet()`) — additive/session-override only, same convention as templates.
- **`dom.ts`** — the `el()` DOM builder, clipboard copy (with a legacy `execCommand` fallback, since
  `navigator.clipboard` isn't guaranteed available from a `file://`-opened page), file download, toast.
- **`highlighting.ts`** — the one shared "wrap ranges in colored `<mark>`" primitive
  (`markedNodes()`), used for both a matched message's capture offsets and a regex pattern's own named-
  group spans. Colors are assigned dynamically per distinct group name (not just a fixed handful) — a
  known field name always gets the same color; an unrecognized one still gets a real, distinct color
  rather than rendering uncolored.
- **`regexAuthoring.ts`** — regex compile-validity checks, the fuzzy "did you mean"/sender-overlap
  heuristics, the regex helper panel (editable Common Patterns tab + the syntax cheat sheet), and
  `findUnrecognizedGroupNames()`/`findUncatalogedGroupPatterns()` (power the two warnings/suggestions
  described above).
- **`entry.ts`** — the orchestrator: sidebar, right panel, all modals, the results table, top-level
  render/mount. Imports from all of the above; owns no data of its own beyond local UI closures.

## For developers — rebuilding after a pattern change

Whenever `packages/core/src/core/sms-import/{smsParser,smsPatterns,smsSampleMessages}.ts` changes,
regenerate and re-commit the HTML file:

```sh
pnpm build:sms-verifier
```

This bundles the **real** production parser + pattern data (via `scripts/build-sms-verifier.mjs`,
esbuild) into the single static file — there is exactly one copy of the matching logic; nothing here is
a hand-duplicated version that can drift.

`packages/core/src/core/sms-import/smsSampleMessages.ts` holds the synthetic example messages a bank's
page pairs with each OFFICIAL template (one/two per template) — this is a deliberate, low-risk duplicate
of the same synthetic strings already in `packages/core/tests/sms-import/smsParser.test.ts` (not a shared
import, to avoid touching already-verified passing tests); update both if you add a sample for a new
template. A newly-drafted template has no original sample (it's brand new) — verify it against the "Test
against this bank" section instead.

Everything a tester adds/edits (new banks, extra sender patterns, template overrides, new templates) is
session state, persisted to `localStorage` (key `smsVerifierSessionV2`) so it survives a reload — it's
never written to any file on its own. Use the sidebar's **Export** action to turn it into a real,
worker-compatible JSON snippet to hand to a developer.

## Workflow this is designed for

1. Harden the pattern library entirely offline, using this tool against the bundled fallback
   (`SMS_PATTERNS_FALLBACK`) — no Cloudflare Worker deployment needed for this step at all.
2. Once real-world testing surfaces gaps (bank X's older wording doesn't match, a sender variant isn't
   configured yet, etc.), fix it right there in the tool — edit/add a template, add a sender pattern — and
   re-test immediately against the same messages.
3. Use **Export** (sidebar) to get the final pattern set as JSON, and either paste it into
   `smsPatterns.ts`/`workers/api-proxy/src/smsPatterns.ts` by hand, or diff it against what's already
   there — the export is confirmed identical in shape to both files' `SmsPatternBundle`/
   `SMS_PATTERN_BUNDLE`, no reshaping needed.
4. Only once the pattern set is solid, deploy `workers/api-proxy`'s `/sms-patterns` route (`npx wrangler
deploy` from `workers/api-proxy/`) — the "Pattern source" control at the top of the tool can fetch and
   test against a live/local worker URL directly, to confirm the deployed version matches before relying
   on it.

## Not part of the normal build/lint sweep

This tool isn't shipped product code (not `apps/mobile` or `apps/web-react`), so it's outside the
repo's normal `tsc -b`/`pnpm lint` workspace graph. `tools/sms-parser-verifier/tsconfig.json` exists
purely so a developer can run `npx tsc --noEmit -p tools/sms-parser-verifier` after editing `entry.ts`
to catch type errors — esbuild itself only transpiles, it doesn't type-check.
