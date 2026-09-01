# SMS-Based Transaction Tracking

## What it is

An Android-only, off-by-default feature that reads bank transaction SMS on your phone and turns
them into draft transactions automatically — a third way to record a transaction in Penny,
alongside typing one in by hand and importing a CSV/Excel file. It exists for the same reason CSV
import does: so the user doesn't have to type in every transaction manually, but for banks/UPI
activity that never shows up in a monthly statement export.

This is a deliberately separate feature from [Bank Statement Import](bank-import.md), not a
variant of it — Bank Statement Import reconciles whichever transactions already exist (recorded
manually, via CSV, or via SMS) against the bank's own official statement; SMS Tracking is one of
the ways a transaction gets recorded in the first place. Full design rationale — every scenario
considered, every decision and why, the two-tier matching model, the account-mapping design, the
privacy model — is in [`docs/plans/sms-transaction-tracking.md`](../plans/sms-transaction-tracking.md).

## User-facing capabilities

- Turn SMS Tracking on/off from **Settings → SMS Tracking** — off by default, matching Safe Mode's
  own privacy-first default. Turning it on shows a "why we need this" explainer (instant capture,
  on-demand backfill, everything-stays-on-device, always-in-control) before Android's own
  permission dialog ever appears.
- After granting permission, choose whether to scan the last 3 months (recommended default),
  a custom date range, or skip history entirely and only track new messages from now on.
- **"Scan a date range" is a standing action**, not just a first-time setup step — usable any time
  later (e.g. after restoring a backup, or to fill a gap).
- A **review queue** (Linked / Needs Review / New Pending / Ignored) — an ongoing inbox, not a
  one-shot wizard. An SMS that matches something already recorded shows up **linked**, never as a
  silent duplicate; the linked transaction itself is never edited, only the link is recorded. An
  SMS with no match becomes a **New Pending** item with category/account/payment-mode pre-filled
  (learned per-merchant the same way every other recording method already does), fully editable
  before it becomes a real transaction.
- **Needs Review** surfaces four distinct situations, each explained rather than guessed at: an
  ambiguous account (which of your accounts is this bank SMS for?), a possible match against an
  existing transaction (shown side-by-side, your call), a possible duplicate SMS (two messages that
  might describe the same real event — never auto-merged), and a reconciled-date conflict (the
  matched transaction is already bank-reconciled and the SMS's own date disagrees — surfaced, never
  silently overridden).
- A persisted **sender/card → account mapping list**, editable any time — resolved once per
  sender/card, remembered afterward, never re-guessed every scan.
- An **Unparsed Messages** screen: any SMS from a bank Penny recognizes that didn't match a known
  message format is kept here — visible, expandable, copyable (digit-masked by default, with an
  explicit "copy unmasked" escape hatch), and exportable — rather than silently dropped the way most
  SMS-tracking apps handle a parse failure. Grouped by sender into collapsed-by-default accordions
  (2026-08-17), sorted by message count so the sender most worth a decision surfaces first.
