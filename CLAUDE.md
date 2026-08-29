# Penny — Developer Guide for Claude Sessions

This file is read at the start of every Claude Code session. It's deliberately minimal —
an orientation + a map of where everything actually lives, not a restatement of it. Deep
reference lives in `docs/`; reusable methodology lives in `.claude/skills/`; specialized
personas live in `.claude/agents/`. (There used to be a fourth category, `.claude/commands/`
— retired 2026-08-13: unlike this file, it wasn't guaranteed to load each session, so
durable rules kept drifting stale there. Its content now lives in `docs/` and this file,
per the table below.)

## What this project is

**Penny** is an India-first personal wealth management app with an AI advisor called
**Chip**. Privacy-first: local-first, AES-256 encrypted, zero trackers, zero backend in
Phase 1.

- Working directory: `/Users/hemant.sharma/Projects/penny`
- Monorepo (pnpm workspace): `packages/core/` (platform-agnostic business logic) +
  `apps/web-react/` (React 19 + Vite + Tailwind — **legacy, frozen as of 2026-07-31: no
  further changes**, kept only as a historical design/behavior reference) + `apps/mobile/`
  (React Native/Expo — **the primary, actively-developed app: all new features, fixes, and
  UI changes land here**) + `workers/` (independent Cloudflare Workers, excluded from the
  pnpm workspace)
- Currency/locale: `en-IN`, Indian Rupees (₹)

## Current status — always check these, never assume from memory

- **Overall roadmap/phase status**: [`docs/ROADMAP.md`](docs/ROADMAP.md) (shipped history,
  decided/in-progress phases, future ideas — merged from three previously separate docs)
- **Mobile-vs-web parity status, per module**: [`docs/MOBILE_PARITY.md`](docs/MOBILE_PARITY.md)
  — historical record of the migration's parity effort (now complete, merged 2026-07-31).
  Since `apps/web-react` is frozen, this is no longer an active "catch up to web" checklist
  for new work, just a reference for what was verified.
- **Mobile migration tech stack, rationale, and lessons-learned playbook**:
  [`docs/plans/mobile-migration.md`](docs/plans/mobile-migration.md)

## Non-negotiable rules

**Architecture (enforced by ESLint — never disable with `eslint-disable`):**

1. `@anthropic-ai/sdk` may only be imported from `packages/core/src/core/ai-safety/anthropicClient.ts`
2. `dexie` may only be imported from `packages/core/src/core/db/`
3. Feature modules (`apps/*/src/features/`) must not cross-import — only from `core/`,
   `components/`, `context/`, `hooks/`, `lib/`
4. `no-console` is a warning — never log PII
5. Platform-suffixed files (`.native.ts`/`.web.ts`) must never duplicate a literal (URL,
   storage key, event name, cache TTL) that's identical across variants — extract to an
   unsuffixed `*.constants.ts` sibling instead. See
   [`docs/EXTERNAL_APIS.md`](docs/EXTERNAL_APIS.md) and `docs/ARCHITECTURE.md`'s
   platform-variance-minimization principle.

**Encryption:**

- Never access Dexie tables directly from feature code — always
  `EncryptedRepository<T>` (`packages/core/src/core/db/repository.ts`)
- The Data Master Key (DMK) lives in memory only, non-extractable, cleared on session
  expiry — see `docs/TSD.md` for the full envelope-encryption model
- DOB never leaves raw to AI — use `deriveAgeBand()` (5-year band), never exact date/age

**Privacy/PII:**

- `buildUserContext()` is the only path from raw data to the Anthropic API
- The PII gate (`packages/core/tests/pii-gate/piiGate.test.ts`) is a CI gate — never skip
- The pre-commit repo PII gate (`scripts/check-pii.mjs`, run via `.husky/pre-commit`) blocks
  real personal data from ever being committed — risky binary documents (PDF/XLSX/CSV/etc.
  unless an explicit synthetic fixture) and distinctive PII patterns (PAN, IFSC, Aadhaar,
  UAN, non-placeholder emails) in staged content. Never bypass with `--no-verify` to get a
  real file/value committed. **Visual redaction of an image or PDF does not remove PII from
  its underlying text layer** — a box drawn over text doesn't delete the text object beneath
  it; never assume a "redacted" file someone shares is safe to commit or reference without
  independently checking its extracted text. See `docs/PRIVACY.md` for the full incident/gate
  writeup.

