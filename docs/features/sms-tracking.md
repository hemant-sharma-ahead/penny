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
  SMS-tracking apps handle a parse failure.
- Not available on iOS or the web target — neither exposes an SMS-reading API to any app. The
  Settings row explains this rather than showing a dead toggle.

## How it works

**Core logic** (`packages/core/src/core/sms-import/`) — a deliberately separate module from
`core/bank-import/` and `core/import/`, reusing only the matching *algorithm* shape from
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
  hook and a Headless JS task with no React tree (see Mobile section).

**Data model** (`docs/SCHEMA.md`'s "SMS-Based Transaction Tracking" section has full field tables):
`sms_transactions` (one row per parsed-or-attempted SMS, `status`: unparsed/needs_review/ready/
linked/dismissed) and `sms_account_mappings` (the persisted sender/card→account mapping). Both
`EncryptedRepository`-backed, added in Dexie schema v14. `Account` gained two new optional fields,
`bankId`/`last4`, feeding the account-matching order above.

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

## Current limitations

- **Not yet verified on a real device.** Everything here compiles and passes its own test suite
  (parser tests against a synthetic multi-bank/multi-era SMS corpus, account/transaction-matching
  unit tests, a real Gradle Kotlin compile), but actual on-device behavior — the OS permission
  dialog, `SmsReceiver` firing promptly, the WorkManager→Headless-JS hop under real battery/Doze
  conditions — has not been confirmed. No SMS-injection into an emulator is possible from a dev
  environment; this needs a real-device pass before relying on it day-to-day.
- Android only — no iOS/web equivalent exists or is planned (neither platform exposes an SMS API).
- The bundled parsing-template set covers roughly the dozen most common Indian banks' current-era
  wording, with older-era templates added only for the banks most likely to need them
  (HDFC/ICICI/SBI). A bank/format not yet covered surfaces as "unrecognized sender" (silently
  skipped, by design — showing/exporting arbitrary non-bank-sender text would be a bigger privacy
  overreach than this feature's scope) rather than a parse failure.
- No Play Store distribution decision has been finalized — the design accounts for Play's
  Restricted Permissions policy (see the plan doc §2), but the actual Restricted Permissions
  Declaration Form / Data Safety submission is a separate, later operational step, not something
  the app code does.
- Refunds/reversals aren't auto-matched to their original transaction — treated as an independent
  new credit; a future improvement could surface a "possible refund of →" hint.

## Planned improvements

- Real-device verification pass (permission flow, live capture, historical scan).
- Grow the parsing-template library as real scans surface gaps in older-era/less-common bank
  formats — the "N SMS from known banks couldn't be parsed" counter is the intended discovery loop.
- Possible future: a refund/reversal hint in the review UI (plan §8).

## Ideas welcome

- Which additional banks' SMS formats should be prioritized once the initial dozen are validated?
- Is a device-side notification (vs. only an in-app badge) worth adding for a newly-arrived
  "Needs Review" item?
