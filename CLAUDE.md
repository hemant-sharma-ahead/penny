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

| Milestone | Status |
|---|---|
| M0–M12: Foundation through portfolio enhancements | ✅ Complete |
| M13: Financial calculators | 🚧 In progress (Pankhuri) |
| M14: Finance news + Contact/Feedback | ⏳ Future |
| M15: UI polish + feature refinements | ✅ Complete |
| **Pre-Phase 1.5: Docs, components, onboarding v2, categories, activity log** | 🚧 In progress |
| Phase 1.5: Groups & Household OS | ⏳ Next |
| Phase 2: Chip AI, native apps, cloud sync | ⏳ Future |
| Phase 3: Regional languages, crypto, international equities | ⏳ Future |

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
- The Master Key lives in memory only (`src/core/crypto/keystore.ts`) — cleared on session expiry
- Three-key architecture: passphrase → MK (PBKDF2 600K) → KEK (PBKDF2 200K) → wraps MK

---

## UI / Modal design principles

- **No bottom sheets.** All modals must appear centred between the app header and bottom nav.
- **Always visible header + nav.** Use `paddingTop: 56, paddingBottom: 72` on fixed overlays.
- **Horizontal margin.** Use `px-4` on overlay, `max-w-[430px]` on card.
- **Scrollable body.** Long content scrolls inside the card (`overflow-y-auto flex-1`).
- **Z-index ladder:** bottom nav `z-50` → app header `z-40` → modals `z-60` → nested modals `z-70`

---

## Design tokens

```css
--color-primary: #00a86b; /* Penny green */
--color-safe: #f59e0b;    /* Amber — Safe mode */
--color-privacy: #7c3aed; /* Violet — Privacy mode */
--color-open: #dc2626;    /* Red — Open mode */
```

## Semantic theme utilities (never use hardcoded Tailwind colours)

| Class | What it does |
|---|---|
| `bg-surface` | Card / panel background |
| `bg-surface-2` | Slightly deeper background |
| `bg-surface-3` | Body / page background |
| `text-primary` | Primary text |
| `text-secondary` | Secondary / label text |
| `text-tertiary` | Muted / placeholder text |
| `border-theme` | Standard border color |
| `surface` | Shorthand: `bg-surface` + `1px solid border-theme` |
| `input-surface` | Input bg + text + border-color |

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

| File | Purpose |
|---|---|
| `src/core/db/schema.ts` | All Dexie stores — everything depends on this |
| `src/core/db/types/index.ts` | All TypeScript types for DB records |
| `src/core/db/repositories.ts` | All repository instances |
| `src/core/crypto/securityManager.ts` | All reads/writes flow through this |
| `src/core/ai-safety/buildUserContext.ts` | Only path to Anthropic |
| `src/core/ai-safety/mockChip.ts` | All Phase 1 dev runs on this |
| `src/core/db/seedDemoData.ts` | Demo data seeding |
| `tests/pii-gate/piiGate.test.ts` | CI gate — never skip |
| `src/context/PrivacyContext.tsx` | Privacy mode — wraps entire app |
| `src/context/SettingsContext.tsx` | Module visibility + font scale |
| `src/router/index.tsx` | All routes + AuthGuard |

---

## Documentation discipline (enforced in every session)

After completing any implementation step:
1. **Update `docs/features/<module>.md`** if the feature's capabilities, data model, or limitations changed
2. **Update `docs/SCHEMA.md`** if any Dexie store fields were added, changed, or removed
3. **Update `docs/ARCHITECTURE.md`** if new files, directories, hooks, or components were added
4. **Update `CLAUDE.md` milestone table** if a track or milestone status changed
5. **Update `.claude/commands/penny-standards.md`** if new non-negotiable rules apply
6. **Update `docs/ROADMAP.md`** if any architectural decisions were made or changed

Never mark a step as complete without checking this list.

---

## Where to find detailed information

| Topic | Location |
|---|---|
| Product vision, users, competitive positioning | [`docs/BRD.md`](docs/BRD.md) |
| Full database schema with all fields | [`docs/SCHEMA.md`](docs/SCHEMA.md) |
| Privacy rules, PII definitions | [`docs/PRIVACY.md`](docs/PRIVACY.md) |
| Codebase map, component inventory, decision log | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Phase 1.5/2/3 plans + backend decisions | [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| Full milestone history with steps | [`docs/MILESTONES.md`](docs/MILESTONES.md) |
| Per-feature documentation | [`docs/features/`](docs/features/) |
| Code standards + best practices | [`.claude/commands/penny-standards.md`](.claude/commands/penny-standards.md) |
| How to add a feature module | [`.claude/commands/penny-feature-module.md`](.claude/commands/penny-feature-module.md) |
| Contributing guide | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