**Design:**

- `docs/DESIGN_GUIDELINES.md` is the single source of truth for UI design — read it before
  designing or adjusting any screen
- Semantic tokens only — never hardcoded colors (documented domain/brand accents excepted)
- As of 2026-07-31, backgrounds are **theme-reactive, not privacy-mode-reactive** — Safe/
  Private/Open no longer tint the screen differently (that ambient tinting was removed by
  deliberate decision; `getPrivacyModeColors()` now returns one fixed pair of colors per
  theme). `useModeBackgroundColor()`/`useModeAccentColor()` on mobile (the CSS-var cascade
  on web) still exist and should still be used for chrome/screen backgrounds instead of a
  hardcoded value — they're just theme-only now, not mode-tinted
- **Every UI design change goes through a mockup first, no exceptions.** Build it as a new
  HTML mockup in `docs/mockups/proposals/` (never edit an existing mockup without asking),
  grounded in the real current screen — get it approved before touching `apps/mobile` code.
  See `.claude/skills/ui-design-check/`.

**Legacy app:**

- `apps/web-react` is frozen — do not edit it for feature work, bug fixes, or design
  changes. It's kept only as a historical reference for what `apps/mobile` was built to
  match. If a change genuinely requires touching it, confirm with the user first.

**Reliability:**

- The app must never hard-crash — always show what went wrong (a `parseError`
  banner/toast), never let an exception throw uncaught. Wrap risky parsing/I/O in
  try/catch; `apps/mobile/src/components/shared/ErrorBoundary.tsx` is the last line of
  defense, not a substitute for fixing the root cause.
- Hermes (native builds) and V8 (RN Web/Node) do **not** parse non-ISO date strings
  identically — never assume a format that "parses fine" in `pnpm web`/Node also works on
  a real device without testing it there.
- Any `.map()` over user-imported/bulk data needs a render cap ("first N + show all") —
  an unbounded render of a large real file is a native crash risk even when parsing itself
  is instant. Full writeup + the real crash this codifies: `docs/ARCHITECTURE.md`'s
  2026-08-13 entry.
- Any screen that locks navigation for the duration of an operation (back button/hardware
  back/swipe gesture disabled while a write is in flight) must guarantee that lock releases
  on every exit path — success, user cancellation, **and an unexpected exception** — via
  `try/catch/finally`, never just the happy path. A bare `try` with no `catch` around such an
  operation leaves the user stranded with no way to leave, short of force-quitting the app,
  the moment anything throws. Full writeup + the real bug this codifies: `docs/ARCHITECTURE.md`'s
  2026-08-14 CSV Import redesign entry.
- Any code that can run in a **headless/background native context** (a React Native Headless
  JS task, a background worker) with no guarantee the app was already open must check whether
  the Data Master Key is actually unlocked (`keystore.isUnlocked()`) before touching any
  `EncryptedRepository` — such a context can be spun up by the OS after the app process was
  fully killed, with no DMK in memory and no way to prompt for a passphrase from a UI-less
  context. Treat a locked DMK there as a no-op, not an error: whatever data triggered the
  background run should stay durably queued/unprocessed until the app is next opened and
  unlocked, never lost. First codified 2026-08-15 in the SMS Tracking native capture layer's
  Headless JS task — see `docs/ARCHITECTURE.md`'s matching decision-log entry.