- **Sender exclusion** (2026-08-17) — a real coverage gap (recognized bank, wrong wording — worth a
  new template) is a genuinely different thing from a message that's simply never a transaction at all
  (a promotional offer, a KYC-reminder, an account-statement ping). "Exclude sender," available per
  group on the Unparsed Messages screen, durably marks a sender as never-a-transaction — its _next_
  non-transactional message never resurfaces a fresh "needs review" record either, unlike the existing
  per-message "Dismiss"/"Dismiss all" (which only clears what's already been created). Reversible any
  time from that same screen's "Excluded senders" list.
- Not available on iOS or the web target — neither exposes an SMS-reading API to any app. The
  Settings row explains this rather than showing a dead toggle.

## How it works

**Core logic** (`packages/core/src/core/sms-import/`) — a deliberately separate module from
`core/bank-import/` and `core/import/`, reusing only the matching _algorithm_ shape from
`core/bank-import/matcher.ts` (`matchesDirection` is shared, generalized to a minimal structural
type), never its types or role:

- `smsPatterns.ts` — the parsing template bundle (`SmsPatternBundle`), fetched from a small,
  mostly-static Cloudflare Worker route (`/sms-patterns` on `workers/api-proxy`, mirroring
  `/epf-rates`'s exact shape) so a bank changing its SMS wording is a backend redeploy, not an app
  release. **Only the templates cross the network** — a bundled `SMS_PATTERNS_FALLBACK` covers the
  ~12 most common Indian banks so parsing works fully offline, including on first install. Bank SMS
  wording drifts over the years with no authoritative public catalog to build against, so
  `templates` is a growing, append-only list per bank (current-era + older-era entries where known)
  rather than one fixed template — see that file's own doc comment.
- `smsParser.ts` — `parseSms()` matches a raw SMS against the bundle, returning a discriminated
  outcome: parsed, unparsed-but-recognized-bank, unrecognized sender, or excluded-as-OTP. Also
  `redactDigits()` for the Unparsed Messages screen's masked-by-default copy/export.
- `smsAccountMatch.ts` — `resolveSmsAccount()`'s matching order: a persisted card-last4 mapping →
  a persisted bank-string mapping → an exact `Account.last4` match → a single-account `bankId`
  match → a fuzzy `Account.name` match (reusing `core/import/importAccountResolution.ts`'s
  `normalize()`) → otherwise ambiguous, surfaced for a one-time user prompt that gets remembered.
- `smsTransactionMatch.ts` — `matchSmsAgainstExpenses()` (Tier-2 fuzzy match, ±1 day window,
  tighter than Bank Statement Import's ±3 days since an SMS arrives same-day) and
  `findPossibleDuplicateSms()` (the SMS-vs-SMS case). Tier-1 exact-provenance dedup
  (`SmsTransactionRecord.contentHash`) is the caller's own lookup.
- `processRawSms.ts` — `processRawSmsCore()`/`deriveStatusForAccount()`: the single, shared
  "what happens when one raw SMS needs to become a record" pipeline, callable from both a React
  hook and a Headless JS task with no React tree (see Mobile section). Checks
  `ProcessRawSmsContext.excludedSenders` before parsing at all (2026-08-17) — a durably-excluded
  sender is dropped exactly like an unrecognized one, never persisted, regardless of whether the
  body would otherwise have structurally matched a template.

**Data model** (`docs/SCHEMA.md`'s "SMS-Based Transaction Tracking" section has full field tables):
`sms_transactions` (one row per parsed-or-attempted SMS, `status`: unparsed/needs_review/ready/
linked/dismissed), `sms_account_mappings` (the persisted sender/card→account mapping), and
`sms_excluded_senders` (senders durably marked never-a-transaction, added v15). All
`EncryptedRepository`-backed. `Account` gained two new optional fields, `bankId`/`last4`, feeding the
account-matching order above.

**Privacy**: raw SMS text is retained only while a record is `unparsed`/`needs_review`/`ready` (the
window where the user might need to see it), cleared once `linked`/`dismissed`. Nothing from this
feature ever reaches `buildUserContext()`/Chip — same PII pipeline as every other recording method.

## Mobile (`apps/mobile`)

Android-only; not present in the frozen `apps/web-react`. `apps/mobile/src/features/sms-tracking/`
holds the UI (`SmsTrackingSettingsPage.tsx`, `UnparsedMessagesPage.tsx`, `SmsReviewPage.tsx`,
`PossibleMatchPage.tsx`) and `useSmsTracking.ts` (the orchestration hook — a thin wrapper around
`processRawSmsCore`, never a second implementation of it).

**Native capture** (`apps/mobile/modules/expo-sms-capture/`) — Penny's first bespoke local Expo
Module (Kotlin, not a third-party package — off-the-shelf SMS libraries mostly stop at "hand you
the text," and the durable background-processing plumbing below is custom work regardless of the
base library):

- `SmsReceiver.kt` — a `BroadcastReceiver` on the protected `SMS_RECEIVED` system broadcast
  (registered via the `withSmsPermissions.js` config plugin), doing the absolute minimum Android's
  ~10s execution budget allows: persist to a small SharedPreferences-backed queue
  (`SmsQueueStore.kt`) and enqueue one `WorkManager` job. No parsing/DB work happens inline.
- `SmsProcessingWorker.kt` → `SmsHeadlessTaskService.kt` — `WorkManager` guarantees eventual
  execution (survives process death, Doze deferral, reboot); the worker starts a Headless JS task
  that drains the queue through `processRawSmsCore`, the exact same pipeline the manual "scan a
  date range" foreground path uses. The Headless JS task checks `keystore.isUnlocked()` first — a
  headless context spun up after the app process was fully killed has no Data Master Key available
  to decrypt anything, so it's a no-op in that case, and the native queue simply stays intact until
  the app's own next-foreground drain picks it up. Android 8+'s background-service-start
  restrictions can also legitimately reject the headless start attempt when the app is fully
  backgrounded — caught defensively, same fallback (never a lost message, only ever delayed).
- `ExpoSmsCaptureModule.kt` exposes `requestPermissionAsync`/`getPermissionStatusAsync` (permission
  request + revocation detection) and `queryInboxAsync` (backs the historical "scan a date range"
  capability) to JS via `apps/mobile/src/lib/smsCapture.native.ts`.

## Pattern-library verification tooling (2026-08-16, "Unified Workspace" redesign, latest pass 2026-08-18)

`tools/sms-parser-verifier/` — a standalone, offline HTML page (see its own README) for hardening the
parsing-template library before real-device rollout, without needing the app, a device, or any code.
Bundles the real `parseSms`/`traceSms`/`SMS_PATTERNS_FALLBACK` (via `pnpm build:sms-verifier`, esbuild
— one copy of the matching logic, no hand-duplicated version) into one dependency-free file: testers
with years of real bank SMS history can open it and paste their own messages directly, with **nothing
transmitted anywhere** (it's a static page with no server behind it at all).

A light, three-column layout built around testing thousands of real messages per bank as the primary
case: a left sidebar (banks + pinned "Bulk test — all banks", drag-resizable), a middle column dedicated
entirely to test input + a paginated/searchable/chunk-parsed results table (never templates or sender
patterns), and a right panel split into two independently-scrolling, drag-resizable sections — Templates
(top) and "Senders in this test" (bottom), separated by their own draggable divider. Bulk test collapses
this to just the Senders section, since there's no "current bank" to show templates for. Editing anything
— a template, a sender pattern, a new bank — always opens a resizable popup rather than displacing either
the reference panel or the test column.

- **Templates** are collapsed-by-default accordion cards — chevron, kind icon (official/modified/draft),
  label in `T1 (era/label)` form, the regex itself inline (truncated, hover for the full text), Copy/Edit
  icons, and a status icon, no text pills anywhere. Expanding shows the regex and its matched sample side
  by side, colors auto-assigned per distinct capture-group name rather than a fixed few, always the SAME
  color on both sides of the pair. A template can have MULTIPLE saved samples (2026-08-18 — one regex can
  genuinely match several differently-worded real messages) — a "Sample N of M ‹ ›" pager appears above
  the regex|sample grid once there's more than one, and the template modal's own "Test samples" section
  is a clickable list (add/remove/select which one you're editing) rather than a single box. Templates can
  be edited (official ones get a session-local override, never touching the real shipped data), added as
  drafts, disabled-without-deleting (dimmed but still visible for one-click re-enabling), or — for
  official/modified ones, since "some templates might not be good" — removed-without-deleting (hidden
  entirely, reversible from a compact "N removed — Restore" line; a draft's own Delete still truly
  deletes, since a draft has no official original to restore to). If a template's regex names a capture
  group the real parser doesn't recognize, the editor says so directly and highlights it in BOTH the live
  regex and test-message preview — so a tester can actually confirm their own pattern captures what they
  meant — while that field's value is still silently dropped in real production (never shown highlighted
  in a saved template's card or the results table, only in this in-progress preview) rather than leaving
  it a silent mystery.
- **Regex helper panel** — a "Common patterns" tab, fully editable (add your own, edit any entry, live
  duplicate detection before you add one) and sorted alphabetically, each entry showing a real matched
  example string and a clickable **"Used in N templates"** count that opens a popup listing every one
  (bank + template label; clicking a listed template navigates there and expands its card). After saving
  a template, an uncatalogued capture-group sub-pattern is offered a one-click "add to Common Patterns"
  for reuse by the next tester. The panel's own width is drag-resizable (2026-08-18 — was a fixed 260px,
  too narrow for a longer snippet/example).
- **Results table** (shared by Bulk test and the bank-scoped tester) shows the full, un-truncated message
  text, a sender-recognized/unrecognized color cue, a bank column, a compact colored trace-strip (one dot
  per template attempted), and a copy icon inline with the message — a row only expands further for
  Partial/Unrecognized/Excluded outcomes, where there's a genuine "did you mean `<bank>`?" nudge or
  add-a-template action to take. A checkbox per row (plus "select all visible" in the header) backs a
  bulk-exclude action bar (2026-08-18 — Exclude selected / Include selected / Clear selection), for
  excluding just some of one sender's messages at once rather than one at a time or the whole sender.
  Clicking Test/Parse with nothing to test shows a clear error instead of an empty results block.
- **Sender/message exclusion** (2026-08-17) — splits "Partial/Unparsed" into two genuinely different
  things: a real coverage gap (recognized bank, wrong wording — worth a new template) vs. not a
  transaction at all (OTP, promotional, government, non-financial service pings — no template should
  ever be written for these). A `-P`/`-G` TRAI header-suffix sender auto-bucket into Excluded
  (reversible — suffix categorization isn't guaranteed accurate); every other case is manual, both
  sender-wide ("Exclude sender entirely," for a sender that's never a transaction) and per-message (for
  a sender that mixes real transactions with noise). The right panel's "Senders in this test" section
  (2026-08-18: relocated out of a strip that used to sit above the results table, cluttering it on every
  page/filter change) groups every distinct sender into collapsible Included/Excluded sections (Excluded
  starts collapsed) and doubles as the "select a sender to see all its messages" drill-down — clicking a
  sender name (there or in the table itself) filters the table to just its rows via the existing search
  box. On a bank's own page, senders recognized as a DIFFERENT bank (or not recognized at all — possible
  in auto-detect mode) collapse behind their own "Show N senders from other/unrecognized banks" toggle,
  off by default, rather than cluttering that bank's own list.
- **Export / Import** — Export serializes the full effective bundle (official + every session
  override/draft), confirmed identical in shape to `workers/api-proxy`'s real `/sms-patterns` response,
  scoped to one bank or the whole set; Import merges a same-shaped JSON into the current session's drafts,
  letting two testers hand off work without redoing each other's edits.

The tool's own code is split into focused modules (`state.ts`/`dom.ts`/`highlighting.ts`/
`regexAuthoring.ts`/`entry.ts` — see the README) rather than one long file, specifically so a future edit
stays fast and low-risk instead of risking breakage in a single sprawling file.

Intended workflow: harden the pattern set entirely offline with this tool first (editing/adding templates
and re-testing in the same place a gap was found), export the final set as JSON, and only once it's solid
deploy `workers/api-proxy`'s `/sms-patterns` route — the tool's own "Pattern source" control can also
fetch and test against a live/local worker URL directly, to confirm a deployment matches before relying
on it.

**HDFC/IndusInd/HSBC replaced with a verified real-world template set (2026-08-18)** — the first real
instance of the discovery-loop workflow above: all three banks' templates were rewritten from real,
user-verified message wording (previously synthetic placeholders for HDFC; IndusInd and HSBC had only
one invented template each). The provided source regexes were kept as-given, not "cleaned up" — every
named group (currency, bank name, description, a receiving-side account number, transaction mode, etc.)
is preserved exactly as provided, even where this schema doesn't read it (it's simply not extracted,
same as any unrecognized name); `account`/`card` capture the FULL masked token as each bank's own SMS
wording presents it (e.g. IndusInd's `159***660960`, HSBC's `XXXXXX1234`), not a trimmed last-4-digit
substring — meaning `smsAccountMatch.ts`'s exact-string auto-linking against a stored account's plain
last-4 digits won't match for these three banks' real messages until that matcher is made
mask-tolerant, a known, accepted gap rather than something patched around in the regex itself. Three
HSBC wordings that used a single runtime-captured `credited|debited` choice were split into matched
pairs, since `transactionType` here is a fixed property per template, not something read at match time.
Only one genuine regex defect was fixed (not a stylistic change): HDFC's debit-card-alert wording was
missing an optional `On ` before "HDFC Bank" that 2 of its own 4 real sample messages actually have.

**Capture-group field names renamed to match the verified source's own convention (2026-08-18)** —
`SmsCaptureGroupName` (`smsParser.ts`) now uses `account`/`card`/`reference`/`date` (previously
`acctLast4`/`cardLast4`/`ref`/`dateStr`) across all 12 banks' templates, not just the three above —
Penny's own schema adopted the provided naming rather than the provided regexes being renamed to fit
Penny's prior schema. `ParsedSmsCandidate`'s own output field names (`accountLast4`, `cardLast4`,
`referenceNumber`, `date`) are a separate, already-decoupled layer and were not touched by this rename.

Real personal names/VPAs that appeared in the original source messages were swapped for placeholders
before any of this ever reached a file that gets committed — the pre-commit PII gate
(`scripts/check-pii.mjs`, `docs/PRIVACY.md`'s "Privacy architecture" §4) still caught one placeholder
that happened to be shaped exactly like a real IFSC code, which was reworked into something that
couldn't be mistaken for one, rather than bypassed.

## Current limitations

- **Not yet verified on a real device.** Everything here compiles and passes its own test suite
  (parser tests against a synthetic multi-bank/multi-era SMS corpus, account/transaction-matching
  unit tests, a real Gradle Kotlin compile), but actual on-device behavior — the OS permission
  dialog, `SmsReceiver` firing promptly, the WorkManager→Headless-JS hop under real battery/Doze
  conditions — has not been confirmed. No SMS-injection into an emulator is possible from a dev
  environment; this needs a real-device pass before relying on it day-to-day.
- Android only — no iOS/web equivalent exists or is planned (neither platform exposes an SMS API).
- The bundled parsing-template set covers roughly the dozen most common Indian banks' current-era
  wording. HDFC/IndusInd/HSBC are verified against real message wording (2026-08-18); every other
  bank's templates are still synthetic — fabricated to match each bank's documented public SMS
  conventions, not yet checked against a real message. A bank/format not yet covered surfaces as
  "unrecognized sender" (silently skipped, by design — showing/exporting arbitrary non-bank-sender text
  would be a bigger privacy overreach than this feature's scope) rather than a parse failure.
- No Play Store distribution decision has been finalized — the design accounts for Play's
  Restricted Permissions policy (see the plan doc §2), but the actual Restricted Permissions
  Declaration Form / Data Safety submission is a separate, later operational step, not something
  the app code does.
- Refunds/reversals aren't auto-matched to their original transaction — treated as an independent
  new credit; a future improvement could surface a "possible refund of →" hint.
- **Account/card auto-linking doesn't work for HDFC/IndusInd/HSBC's real-message wording.**
  `smsAccountMatch.ts` does exact-string matching against a stored account's plain last-4 digits, but
  these three banks' verified templates capture the full masked token as the bank's own SMS presents
  it (e.g. `159***660960`, `XXXXXX1234`) — never trimmed to match the matcher's expectation. A parsed
  transaction still gets created and is fully usable, it just won't auto-link to an existing account/
  card the way other banks' transactions do until the matcher itself is made mask-tolerant.
- **The local pattern cache has no version/hash check (confirmed 2026-08-18, not yet fixed).**
  `getSmsPatternBundle()` (`packages/core/src/core/sms-import/smsPatterns.ts`) checks the persisted
  `penny_sms_patterns_v1` AsyncStorage cache before ever attempting a network fetch or the baked-in
  fallback, and treats anything under 7 days old (`REFRESH_INTERVAL_MS`) as good enough — nothing
  compares it against what the current build actually ships. Installing an updated APK over an existing
  install (not uninstall-then-reinstall) preserves AsyncStorage, so a stale cached bundle from before an
  update can silently keep running against real messages for up to a week with no signal to the user.
  Reproduced directly on-device: HDFC/IndusInd/HSBC's real-verified templates (above) landed real
  messages in "Unparsed" on a device whose earlier install had cached the pre-fix bundle; uninstalling
  and reinstalling (clearing AsyncStorage) fixed it immediately. Fix (not yet done): stamp the cache with
  something that changes whenever the bundle's shape does (a `version` bump on `SMS_PATTERNS_FALLBACK`,
  or a hash) and invalidate on mismatch, instead of trusting age alone.

## Planned improvements

- Real-device verification pass (permission flow, live capture, historical scan).
- Grow the parsing-template library as real scans surface gaps in older-era/less-common bank
  formats — the "N SMS from known banks couldn't be parsed" counter is the intended in-app discovery
  loop; `tools/sms-parser-verifier/` is the equivalent offline, no-device discovery loop for hardening
  the library upfront against testers' own historical messages.
- Possible future: a refund/reversal hint in the review UI (plan §8).
- **SMS tracking optimization** (flagged during the 2026-08-18 real-device-testing pass, not yet
  scoped) — captured so it isn't lost; see `docs/plans/real-device-testing-pass.md`'s Backlog section.

## Ideas welcome

- Which additional banks' SMS formats should be prioritized once the initial dozen are validated?
- Is a device-side notification (vs. only an in-app badge) worth adding for a newly-arrived
  "Needs Review" item?
