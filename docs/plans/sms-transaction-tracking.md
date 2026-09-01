# SMS-Based Expense Auto-Tracking (Android) — Design Plan

**Status:** 🚧 Built 2026-08-15 (core parsing/matching module, mobile UI, native Android capture
layer — config plugin, local Expo module, BroadcastReceiver→WorkManager→Headless JS) — **pending
real-device verification** before rollout (OS permission flow, live SMS capture, historical scan,
all confirmed via compilation/unit tests/a real Gradle build but not yet exercised on a physical
device or emulator, which this environment cannot do). See
[`docs/features/sms-tracking.md`](../features/sms-tracking.md) for the user-facing feature doc.

## Context

Right now Penny only learns about a transaction when the user types it in, or imports it
from a CSV/bank statement after the fact. The user wants a third path: on Android, detect
transaction SMS from banks as they arrive (or on a historical scan), and turn them into
transactions automatically — with the explicit goal that a user could eventually stop
manually importing CSVs altogether and rely on SMS as their primary income source of
transactions.

Three requirements were stated up front, plus a mandate to research prior art first:

1. On/off toggle inside the app (Settings), **off by default** (privacy-first default,
   consistent with Safe Mode's own default-off precedent).
2. A manual "refresh SMS between two dates / for a given month" action — this isn't a
   one-time setup step, it's a standing capability (e.g. after restoring a backup, or after
   noticing a gap).
3. An SMS-detected transaction must **link to** an existing recorded transaction, never
   silently create a duplicate of something the user already logged another way. Two SMS
   that appear to describe the same real-world transaction must be **surfaced to the user
   to decide** — never auto-merged, never auto-logged twice.

This plan is the output of that research pass: two codebase-exploration agents (bank-import
architecture, and settings/schema/native-permission precedent) plus web research into how
comparable apps (Walnut/axio, PennyWise AI, Alkemi, various OSS SMS-parsers) and Android
platform policy handle this. Distribution is confirmed to cover **both** a sideloaded APK
(now) and a future Play Store release — so the design must work under Play's SMS/Call-Log
permission policy, not just the easier sideload case. SMS-parsing regex/templates are
confirmed to live in a Cloudflare Worker (per the user's explicit answer and per
`docs/BACKEND_STRATEGY.md`'s pre-existing design principle for exactly this case), not
hardcoded in the app binary.

**Nothing in this plan is built yet** as of the Status line above — implementation,
mockups, and schema changes all wait for a dedicated implementation pass.

---

## 1. Two different users, two different jobs — both must be designed for

This feature has to work for two genuinely different starting states, not just the
"existing user with data to reconcile against" case:

- **Existing user with transaction history already in Penny** (manual entries, CSV
  imports, bank-sync) — here SMS tracking's job is mostly _reconciliation_: most incoming
  SMS should resolve to "this matches something you already logged," same as Bank Statement
  Import's whole purpose. Few genuinely new transactions surface.
- **Fresh install, SMS tracking turned on with little or no existing data** — here SMS
  tracking's job is _primary recording_, much closer to CSV-import's role: nearly every
  parsed SMS is a brand-new transaction with no existing candidate to match against, and
  needs the same account/category/payment-mode resolution-and-review flow CSV-import
  already has (draft categories, per-group review, bounded rendering of a large backfill).

Both cases funnel through the **same** review-queue mechanics (§4, §7) — the "Linked"
bucket is just naturally near-empty for a fresh user and the "New Pending" bucket is where
nearly everything lands — but the design must not assume the reconciliation case is the
only one, since the user explicitly wants SMS to be able to fully replace CSV import as a
day-to-day recording method for a new user, not just top up an existing ledger.

Two Explore passes confirmed Penny already has almost everything this feature needs as a
_pattern_ — the closest matching/dedup analog is **Bank Statement Import**
(`packages/core/src/core/bank-import/`, `apps/mobile/src/features/bank-import/`), because
its whole purpose is reconciling incoming rows against transactions the user already
logged. **To be explicit about scope, since this is easy to blur: SMS tracking becomes a
third, independent way to _record_ a transaction (alongside manual entry and CSV import) —
it is not, and does not replace, Bank Statement Import, which remains a separate feature
whose job is reconciling whichever transactions already exist (regardless of how they were
recorded — manually, via CSV, or via SMS) against the bank's own official statement/balance.
SMS tracking only reuses bank-import's matching _algorithm_ shape, not its role.**

- **Two-tier matching** (`packages/core/src/core/bank-import/matcher.ts:207-293`,
  `matchStatementRows()`): Tier 1 is exact-provenance lookup against a dedicated link table
  (`findProvenanceMatch`, `bank_statement_imports`); Tier 2 is fuzzy match (same account,
  same direction, exact amount, date within a window) with description-similarity
  tie-breaking, and **ties are surfaced to the user as "Possible match," never guessed**
  (`matcher.ts:255-281`). This is precisely the "prompt the user, don't auto-log" behavior
  requirement 3 above asks for, already built and already proven in production.
- **A dedicated provenance/link table**, not an overloaded field:
  `BankStatementImportRecord` (`packages/core/src/core/db/types/index.ts:999-1020`, Dexie
  store `bank_statement_imports`) stores `linkedTxnId` pointing at the real `Expense`,
  keeps the raw narration for audit + merchant-memory, and is what re-import-safety and
  "already processed this before" checks key against. SMS needs the same shape: a
  `sms_transactions` (name TBD) table, not stuffing everything into `Expense.sourceRef`.
- **`TransactionSource` already reserves `'sms'` as a value**
  (`packages/core/src/core/db/types/index.ts:336`) and it is **currently unused anywhere
  in the codebase** — this was clearly anticipated and needs no schema migration to add,
  just to start using.
- **Merchant memory** (`packages/core/src/core/expenses/merchantMemory.ts`) — keyed by
  normalized description, tracks category/payment-mode/usage-count per merchant, updated
  incrementally on **every** save regardless of source. This is the exact mechanism for
  "what category did the user pick last time for this merchant/sender" — reusable as-is for
  SMS-derived merchant strings. Concretely, to confirm: **yes** — once the user categorizes
  one SMS-derived expense for a given merchant, the very next SMS parsed for that same
  merchant will pre-fill the same category (and payment mode) via this existing mechanism,
  same as it already does across manual entry / CSV import / bank-sync today. No new
  learning system needs to be built for this — it's the same shared memory table every
  other recording method already writes to and reads from.
- **Payment-mode keyword inference** (`packages/core/src/core/bank-import/paymentModeInference.ts`)
  — ordered keyword match (UPI/NEFT/POS/ATM/cheque/NACH) over narration text. SMS bodies
  use the same rail vocabulary; directly reusable, and worth promoting out of
  `bank-import/` into a shared location since a third consumer now needs it (see §6).
- **IOU detection + person resolution** — `isLikelyIouSuspect`/`IOU_KEYWORDS`
  (`packages/core/src/core/import/importCategoryResolution.ts:205-210`),
  `IOU_MANDATORY_CATEGORY_IDS` (`packages/core/src/core/db/defaultCategories.ts:16-30`),
  and bank-import's `resolvePerson()` (`useBankImport.ts:948-963`, case-insensitive
  match-or-create against `Person`). A P2P UPI SMS ("₹500 sent to Rahul Kumar via UPI")
  reuses all three untouched.