- **Always `await` an async file-write before the very next step reads/shares/deletes that same
  file.** `expo-file-system`'s `File.write()` (and any similar async I/O call) returns a
  `Promise<void>` — a call site that fires it without awaiting can hand the next step a
  still-writing, truncated file, a real race, not a theoretical one. Found in 6 separate call
  sites at once (manual/auto backup export, CSV/ZIP export, XLSX export, SMS export) via a real
  "can't restore any backup" report — see `docs/features/backup.md` and `docs/ARCHITECTURE.md`'s
  2026-08-19 real-device-testing-pass entry.
- **`packages/core/src/core/db/schema.ts` is never what actually runs on `apps/mobile`** —
  Metro resolves `schema.native.ts` instead (an `@op-engineering/op-sqlite`-backed object, not
  Dexie), which implements only this project's own `RowStore` interface
  (`packages/core/src/core/db/store.ts`: `get`/`put`/`toArray`/`delete`/`count`/`update`/`clear`
  — no `bulkPut`, no `transaction`, no `where`/`orderBy`/`each`/`modify`, none of Dexie's other
  `Table` methods). Any code that reaches past `EncryptedRepository`/`RowStore` to call a
  Dexie-specific method directly on `db[tableName]` will type-check fine and pass in `vitest`
  (which has no Metro-style `.native.ts` override, so tests always exercise the Dexie-backed
  `schema.ts`) while being **completely broken on every real device** — a real,
  previously-shipped bug (`backupManager.ts`'s restore path calling `.bulkPut()`/`.transaction()`
  directly) that two full investigation rounds of reading code, checking library docs, and
  capturing a real on-device stack trace were needed to actually find, because `docs/
ARCHITECTURE.md`'s own storage-adapter writeup (search "Track 2" / "RowStore") was never
  consulted first. Before writing or debugging _any_ code that touches `db[tableName]` directly
  (not through `EncryptedRepository`) — check `docs/ARCHITECTURE.md`'s storage-adapter section
  and `store.ts`'s `RowStore` interface first, every time; never assume `schema.ts` alone is the
  whole picture for any `packages/core/src/core/db/` file, the same way rule 5 above already
  requires checking for a platform-suffixed sibling before treating any bare file as
  authoritative.
- **Never feed a JS-transformed string back into a controlled native `TextInput`'s own `value`**
  (e.g. `setSymbol(v.toUpperCase())` on every keystroke) — this desyncs the native text buffer
  from React state, and on Android specifically manifests as typed characters getting duplicated/
  re-inserted, not just a cosmetic case mismatch. Hit twice (`VehicleFields.tsx`, then
  `StockFields.tsx`) before being fixed properly: let the native keyboard do the transform via
  `autoCapitalize="characters"` + `autoCorrect={false}`, store exactly what `onChangeText` hands
  back, and uppercase only at the point of use (an API call, the final save) — never in the value
  the field itself displays. Found 2026-08-24 — see `docs/ARCHITECTURE.md`'s matching entry.
- **A release APK that builds cleanly is never itself evidence it runs** — a release build goes
  through paths (Hermes bytecode compilation, R8) a debug build/Metro dev session never touches,
  and a crash can be specific to exactly one of those paths. Before ever committing a rebuilt
  `apps/mobile/builds/app-arm64-v8a-release.apk`, run
  `apps/mobile/scripts/verify-release-apk.sh` — it verifies a real connected device launches it
  **both** on a genuinely fresh install (`adb uninstall` first) **and** on 3 warm relaunches of an
  already-onboarded install, exiting non-zero with the crash signature if either fails. The two are
  different code paths and have crashed independently of each other — this has broken multiple
  times (2026-08-23, 2026-08-24) by skipping this exact check, which is exactly why it's a script
  now, not instructions to retype under time pressure. See `CONTRIBUTING.md`'s "Building a
  standalone Android APK" step 4. If no device is available, say so explicitly rather than shipping
  unverified.
