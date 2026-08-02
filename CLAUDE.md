# Penny — Developer Guide for Claude Sessions

This file is read at the start of every Claude Code session. It's deliberately minimal —
an orientation + a map of where everything actually lives, not a restatement of it. Deep
reference lives in `docs/`; how-to patterns live in `.claude/commands/`; reusable
methodology lives in `.claude/skills/`; specialized personas live in `.claude/agents/`.

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

## Documentation discipline (every session)

After completing any implementation step, update whichever of these actually changed:

1. `docs/features/<module>.md` if the feature's capabilities, data model, or limitations changed
2. `docs/SCHEMA.md` if any Dexie store fields were added/changed/removed
3. `docs/ARCHITECTURE.md` if new files, directories, hooks, or components were added
4. `docs/DESIGN_GUIDELINES.md` if a UI pattern, rule, theme, or color token changed
5. `docs/MOBILE_PARITY.md` if a mobile-vs-web parity gap was found or fixed
6. `docs/ROADMAP.md` if a phase/track status or architectural decision changed
7. `.claude/commands/penny-standards.md` if a new non-negotiable rule applies
8. The relevant `docs/plans/` file if the approach or scope of an in-progress initiative changed

Never mark a step complete without checking this list.

## Where to find things

| Need | Go to |
| --- | --- |
| Product vision, users, competitive positioning | [`docs/BRD.md`](docs/BRD.md) |
| Encryption model, Chip AI architecture, PII pipeline | [`docs/TSD.md`](docs/TSD.md) |
| Full database schema | [`docs/SCHEMA.md`](docs/SCHEMA.md) |
| Privacy rules, PII definitions | [`docs/PRIVACY.md`](docs/PRIVACY.md) |
| UI design — ethos, patterns, themes, colors | [`docs/DESIGN_GUIDELINES.md`](docs/DESIGN_GUIDELINES.md) |
| Codebase map, architectural decision log | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| External API registry | [`docs/EXTERNAL_APIS.md`](docs/EXTERNAL_APIS.md) |
| Backend strategy (Cloudflare Workers, Model B, scale) | [`docs/BACKEND_STRATEGY.md`](docs/BACKEND_STRATEGY.md) |
| Roadmap — shipped, in-progress, future ideas | [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| Mobile parity status per module | [`docs/MOBILE_PARITY.md`](docs/MOBILE_PARITY.md) |
| Detailed phase/track plans | [`docs/plans/`](docs/plans/) |
| Per-feature documentation | [`docs/features/`](docs/features/) |
| Running any surface (web, mobile, Capacitor, workers) | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Code standards + best practices | [`.claude/commands/penny-standards.md`](.claude/commands/penny-standards.md) |
| Adding a feature module | [`.claude/commands/penny-feature-module.md`](.claude/commands/penny-feature-module.md) |
| Shared component library | [`.claude/commands/penny-components.md`](.claude/commands/penny-components.md) |
| Adding an external API integration | [`.claude/commands/penny-api-client.md`](.claude/commands/penny-api-client.md) |
| Auditing `apps/mobile` vs `apps/web-react` for parity gaps | [`.claude/skills/parity-sweep/`](.claude/skills/parity-sweep/SKILL.md) |
| Keeping docs current after a change | [`.claude/skills/documentation-maintenance/`](.claude/skills/documentation-maintenance/SKILL.md) |
| Reviewing/proposing UI, cross-platform design consistency | [`.claude/skills/ui-design-check/`](.claude/skills/ui-design-check/SKILL.md) |
| Specialized subagents (mobile-developer, web-developer, parity-auditor, code-reviewer, test-writer, ui-designer) | [`.claude/agents/`](.claude/agents/) |
| Current docs for a fast-moving library (RN/Expo/native packages) instead of relying on training data | Context7 MCP, configured project-wide in [`.mcp.json`](.mcp.json) — works anonymously; add an API key in Context7's dashboard only if you hit rate limits |