- **"Already imported" UI treatment** — `apps/mobile/src/features/import/review/DuplicatesBucket.tsx`
  and bank-import's Matched bucket: a flat, separate bucket, dimmed/labeled, with an
  explicit "not a duplicate — proceed anyway" escape hatch, never silently dropped. This is
  the UI shape for SMS's "Linked" bucket (§4).

**What's explicitly missing and needs to be added:**

- `Account` has **no bank-identity field today** — `docs/SCHEMA.md` documents a `bankName`
  field that doesn't actually exist in code (`packages/core/src/core/db/types/index.ts:381-434`
  has no such field — a stale doc entry, confirmed by direct grep). Bank-import has a
  `BankPresetId` enum (`packages/core/src/core/bank-import/types.ts:4`,
  `'hdfc'|'icici'|'kotak'|'sbi'|'indusind'|'hsbc'|'bob'|'custom'`) but it's scoped to the
  import feature, not attached to an `Account`. SMS→Account matching needs this to be a
  real, optional `Account` attribute (§3).
- **No native SMS-reading capability exists anywhere in the app.** The only OS-permission
  precedent is Expo's bundled `ImagePicker` (camera/media-library), a wrapped module, not a
  bespoke one (`apps/mobile/src/lib/receiptImage.ts:26,36`). This is a genuinely new kind of
  native surface for Penny (§2). Worth noting: Penny is **already** outside Expo Go / the
  fully-managed workflow — `@op-engineering/op-sqlite` and the custom
  `plugins/withAbiSplits.js` config plugin already require a custom dev client / prebuild —
  so there's no reason to prefer an "Expo-SDK-native" SMS library over a well-maintained
  bare React Native one; maintenance quality and activity is the actual bar (§2).