- **`./gradlew assembleRelease` reporting `BUILD SUCCESSFUL` is not evidence the JS actually got
  re-bundled** — found 2026-08-28: it can report `createBundleReleaseJsAndAssets UP-TO-DATE` and
  produce an APK that looks freshly built but still runs the PREVIOUS source snapshot, silently
  shipping stale code with no error at any step (`verify-release-apk.sh` wouldn't catch this either —
  the stale bundle typically still launches fine, it just isn't the change you meant to test). Before
  trusting a release build, confirm the output contains a real `Android Bundled Xms
apps/mobile/index.ts (N modules)` line, not `UP-TO-DATE` — see `CONTRIBUTING.md`'s matching warning
  for the force-re-bundle command.
- **A hook that loads data once at mount, with no subscription to the app's refresh bus
  (`useTxnRefresh`/`notifyTxnChanged`, `packages/core/src/hooks/useTxnRefresh.ts`), will go stale
  the moment anything else — including another instance of itself — writes the same data**, since
  bottom-tab screens stay mounted rather than unmounting on tab switch. This has recurred enough to
  treat as a standing risk, not a one-off: `useExpenses.ts` (2026-08-10), `IouView.tsx`/`useGoals.ts`
  calling a repo directly instead of through their own `useRepository`/`useLoggedRepository`
  wrapper (2026-08-26), and `usePortfolioHoldings.ts` never broadcasting on save/remove at all
  (2026-08-27, the confirmed cause of a stale Health Score after adding/deleting a holding) — see
  `docs/ARCHITECTURE.md`'s matching 2026-08-26/27 entry. When adding or reviewing a hook that reads
  data another screen can also write: (1) always mutate through that hook's own repository wrapper,
  never the raw `EncryptedRepository` directly, and (2) if the hook's data can go stale from an
  _other_ screen's write, subscribe via `useTxnRefresh` and reload. A full app-wide audit of every
  mutation path against this is its own separate, not-yet-started task
  (`docs/plans/real-device-testing-pass.md`'s Phase 7) — don't treat fixing one instance as having
  covered the rest.

## Working style

These govern how to work in this repo day to day — distinct from the non-negotiable rules
above, which govern what the code must do.

- **Never take a screenshot or run automated visual verification** (emulator screencap,
  Playwright, browser automation) to confirm a UI/functional change worked — not even to
  "just check once," and don't ask first. The user always verifies manually. Still run the
  real compile/type/lint/test gates (those aren't visual verification). If launching an
  app/emulator is itself the requested task (not verification of a change), that's fine —
  just stop short of screenshotting it.
- **One HTML mockup file per discussion, never one file per screen/component.** When
  proposing mockups (`docs/mockups/proposals/`), consolidate every screen/piece belonging to
  one design discussion into a single `<topic>-vN.html` — distinct labeled sections with
  in-page anchor nav — rather than a separate file per screen. This applies whether
  producing mockups directly or delegating to the `ui-designer` agent.
- **Give proactive, opinionated design/product input** — on any "what do you think?" or
  "should we do X?" question, lead with a real recommendation and the concrete scenario
  where the literal ask breaks, not a neutral list of options. Unsolicited-but-grounded
  pushback (with a specific failure case, not just "I don't recommend that") is explicitly
  wanted here, even mid-iteration.
- **Implement exactly what was asked in a correction — don't bundle in adjacent changes**
  that weren't requested (e.g. inverting an existing UI convention because one ambiguous
  sentence could be read that way). When a request is ambiguous between "just add X" and
  "add X and also change Y," default to the narrower reading, especially when Y already
  works and wasn't called out as broken. Ask if genuinely unsure.
- **Verify before theorizing.** When a report doesn't match what the code should do and an
  environment-level explanation (stale server, wrong port, cached build) seems plausible,
  confirm what's actually being tested against _before_ presenting that theory as the
  likely cause — frame an unconfirmed environment finding as "here's something I found, can
  you confirm this applies?", not as a stated verdict. Reserve confident causal claims for
  things actually traced through the code/data.
- **Proactively flag adjacent UX gaps noticed while implementing, not just the literal fix
  requested.** When touching a screen/component in `apps/mobile`, do a quick pass (during or
  right after the change) for the kind of "did this screen actually work the way a user
  expects" issues that only surface from exercising a flow end-to-end, not from the change
  itself compiling/passing tests — unsaved-state loss on close/back/backdrop-tap, missing
  scroll/focus-to-new-item after an action succeeds, missing hardware-back handling in a
  custom modal/selection-mode state, `autoFocus` inside a native `Modal` not actually
  focusing (check for the `onShow`+ref pattern already established for this exact failure
  mode — `ExpenseForm.tsx`'s description field is the reference), and two screens reading
  "the same" data through two different paths that could silently diverge (a live-computed
  value vs. a cached/table-backed value). Flag whatever's found in the implementation report
  even if outside the task's explicit scope — let the user decide whether to fix now or
  later, rather than silently noticing and moving on. Prompted by several such gaps going
  unflagged during the 2026-08 real-device-testing pass until the user found them separately
  on-device.
- **Once code has been read and understood earlier in the same conversation, don't
  delegate the next iteration to a brand-new subagent instructed to re-verify against
  source** — it has no memory of prior rounds and will re-read the same files. Either do
  the next step directly with the context already in hand, or resume the _same_ prior
  agent (`SendMessage`) rather than spawning a new one. Reserve a fresh `Agent` call for
  genuinely new scope.
- **When a PR is merged, immediately switch to `main`, pull, and delete the merged local
  branch — without being asked.** `git checkout main && git pull origin main && git branch
-d <branch>`. Safe, easily-reversible local housekeeping, not something requiring
  approval.
- **Never commit or push directly on `main` — no exceptions.** Before any commit, check
  the current branch; if it's `main`, create a branch first (`git checkout -b
<name>`) even for something as small as a docs/memory cleanup. See `CONTRIBUTING.md`'s
  Branch rules.

## Verification & documentation cadence — batch once, right before commit

**Do not run the verification sweep or touch docs after every individual edit/step.** Both
of the below are done exactly **once per task, right before committing** — not iteratively
along the way. This has been stated many times; treat it as absolute, not a default that
can slip back to "after each step" over a long session.

**The decision that "we've reached a commit point" is never yours to infer.** Finishing a
large piece of work — even a multi-file feature that feels done — is not itself a signal to
run the sweep, touch docs, or run `git commit`. Wait for the user to explicitly say
"commit"/"let's commit" (or explicitly ask for verification/docs as their own standalone
request, separate from a commit). If genuinely unsure whether something like "let's ship
this" counts as that explicit ask, treat it as not sufficient — ask, or wait, rather than
proceeding.

**Verification sweep (once, right before commit):** `tsc -b` for every touched package
(`packages/core`, `apps/mobile`), `eslint` scoped to the files actually touched, `prettier
--write` on those files, the full `vitest` suite, and the PII gate (`node
scripts/check-pii.mjs` after `git add -A`, or just let `.husky/pre-commit` run it). Iterate
freely on the actual code without running any of this in between — only sweep once,
immediately before the commit itself.

**Documentation (once, right before commit, covering the whole task's changes at once —
not incrementally after each step):** run `git diff`/`git status` against everything
changed since the task started, then check each of these and update whichever actually
changed (see `.claude/skills/documentation-maintenance/` for the full procedure):

1. `docs/features/<module>.md` if the feature's capabilities, data model, or limitations changed
2. `docs/SCHEMA.md` if any Dexie store fields were added/changed/removed
3. `docs/ARCHITECTURE.md` if new files, directories, hooks, or components were added
4. `docs/DESIGN_GUIDELINES.md` if a UI pattern, rule, theme, or color token changed
5. `docs/MOBILE_PARITY.md` if a mobile-vs-web parity gap was found or fixed
6. `docs/ROADMAP.md` if a phase/track status or architectural decision changed
7. This file's own Non-negotiable rules (above) if a new hard rule applies broadly, or
   `CONTRIBUTING.md` if it's a build/architecture/TypeScript standard specifically
8. The relevant `docs/plans/` file if the approach or scope of an in-progress initiative changed
9. **The persistent memory folder** — check it for anything durable that isn't written in a
   doc yet (a decision, a gotcha, a still-open item, a standing preference). Memory is
   recalled contextually, not guaranteed to load every session the way this file and
   `docs/` are — anything that needs to survive should live in a doc, not stay memory-only.
   Migrate it into the right doc from the list above (or this file's Non-negotiable rules /
   Working style, for something that isn't project documentation), **then delete the source
   memory file** — never leave a trimmed stub behind once its content has a home in docs.
   The goal is a memory folder that stays empty in steady state: each session should be able
   to work entirely from `docs/` + this file, never depending on memory recall for anything
   that matters.

Never mark a task complete without checking this list — but check it **once**, at the end.

## Where to find things

| Need                                                                                                             | Go to                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product vision, users, competitive positioning                                                                   | [`docs/BRD.md`](docs/BRD.md)                                                                                                                              |
| Encryption model, Chip AI architecture, PII pipeline                                                             | [`docs/TSD.md`](docs/TSD.md)                                                                                                                              |
| Full database schema                                                                                             | [`docs/SCHEMA.md`](docs/SCHEMA.md)                                                                                                                        |
| Privacy rules, PII definitions                                                                                   | [`docs/PRIVACY.md`](docs/PRIVACY.md)                                                                                                                      |
| UI design — ethos, patterns, themes, colors                                                                      | [`docs/DESIGN_GUIDELINES.md`](docs/DESIGN_GUIDELINES.md)                                                                                                  |
| Codebase map, architectural decision log                                                                         | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                                                                                            |
| External API registry                                                                                            | [`docs/EXTERNAL_APIS.md`](docs/EXTERNAL_APIS.md)                                                                                                          |
| Backend strategy (Cloudflare Workers, Model B, scale)                                                            | [`docs/BACKEND_STRATEGY.md`](docs/BACKEND_STRATEGY.md)                                                                                                    |
| Roadmap — shipped, in-progress, future ideas                                                                     | [`docs/ROADMAP.md`](docs/ROADMAP.md)                                                                                                                      |
| Mobile parity status per module                                                                                  | [`docs/MOBILE_PARITY.md`](docs/MOBILE_PARITY.md)                                                                                                          |
| Detailed phase/track plans                                                                                       | [`docs/plans/`](docs/plans/)                                                                                                                              |
| Per-feature documentation                                                                                        | [`docs/features/`](docs/features/)                                                                                                                        |
| Running any surface (web, mobile, Capacitor, workers)                                                            | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                                                                                      |
| Code standards + best practices (architecture rules, TypeScript standards, pre-commit gates)                     | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                                                                                      |
| Adding a feature module, anti-patterns, refactor signals, file naming, India-specific conventions                | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ("Feature module architecture" onward)                                                                     |
| Shared component library                                                                                         | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ("Component inventory")                                                                                    |
| Adding an external API integration                                                                               | [`docs/EXTERNAL_APIS.md`](docs/EXTERNAL_APIS.md)                                                                                                          |
| Auditing `apps/mobile` vs `apps/web-react` for parity gaps                                                       | [`.claude/skills/parity-sweep/`](.claude/skills/parity-sweep/SKILL.md)                                                                                    |
| Keeping docs current after a change                                                                              | [`.claude/skills/documentation-maintenance/`](.claude/skills/documentation-maintenance/SKILL.md)                                                          |
| Reviewing/proposing UI, cross-platform design consistency                                                        | [`.claude/skills/ui-design-check/`](.claude/skills/ui-design-check/SKILL.md)                                                                              |
| Specialized subagents (mobile-developer, web-developer, parity-auditor, code-reviewer, test-writer, ui-designer) | [`.claude/agents/`](.claude/agents/)                                                                                                                      |
| Current docs for a fast-moving library (RN/Expo/native packages) instead of relying on training data             | Context7 MCP, configured project-wide in [`.mcp.json`](.mcp.json) — works anonymously; add an API key in Context7's dashboard only if you hit rate limits |
