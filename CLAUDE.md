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

## Working style

These govern how to work in this repo day to day — distinct from the non-negotiable rules
above, which govern what the code must do.

- **Never take a screenshot or run automated visual verification** (emulator screencap,
  Playwright, browser automation) to confirm a UI/functional change worked — not even to
  "just check once," and don't ask first. The user always verifies manually. Still run the
  real compile/type/lint/test gates (those aren't visual verification). If launching an
  app/emulator is itself the requested task (not verification of a change), that's fine —
  just stop short of screenshotting it.
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