- **No SMS-pattern-template worker route exists yet** — closest structural precedent is
  `workers/api-proxy/`'s `/epf-rates`/`/ppf-rates` routes: a static, Penny-authored JSON
  payload (not a proxied third-party call), versioned, served from the worker, with an
  **offline-first bundled fallback baked into `packages/core`** so the app never depends on
  network access to function (`docs/EXTERNAL_APIS.md`'s EPF/PPF rows). This is the shape to
  copy for SMS templates (§5).

---

## 2. Android permission strategy — must satisfy both distribution paths

Per the user's answer, plan for **both**: sideload today, Play Store as a near-future
target. Research findings:

- Play's "Permissions used only in default handlers" policy restricts `READ_SMS`/
  `RECEIVE_SMS` to apps approved via a **Restricted Permissions Declaration** that
  demonstrates SMS access is _core_ to the app's function — Google has both approved this
  for real finance apps (MoneyView itself reads SMS and is Play-distributed, as the user
  noted) and rejected/forced removal for others historically (Walnut/axio's well-documented
  2018-2019 SMS-policy retreat). The bar is that the app's **primary declared purpose** must
  be served by SMS reading, not an incidental feature bolted onto something else — Penny's
  case is helped by SMS-tracking being a first-class, clearly-declared capability with its
  own consent screen and Data Safety disclosure, not a hidden background behavior.
- **This governs the whole feature, so build it once, correctly, for the stricter (Play)
  bar — it will work identically for sideload.** No forked "Play-safe-lite" version:
  - `READ_SMS` for historical inbox query (needed for requirement 2 — refresh/backfill by
    date range — which is impossible via any notification-based alternative, since
    Android doesn't retain a historical notification backlog). This is non-negotiable for
    the feature as scoped; there is no privacy-preserving substitute for it.
  - `RECEIVE_SMS` for the ongoing/live capture path.
  - A **pre-permission education screen inside Penny** (Settings → SMS Tracking → "why we
    need this" explainer, shown before the OS dialog ever appears) — improves both the OS
    dialog acceptance rate and, per Play's review guidance, materially helps the
    declaration case that this is disclosed, core, deliberate functionality.
  - A proper Play Console **Data Safety form entry** and a **Restricted Permissions
    Declaration Form** submission is a real, separate operational step for eventual Play
    release — flag this as a launch-checklist item in the plan doc, not something the app
    code does.
- **Native module**: no existing SMS library is used anywhere in this repo today, and per
  the note above, the selection criterion is maintenance/quality, not Expo-SDK membership.
  Candidates surfaced by research (`react-native-get-sms-android`,
  `@maniac-tech/react-native-expo-read-sms`, various Kotlin-based "read-sms/expo-modules"
  packages) are starting points to re-evaluate at implementation time against actual
  current maintenance activity, issue trackers, and Expo-SDK/RN-version compatibility —
  don't lock in a specific package name now. Realistically, off-the-shelf SMS-reading
  libraries mostly stop at "hand you the SMS text on a broadcast" — the durable
  queue/retry handoff described below is very likely custom Kotlin work regardless of which
  base library is chosen. Either way this needs a new Expo **config plugin**
  (`apps/mobile/plugins/withSmsPermissions.js`, mirroring the existing custom-plugin
  precedent `plugins/withAbiSplits.js`) to inject the Android manifest permissions +
  broadcast-receiver + WorkManager worker declarations — Android-only, never touches the
  iOS or web build targets.
- **Live capture, reliably, without a persistent foreground service** — researched Android
  background-processing best practice, not just an SMS-specific concern: a
  `BroadcastReceiver` for the protected `SMS_RECEIVED` system broadcast fires even if the
  app process isn't running, **but a `BroadcastReceiver` has a hard ~10s execution budget
  and must not do real work itself** (parsing/DB reads/writes). The reliable pattern,
  matching standard Android guidance:
  1. Receiver fires → does the absolute minimum (persist the raw SMS body + sender +
     timestamp to a tiny native-side durable store — a single small table/row is enough)
     and immediately **enqueues a `WorkManager` job** for that specific message.
  2. `WorkManager` (not a bespoke `setInterval`/foreground-service scheme) is what actually
     guarantees eventual execution — it survives process death, app kill, and even device
     reboot (with `RESCHEDULE_ON_REBOOT` handling), respects Doze/battery constraints by
     deferring rather than dropping work, and retries on failure. This is the standard
     Android answer to "how do I reliably do work after a broadcast, even if the OS kills my
     process a second later" — no custom foreground-service/notification needed for this,
     since none of this needs to be instantaneous to the second.
  3. The `WorkManager` job invokes a **Headless JS task**
     (`HeadlessJsTaskService`) to run the actual parsing/matching/write using the same
     `packages/core` logic the foreground app uses (§5, §6) — not a native-only
     reimplementation of the parsing rules.
     Flag the Headless-JS-under-WorkManager wiring as a build-time validation spike (this
     combination has known rough edges under Expo prebuild specifically); if it doesn't hold
     up cleanly, the fallback is "queue raw candidates natively via WorkManager, drain and
     process the backlog on next app foreground" — worse latency (the review queue updates
     only when the app is opened, not the instant an SMS arrives) but **still durable and
     still never silently loses a message**, since the persistence step (native store +
     WorkManager enqueue) happens either way — only the "when does WorkManager actually run
     the JS side" part changes.
- **Platform scope**: Android-only, full stop. iOS has no public SMS-reading API at all
  (Apple sandboxes Messages entirely) — the Settings entry must show an explicit "not
  available on iOS" explanation on that platform, never a dead/disabled toggle with no
  reason given. Same exclusion for the RN Web target (no SMS/telephony API in a browser).

---

## 3. Account matching (SMS sender/bank text → configured `Account`)

Add two new **optional** fields to `Account`
(`packages/core/src/core/db/types/index.ts:381-434`), non-breaking, additive only:

```ts
bankId?: BankPresetId;  // promote BankPresetId out of bank-import/types.ts into a shared
                         // location (e.g. core/banks/bankPresets.ts) since Account, bank-import,
                         // AND sms-import all need it now — three consumers, not two
last4?: string;          // last 4 digits of the ACCOUNT number only — never the full number,
                         // consistent with PRIVACY.md Category-1 (account numbers never stored raw)
```

Both settable from the existing account-edit screen, optional, defaulting to unset for
every existing account (no migration required, no forced re-entry).

**The harder real-world case, called out explicitly: an SMS's bank-name/account text will
rarely match the `Account.name` string literally.** E.g. the user names an account
"HDFC-x8112" in Penny, but the SMS body says "HDFC A/c 8112" or "HDFC Bank XX8112" or
similar — same account, differently written. This needs a **persisted mapping**, not a
one-shot fuzzy guess re-run every time:

- Reuse `importAccountResolution.ts`'s existing `normalize()` (strips whitespace/punctuation
  and masking `x`'s before digits — already handles exactly the "HDFC-x8112" vs "HDFC8112"
  case cited) to get a canonical key from both the SMS text and existing `Account.name`s.
- The **first time** a new normalized bank-string is seen with no exact/normalized match,
  prompt the user once: "map to an existing account" (picker) or "create a new account" —
  same tile shape as CSV-import's `AccountsStage`, but surfaced as a single ongoing
  notification/review-queue item, not a multi-row wizard stage (this isn't a batch import).
- The answer is written to a **persisted, encrypted mapping table**
  (`sms_sender_account_map` or similar — this is meaningful, durable user data, not a
  throwaway cache, so it lives in `EncryptedRepository`, not AsyncStorage), keyed by the
  normalized bank-string, value = `accountId`. Every subsequent SMS from that same
  normalized sender/bank-string auto-resolves silently from then on. Editable any time from
  the SMS Tracking settings sub-page's sender-mapping list (§7) — never a one-way, invisible
  decision.

**Cards, specifically — Penny does not track cards as separate accounts (an established
decision from the CSV-import redesign: cards merge into their underlying bank account, they
are never their own `Account`).** A card transaction SMS will often carry the _card's_ last
4 digits, which are **not the same number** as the underlying account's own last 4 — so a
naive `last4` match against `Account.last4` will silently fail for every card SMS. Handle
this as its own mapping tier, same persisted-table mechanism as the bank-string case above:
a detected card-last4 gets its own one-time "which account does this card belong to?"
prompt (not "create an account for this card"), and the answer persists in the same mapping
table so every future SMS from that card auto-resolves to the right underlying account.

**Full matching order** for an incoming SMS against the user's configured accounts:

1. Card-last4 → account mapping match (if this SMS's masked number was previously mapped as
   a card belonging to some account).
2. Bank-string → account mapping match (normalized sender/bank text previously mapped).
3. Exact `Account.last4` match (SMS's masked account number, not a card number, matches an
   `Account` directly).
4. `bankId` match with exactly one non-archived `Account` of that bank → unambiguous.
5. Anything else (no mapping, ambiguous `bankId` match across multiple accounts at the same
   bank, or an unrecognized bank entirely) → one-time prompt as described above, sitting in
   an "Unmapped" bucket until resolved. **Never silently auto-creates an account** — this
   exact lesson was hard-learned during the CSV-import redesign: only touched/confirmed
   accounts get created, never inferred silently.

To restate the scope boundary from §1: this mapping is purely for **attributing an SMS to
one of the user's existing recorded accounts** so a transaction can be logged against it —
it is unrelated to, and does not feed, Bank Statement Import's own reconciliation logic
(which still operates on whichever `accountId` it's pointed at, regardless of how that
account's transactions got recorded).

---

## 4. Matching against existing transactions (requirement 3 — the core ask)

Two structurally distinct duplicate scenarios, both must be handled, both funnel into one
review queue with different flags:

**(a) SMS vs. an already-recorded transaction** (manual entry, CSV import, or bank-sync) —
reuse `matchStatementRows()`'s exact two-tier shape:

- Tier 1: exact-provenance check against the new `sms_transactions` link table (has this
  literal SMS, by content hash, already been processed — protects against reprocessing the
  same message on a re-scan or app restart).
- Tier 2: fuzzy — same account, same direction, exact amount, date within a **tight** window
  (recommend ±1 day, tighter than bank-import's ±3 days, since an SMS arrives same-day as
  the real transaction) — auto-link only if exactly one candidate; otherwise "Possible
  match," surfaced, never guessed.
- On link: the SMS record gets `linkedTxnId` pointing at the existing `Expense`; **the
  existing `Expense` itself is never overwritten or replaced** — only the link record is
  created. This is the literal wording of requirement 3 ("linked... not replace").
- **Already-bank-reconciled records need an extra guard, not just "never overwrite."**
  Sequencing matters: it's entirely possible SMS tracking gets turned on _after_ Bank
  Statement Import has already reconciled a transaction — and reconciliation can itself
  correct a transaction's recorded date to match the bank's ground truth
  (`Expense.statementBalance`/`reconciledSeq`, already-established fields). An SMS for that
  same transaction can arrive late, or simply carry the SMS-gateway's own delivery
  timestamp rather than the true transaction date, and so may not agree with the
  already-corrected date. Rule: if the Tier-1/Tier-2 candidate match has
  `statementBalance != null` (i.e. it's already bank-reconciled) **and** the SMS's own
  extracted date differs from the recorded date by more than a trivial amount, **do not
  auto-link** even if amount/account/direction all agree — route it to "Needs Review"
  instead, explicitly flagged (e.g. "this looks like a reconciled transaction from
  [date] — the SMS says [other date]. Same transaction?"). The user decides whether to link
  as-is (keeping the reconciled record's date untouched — linking never changes it either
  way) or treat the SMS as a separate/different event. This keeps a bank-reconciled record
  as ground truth while still surfacing the discrepancy instead of silently hiding it.

**The "Possible match" review UI, concretely** — this needs its own screen (not a modal
squeezed onto an existing one), and per CLAUDE.md's mockup-first rule, needs a proposal in
`docs/mockups/proposals/` before any code, grounded in the existing bank-import review
screens. Recommended shape: a **side-by-side comparison card** — left side shows the
already-recorded expense (date, amount, description/category, account, source icon), right
side shows the SMS-derived candidate (date, amount, extracted merchant text, sender,
payment-mode guess) — with two clear actions: **"Yes, same transaction — link"** and
**"No — keep as a separate transaction"** (which then routes the SMS candidate into "New
Pending" for normal review instead). No silent default, no auto-timeout accept.

**(b) SMS vs. another SMS describing the same real-world event** (e.g. a bank sending both
a generic "debited" alert and a separate UPI-rail confirmation for one payment, or a
delivery retry) — run the _same_ amount/direction/±1-day-window heuristic SMS-to-SMS, not
just SMS-to-Expense. A tie/candidate match here is flagged "Possible duplicate SMS" and
—per the user's explicit instruction—**always prompts the user to decide, never auto-merges
and never auto-logs both.**

No match found in either pass → becomes a genuinely new "Pending" transaction candidate.

---

## 5. Parsing layer — Cloudflare-hosted templates, on-device matching

Per the user's confirmed answer, template/regex logic lives in a Worker, following the
existing `/epf-rates`/`/ppf-rates` shape (`workers/api-proxy/`, static Penny-authored JSON,
not a proxied third-party call):

- New route, e.g. `workers/api-proxy/src/sms-patterns.ts` → `/sms-patterns`, versioned JSON:
  one entry per bank, `{ bankId, senderIdPatterns: string[], templates: TemplateEntry[] }`
  where `TemplateEntry` is `{ transactionType: 'debit'|'credit'|'upiSent'|'upiReceived'|
'cardSwipe'|'refund'|..., regex, addedAt }` — **`templates` is a list, not a single entry
  per type**, because bank SMS formats genuinely drift over the years (a bank's 2012-era
  SMS wording is not its 2020-era wording, is not its 2026-era wording) and a historical
  backfill scan needs to match whichever era's format a given old message actually used.
  There is no clean, authoritative public catalog of "bank X's exact format in year Y" to
  pre-research against (confirmed by research into the existing OSS SMS-parser projects —
  they converge on the same approach below rather than maintaining strict dated eras), so
  the practical design is:
  - **Write tolerant, not brittle, regex per bank per transaction type** — anchor on stable
    tokens that survive most rewording (amount figure, "debited"/"credited"/"spent"/"sent"
    verb family, an account/card-number marker, "avl bal"/available-balance marker) rather
    than matching an exact sentence structure — this alone covers a lot of minor wording
    drift for free without needing a new template per tweak.
  - **Grow the list append-only over time** rather than trying to front-load a definitive
    15-year history now: start with each bank's current-era format (highest-value, most
    real-world messages will be recent), and treat parse-failures against a _recognized
    bank sender_ as the actual discovery mechanism for missing older-era templates — the
    visible "N SMS from known banks couldn't be parsed" counter (below) is exactly this
    feedback loop, not just a UX nicety. In practice, the richest source of genuinely old
    templates will be real historical inbox scans against real long-lived phone numbers
    (e.g. the user's own, if they've retained SMS for many years) during testing/early use
    — expect this library to be built out incrementally after real data surfaces gaps, not
    fully speced upfront.
  - Try every template for a matched sender's bank (all `transactionType`s, across every
    `addedAt` era) — first structural match wins; there's no need to guess which era a
    message belongs to before trying, since only one template will actually match a given
    message's real wording.
    Start with the ~12-15 most common Indian banks' **current-era** formats first (HDFC,
    ICICI, SBI, Axis, Kotak, IndusInd, BoB, Yes Bank, PNB, Canara, IDFC First, HSBC) — reuse
    `BankPresetId` as the identifier set, extending it as needed — with older-era templates
    for each added incrementally as gaps are found, per the discovery loop above.
- **Crucially: only the pattern templates cross the network — raw SMS text and every
  derived field (amount, account, merchant) are matched 100% on-device and never
  transmitted anywhere.** This is what reconciles the Worker requirement with
  `docs/PRIVACY.md`'s zero-server-PII model — the earlier ambiguity here (flagged by one of
  the research agents) is resolved: "regex lives in the backend" means the _rules_ are
  centrally fixable, not that SMS _content_ ever leaves the device.
- App fetches + caches this bundle (same TTL-and-fallback shape as EPF/PPF rates:
  `packages/core/src/core/portfolio/ratesStorage.ts`'s pattern is a good template to copy),
  and ships a **bundled fallback set** (`SMS_PATTERNS_FALLBACK`, same idea as
  `EPF_RATE_TABLE_FALLBACK`) so parsing works fully offline / on first install before any
  fetch succeeds.
- Add a row to `docs/EXTERNAL_APIS.md`'s registry table for this route when built.
- **Extraction fields per matched SMS**: amount, direction (debit/credit), payment-mode/rail
  keyword (reuse `paymentModeInference.ts`), counterparty/merchant string, masked
  account-tail (e.g. "XX1234"), reference number, balance (shown for context, not used in
  matching), and a timestamp — prefer a body-embedded date/time if the template captures
  one, else fall back to the SMS's own received timestamp (a real edge case: delayed
  SMS-gateway delivery can misalign the two).
- **False-positive filtering**, layered: (1) sender-ID allowlist (only known bank/DLT
  transactional shortcodes, e.g. `AD-HDFCBK`/`VM-ICICIB` patterns), (2) requires an actual
  regex template match (amount + transactional verb), not keyword presence alone, (3)
  explicit OTP-keyword exclusion as a belt-and-suspenders filter. Anything from a
  recognized bank sender that still fails to match any template is **not silently
  discarded** — tallied into a visible "N SMS from known banks couldn't be parsed" count
  (Settings → SMS Tracking), so format-drift is visible instead of silently lossy.

---

## 6. New core module + storage

New `packages/core/src/core/sms-import/` (own module, **not** sharing code with
`bank-import/` or `import/` directly — same "these evolve independently" principle already
established between those two — but sharing the _underlying reusable algorithms_ via
promotion to shared locations where a third consumer now exists):

- `smsPatterns.ts` / `smsPatternsClient.ts` — fetch-cache-fallback client for §5's worker
  route, mirroring `epfInterestRates.ts`'s shape.
- `smsParser.ts` — apply patterns to raw SMS text → structured candidate fields (§5).
- `smsAccountMatch.ts` — §3's account-resolution logic.
- `smsTransactionMatch.ts` — §4's two-tier match logic, built by generalizing
  `matcher.ts`'s `matchStatementRows()` rather than copy-pasting it outright if the shapes
  align closely enough at implementation time (a call to make once real field shapes are
  known — don't force a premature shared abstraction before the second real consumer
  exists).
- Promote `paymentModeInference.ts` out of `bank-import/` into a shared location (e.g.
  `core/expenses/paymentModeInference.ts`) since sms-import is now a third consumer.
- Promote `BankPresetId` out of `bank-import/types.ts` into a shared location (e.g.
  `core/banks/bankPresets.ts`) for the same reason (§3).

**New storage** (via `EncryptedRepository`, never raw Dexie/SQLite access — per CLAUDE.md's
non-negotiable rule):

- `sms_transactions` table (name TBD at implementation time) — mirrors
  `BankStatementImportRecord`'s shape: id, contentHash (Tier-1 dedup key), sender, parsed
  fields, status (`pending` / `linked` / `dismissed` / `duplicate-flagged`), `linkedTxnId?`.
  **Raw SMS body text is retained only while `status === 'pending'`** (needed for the user
  to visually confirm/correct in the review queue) and dropped once linked/committed/
  dismissed — minimizes how much raw sensitive text is ever persisted long-term, structured
  fields are sufficient after resolution.
- A simple AsyncStorage-backed boolean for the master on/off toggle, following
  `SettingsContext.tsx`'s existing pattern for a non-domain-data preference (e.g.
  `SAFE_MODE_VISIBILITY_KEY`'s sibling), **not** an encrypted-repo field — consistent with
  how every other simple feature toggle in Settings is stored today.
- This table must survive backup/restore (it's `EncryptedRepository`-backed like everything
  else, so this is automatic) — otherwise a restored device would re-surface its entire SMS
  history as brand-new "Pending" items, since the OS-level SMS inbox itself is untouched by
  an app reinstall/restore.

---

## 7. Settings + review-queue UX

**Settings** (`apps/mobile/src/features/settings/`) — new "SMS Tracking" sub-page (own
page, not just an inline toggle, following `SafeModeSettingsPage.tsx`'s
`ToggleRow`/sub-page structure since this needs more than one control):

- Master on/off toggle (default off). Turning on: permission-education screen → OS
  permission dialog → if granted, "scan your SMS history?" choice:
  - Scan a bounded default window (recommend **last 3 months**, not all-time, for a
    brand-new/no-existing-data user — mirrors the CSV-import lesson that an unbounded
    first-run scan against zero existing transactions produces a flood of "Pending" items
    with no render cap in place yet; the bounded default keeps first-run reasonable).
  - Scan a custom date range.
  - Skip history — only track new messages from now on.
- "Scan a date range" as a **standing** action (requirement 2), independent of the initial
  toggle-on flow — usable any time (e.g. after a backup restore, or to backfill a gap).
- Live sender→account mapping list, editable (so the user can review/correct what §3
  auto-resolved).
- A visible "N SMS from known banks couldn't be parsed" counter (§5), and a
  permission-revoked-detection banner (Android lets the user revoke `READ_SMS` from OS
  Settings at any time outside the app; must detect this on next foreground and explain,
  never fail silently — per CLAUDE.md's "never hard-crash, always show what went wrong"
  rule).
- iOS/RN-Web: entry shows "Not available on this platform" instead of a dead toggle.

**Review queue** — an ongoing inbox-style screen, not a wizard (this is a continuous
feature, unlike CSV-import's one-shot batch), reusing the bank-import bucket-card visual
language (`BucketCard.tsx`/`CategoryTile.tsx`-style shared components, not new patterns):

- **Linked** — auto-matched to an existing transaction, collapsed/informational.
- **Needs Review** — ambiguous account, possible-match tie, or possible-duplicate-SMS;
  user must resolve, never silently defaulted.
- **New Pending** — no match found, ready to become a new transaction; category/account/
  payment-mode pre-filled via merchant memory + `paymentModeInference` + §3's account
  match, all editable before commit, same "draft-category, not-final-until-touched"
  discipline as CSV-import.
- **Ignored/Dismissed** — user said "not a transaction" or muted a sender.
- A badge count surfaces from Settings (and/or the Expenses tab) rather than a blocking
  screen — matches this feature's "ongoing," not "first-few-times-only," nature (explicitly
  the opposite framing from CSV-import's Import Progress screen, which the user scoped that
  way _because_ CSV import is a rare, one-off action; SMS tracking is the reverse case).
- The **historical backfill scan specifically** (initial enable, or an explicit
  "scan a date range" request) _is_ a bounded, first-few-times-ish operation and can reuse
  CSV-import's captive Import-Progress-screen pattern (progress/ETA/cancel, per-row durable
  writes) almost directly — but the **ongoing per-message capture** (day-to-day new SMS)
  must not lock any screen or block navigation; it just quietly grows the review queue in
  the background.
- Any bulk render here (a large backfill scan) needs the same render-cap discipline
  CLAUDE.md already mandates for bulk imports (first-N + "show all", never an unbounded
  `.map()`).

---

## 8. Rare/negative scenarios checklist (for the record, to design against, not all v1-blocking)

1. Permission revoked post-grant → detect + explain, never fail silently (§7).
2. Bank changes SMS format, breaking a template → low/no match, tallied visibly, never
   silently absorbed as if fully covered (§5).
3. Two SMS for one real transaction (rail confirmation + generic alert) → prompted, never
   auto-merged (§4b).
4. Refunds/reversals → treated as an independent new credit by default; if a strong
   opposite-direction match exists in the same window, surface a "possible refund of →
   [original expense]" hint in the review UI, but don't auto-net/auto-merge balances — this
   is explicitly out of v1 scope as an _automation_, just a hint.
5. Family/shared-account or dual-SIM phones receiving SMS for accounts not the primary
   user's → same ambiguous-account flow (§3) handles it; sits unresolved in "Unmapped"
   until dismissed or mapped.
6. Reinstall/restore → the encrypted `sms_transactions` link table restores with the rest
   of the backup, so Tier-1 dedup still works post-restore; an uninstall _without_ a
   restore loses it and a rescan will re-surface everything as Pending (acceptable,
   documented).
7. Corrupted/garbled/partial multi-part SMS → parser fails closed (no match) rather than
   guessing a partial amount — matches the app's existing "never guess, never crash"
   reliability ethos.
8. Time-zone/date mismatch between SMS-body-embedded date and SMS-received timestamp →
   prefer body-embedded when the template captures one (§5).

---

## 9. Explicit open items / launch-checklist notes (not code, but must not be forgotten)

- Play Console **Restricted Permissions Declaration Form** + **Data Safety** disclosure is
  a real submission step required before any Play release with this feature active — an
  operational task, track it in `docs/ROADMAP.md` when this moves from planned to
  in-progress.
- The `WorkManager`-enqueues-`Headless JS` live-capture path (§2) needs an early throwaway
  spike to de-risk before committing the full design around it — if the Headless-JS side
  doesn't hold up cleanly under Expo's prebuild, the fallback (native queue via
  `WorkManager`, JS side only drained on next app foreground) is materially worse latency
  but always durable; decide which one to build for only after that spike.
- Re-validate the native SMS library choice (§2) at implementation time rather than locking
  it in now — this space moves fast and today's best-maintained option may not be it by
  the time building starts.
- **Update (2026-08-16):** `tools/sms-parser-verifier/` now exists — a standalone offline HTML tool
  (see `docs/features/sms-tracking.md` and the tool's own README) so testers with real, years-long bank
  SMS history can harden the §5 template library entirely offline, before any device/app is involved and
  before the `/sms-patterns` worker route needs to be deployed at all.
- **Update (2026-08-17):** real testing against a genuine multi-year SMS history surfaced that
  "Partial/Unparsed" was conflating two different things — a real §5 template-coverage gap vs. a
  message that's simply never a transaction at all (OTP, promotional, government, non-financial
  service pings). Both the tool and the real app gained a sender/message exclusion capability to
  separate the two (full design in `docs/ARCHITECTURE.md`'s matching decision-log entries): the real
  app's side adds a new `sms_excluded_senders` table (schema v15, `docs/SCHEMA.md`) that
  `processRawSmsCore` checks before parsing at all, and a durable "Exclude sender" action on the
  already-shipped Unparsed Messages sender-group accordion — deliberately sender-level only (no
  auto-exclusion by TRAI header suffix, unlike the tool's session-scoped, lower-stakes version), since
  auto-excluding real financial messages carries materially higher risk than auto-excluding a test
  corpus's.
- **Update (2026-08-17):** separately, TRAI's SMS header suffix mandate (effective 6 May 2025) means a
  bank's sender can now legitimately arrive as `VM-HDFCBK-T`/`VM-HDFCBK-S` rather than just the pre-2025
  `VM-HDFCBK`/`HDFCBK` — every bank's `senderIdPatterns` in §5's template bundle gained the matching
  additive patterns (old, un-suffixed ones untouched, since historical messages never carried a
  suffix). Full rationale in `smsPatterns.ts`'s own doc comment.

---

## Verification (once implementation actually starts)

Verification follows the project's standard cadence (per `CLAUDE.md`): `tsc -b` for every
touched package, ESLint scoped to touched files, full `vitest` suite, PII gate
(`node scripts/check-pii.mjs`), `git status --short apps/web-react` empty-diff check (this
feature never touches the frozen legacy app), plus a manual on-device Android test pass
(this cannot be verified any other way — no emulator SMS injection substitutes for a real
device's SMS stack) since automated visual verification is explicitly against the project's
working-style rules.
