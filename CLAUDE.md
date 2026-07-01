# Penny — Developer Guide for Claude Sessions

This file is read at the start of every Claude Code session. It provides orientation. Deep reference lives in `docs/`. How-to patterns live in `.claude/commands/`.

---

## What this project is

**Penny** is an India-first personal wealth management PWA with an AI advisor called **Chip**. Privacy-first: local-first, AES-256 encrypted, zero trackers, zero backend in Phase 1.

- Working directory: `/Users/hemant.sharma/Projects/penny`
- Stack: React 19 + TypeScript (strict) + Vite + Tailwind v4 + Dexie.js + Web Crypto API
- Target: Mobile-first PWA, `max-w-[430px] mx-auto` desktop layout
- Currency/locale: `en-IN`, Indian Rupees (₹)

---

## Current milestone status

| Milestone                                                                              | Status                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| M0–M12: Foundation through portfolio enhancements                                      | ✅ Complete                                                              |
| M13: Financial calculators                                                             | ✅ Complete                                                              |
| M14: Finance news + Contact/Feedback                                                   | ✅ Complete                                                              |
| M15: UI polish + feature refinements                                                   | ✅ Complete                                                              |
| **Pre-Phase 1.5: Tracks 5, 1A–1E, 2, 3, 4, 6, 7 ✅ (Track 6 Step 3 skipped)**          | ✅ Complete                                                              |
| Phase 1.5: Groups & Household OS — [plan](docs/plans/phase-1.5-groups-household-os.md) | 🚧 In progress (Track 1 ✅; Track A API Proxy ✅ deployed → `penny-api-proxy.hesh.workers.dev`; next: Track B. Backend strategy: [docs/BACKEND_STRATEGY.md](docs/BACKEND_STRATEGY.md)) |
| Phase 2: Chip AI, native apps, cloud sync                                              | ⏳ Future                                                                |
| Phase 3: Regional languages, crypto, international equities                            | ⏳ Future                                                                |

Full step-by-step milestone history → [`docs/MILESTONES.md`](docs/MILESTONES.md)
Phase 1.5/2/3 architecture decisions → [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## Architecture rules (enforced by ESLint)

1. **`@anthropic-ai/sdk`** may only be imported from `src/core/ai-safety/anthropicClient.ts`
2. **`dexie`** may only be imported from `src/core/db/`
3. **Feature modules** must not cross-import — only from `core/`, `components/`, `context/`, `hooks/`, `lib/`
4. **`no-console`** is a warning — never log PII

Never disable these rules with `eslint-disable` comments.

---

## Encryption rules

- **Never access Dexie tables directly** from feature code
- Always use `EncryptedRepository<T>` from `src/core/db/repository.ts`
- The Master Key (DMK) lives in memory only, non-extractable (`src/core/crypto/keystore.ts`) — cleared on session expiry
- **Envelope encryption (Track 2):** a random Data Master Key (DMK) encrypts all data; it's wrapped independently by a passphrase-KEK (PBKDF2 600K) and a PIN-KEK (PBKDF2 200K). Changing passphrase/PIN re-wraps the DMK only — never re-encrypt data. Changing the passphrase requires the current passphrase. Never derive the data key directly from the passphrase. (See `docs/ROADMAP.md` → Track 2.)
- **DOB never leaves raw to AI** — use `deriveAgeBand()` (5-year band), never the exact date/age

---

## UI / Modal design principles

- **No bottom sheets.** All modals must appear centred between the app header and bottom nav.
- **Always visible header + nav.** Use `paddingTop: 56, paddingBottom: 72` on fixed overlays.
- **Horizontal margin.** Use `px-4` on overlay, `max-w-[430px]` on card.
- **Scrollable body.** Long content scrolls inside the card (`overflow-y-auto flex-1`).
- **Z-index ladder:** bottom nav `z-50` → app header `z-40` → modals `z-60` → nested modals `z-70` → third-tier modals `z-80` (e.g. category/parent editors opened from the category picker). `Modal`/`ConfirmDialog` accept `level={1|2|3}`.

---

## Design tokens

```css
--color-primary: #00a86b; /* Penny green */
--color-safe: #f59e0b; /* Amber — Safe mode */
--color-privacy: #7c3aed; /* Violet — Privacy mode */
--color-open: #dc2626; /* Red — Open mode */
```

## Themes

Four visual themes, set via `data-theme` on `<body>` (managed by `SettingsContext`, see `src/index.css`):
**Light** · **Penny Blue** (navy `#1F3864` brand palette — `data-theme=blue`) · **Dark** (neutral slate/black) · **System** (resolves the OS preference to Light or true Dark — never Penny Blue, which is a deliberate manual pick). The legacy `dark` setting (which was the navy palette) auto-migrates to `blue` once on load.

## Semantic theme utilities (never use hardcoded Tailwind colours)

| Class            | What it does                                       |
| ---------------- | -------------------------------------------------- |
| `bg-surface`     | Card / panel background                            |
| `bg-surface-2`   | Slightly deeper background                         |
| `bg-surface-3`   | Body / page background                             |
| `text-primary`   | Primary text                                       |
| `text-secondary` | Secondary / label text                             |
| `text-tertiary`  | Muted / placeholder text                           |
| `border-theme`   | Standard border color                              |
| `surface`        | Shorthand: `bg-surface` + `1px solid border-theme` |
| `input-surface`  | Input bg + text + border-color                     |

## Status colors (never hardcode `#10b981`/`#ef4444`/`#f59e0b`/`#3b82f6`)

Semantic status tokens: `--color-success` / `--color-danger` / `--color-warning` / `--color-info` / `--color-neutral`.

- **Classes:** `text-success|danger|warning|info` and `bg-{success|danger|warning|info}-subtle` (theme-aware via `color-mix`).
- **Props / inline styles:** `STATUS` map + `tint()` (subtle bg) + `ink()` (readable on-tint text) from [`src/lib/statusColors.ts`](src/lib/statusColors.ts).
- **Pills → `<Badge color={STATUS.x}>`. Alert callouts → `<Banner variant="warning">`.** Domain/brand colors (category/asset/type accents) stay as data in `core/*/meta.ts`.

## Shared utilities

- **All date logic lives in [`src/lib/date.ts`](src/lib/date.ts)** (keys, labels, `formatDate*`, `dueDateInfo`, `deriveAge`/`deriveAgeBand`, + `DAY_MS`/`startOfToday`/`daysUntil`/`daysBetween`). `lib/formatters.ts` is money/number only. Never re-implement day math or hardcode `86_400_000`. For DOB in AI context use `deriveAgeBand` (5-year band), never `deriveAge`/raw.

---

## Navigation structure

```
/onboarding/*       Pre-auth: splash, privacy promise, setup, demo, intro, simulated dashboard
/app/home           Home dashboard (default after onboarding)
/app/portfolio      Portfolio module
/app/expenses       Expenses module
/app/goals          Goals module
/app/insurance      Insurance (accessible from Home)
/app/chip           Chip AI chat
```

Bottom nav: Home · Portfolio · Chip (FAB, centred) · Expenses · Goals

---

## Key files

| File                                     | Purpose                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `src/core/db/schema.ts`                  | All Dexie stores — everything depends on this                             |
| `src/core/db/types/index.ts`             | All TypeScript types for DB records                                       |
| `src/core/db/repositories.ts`            | All repository instances                                                  |
| `src/core/crypto/securityManager.ts`     | All reads/writes flow through this                                        |
| `src/core/ai-safety/buildUserContext.ts` | Only path to Anthropic                                                    |
| `src/core/ai-safety/mockChip.ts`         | All Phase 1 dev runs on this                                              |
| `src/core/db/seedDemoData.ts`            | Demo data seeding                                                         |
| `src/core/db/activityLog.ts`             | Activity log service — `logActivity`/`restoreActivity` (Track 4 Timeline) |
| `src/hooks/useLoggedRepository.ts`       | Logging+Undo wrapper around `useRepository` for user mutations            |
| `tests/pii-gate/piiGate.test.ts`         | CI gate — never skip                                                      |
| `src/context/PrivacyContext.tsx`         | Privacy mode — wraps entire app                                           |
| `src/context/SettingsContext.tsx`        | Module visibility + font scale                                            |
| `src/router/index.tsx`                   | All routes + AuthGuard                                                    |

---

## Documentation discipline (enforced in every session)

After completing any implementation step:

1. **Update `docs/features/<module>.md`** if the feature's capabilities, data model, or limitations changed
2. **Update `docs/SCHEMA.md`** if any Dexie store fields were added, changed, or removed
3. **Update `docs/ARCHITECTURE.md`** if new files, directories, hooks, or components were added
4. **Sync status everywhere it's tracked** when a phase / track / step / module status changes — the `CLAUDE.md` milestone table, the matching row in `docs/MILESTONES.md` and `docs/ROADMAP.md`, and the **Status** line of the relevant plan in [`docs/plans/`](docs/plans/) (+ its index row). These must never disagree.
5. **Update `.claude/commands/penny-standards.md`** if new non-negotiable rules apply
6. **Update `docs/ROADMAP.md`** if any architectural decisions were made or changed
7. **Update the plan in `docs/plans/`** (and add a new one for any new phase / large multi-step track) if the approach or scope changed

Never mark a step as complete without checking this list.

---

## Where to find detailed information

| Topic                                                                   | Location                                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Product vision, users, competitive positioning                          | [`docs/BRD.md`](docs/BRD.md)                                                           |
| Full database schema with all fields                                    | [`docs/SCHEMA.md`](docs/SCHEMA.md)                                                     |
| Privacy rules, PII definitions                                          | [`docs/PRIVACY.md`](docs/PRIVACY.md)                                                   |
| Codebase map, component inventory, decision log                         | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                         |
| Phase 1.5/2/3 plans + backend decisions                                 | [`docs/ROADMAP.md`](docs/ROADMAP.md)                                                   |
| **Detailed approved phase/track plans** (why/what/how, step breakdowns) | [`docs/plans/`](docs/plans/)                                                           |
| Full milestone history with steps                                       | [`docs/MILESTONES.md`](docs/MILESTONES.md)                                             |
| Per-feature documentation                                               | [`docs/features/`](docs/features/)                                                     |
| Code standards + best practices                                         | [`.claude/commands/penny-standards.md`](.claude/commands/penny-standards.md)           |
| How to add a feature module                                             | [`.claude/commands/penny-feature-module.md`](.claude/commands/penny-feature-module.md) |
| Contributing guide                                                      | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                   |
