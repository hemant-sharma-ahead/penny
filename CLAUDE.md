# Penny — Developer Guide for Claude Sessions

This file is read at the start of every Claude Code session. It provides orientation. Deep reference lives in `docs/`. How-to patterns live in `.claude/commands/`.

---

## What this project is

**Penny** is an India-first personal wealth management PWA with an AI advisor called **Chip**. Privacy-first: local-first, AES-256 encrypted, zero trackers, zero backend in Phase 1.

- Working directory: `/Users/hemant.sharma/Projects/penny`
- Stack: React 19 + TypeScript (strict) + Vite + Tailwind v4 + Dexie.js + Web Crypto API
- Target: Mobile-first PWA, `max-w-[430px] mx-auto` desktop layout
- Currency/locale: `en-IN`, Indian Rupees (₹)
- **Monorepo since the mobile migration (July 2026):** pnpm workspace — `packages/core/` (platform-agnostic
  business logic, was `src/core/`+`src/lib/`) and `apps/web-legacy/` (this app's UI, was everything else in
  `src/`). See [`docs/plans/mobile-migration.md`](docs/plans/mobile-migration.md) and
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before touching paths below — many still say `src/core/...`
  for brevity/history but now resolve to `packages/core/src/core/...`.

---

## Current milestone status

| Milestone                                                                              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0–M12: Foundation through portfolio enhancements                                      | ✅ Complete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M13: Financial calculators                                                             | ✅ Complete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M14: Finance news + Contact/Feedback                                                   | ✅ Complete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M15: UI polish + feature refinements                                                   | ✅ Complete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Pre-Phase 1.5: Tracks 5, 1A–1E, 2, 3, 4, 6, 7 ✅ (Track 6 Step 3 skipped)**          | ✅ Complete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Phase 1.5: Groups & Household OS — [plan](docs/plans/phase-1.5-groups-household-os.md) | 🚧 In progress. **Track 1 ✅** (pairwise IOU). **A ✅** API proxy (`penny-api-proxy`). **B ✅** client crypto (`device_keys`/`group_keys`/`sync_cursor`, `mergeBundle`). **C ✅** auth/identity (`workers/auth/`, signed-request auth, `signedFetch`/`claim`). **D ✅** backup+sync (`src/core/sync/`: Drive live, iCloud dormant, OPFS floor; Model B — user's own cloud). **E ✅ feature-complete + deployed, end-to-end verification pending** — E1–E5 + E5 tail (worker+crypto, lifecycle, split, sync, context switcher/dashboard/composer/settle/members, cash guard, share-with-group, vacation→group link, share-later, demo fixtures); `workers/groups/` deployed (reuses api-proxy KV; dedicated `penny_auth`/`penny_groups` D1s; **no R2** — event ciphertext inline in D1). `sync` is **env-gated** (`VITE_ENABLE_SYNC`); Groups require a **claimed username**. **Track F — Multi-Device, Sync & Recovery 🚧** ([plan](docs/plans/phase-1.5-track-F-multi-device-recovery.md)): **F1 ✅** phantom-claim fix (demo no longer fakes a claim; `claimed` honest); **F2 ✅** recovery hardening + restore-on-reinstall + account-start flow (Preview → Screen A cards → Screen B tabs → handle-recovery; mandatory username + claim at onboarding; deregister-failure surfacing); **F3 ✅** passphrase reclaim (Ed25519 challenge; auth worker `/recover/*` + migration `0003` — **worker needs redeploy+migrate before live verify**); **F4 device pairing/QR = next (discuss first)**; deferred: group-recovery-after-reclaim, groups-side account-delete cleanup. **Remaining before Phase 1.5 done: Track E live verification + F4 + Stage F closeout.** Resume/test: [track-E plan](docs/plans/phase-1.5-track-E-groups.md) "▶ Resume here"; recovery model: [track-F plan](docs/plans/phase-1.5-track-F-multi-device-recovery.md). Backend: [docs/BACKEND_STRATEGY.md](docs/BACKEND_STRATEGY.md). |
| **Mobile Migration — React Native (Expo)** — [plan](docs/plans/mobile-migration.md)    | 🚧 In progress. **Track 0 ✅** repo restructuring (pnpm workspace, `packages/core`/`apps/web-legacy` split, existing Vitest suite green, `tsc -b`/eslint clean, build+dev smoke-tested) — **not yet committed**, on branch `feat/rn-migration`, awaiting user sign-off. **Track 1 (Expo app skeleton) = next.** Supersedes the "native apps" line item below — see the plan for locked decisions (single Expo codebase incl. web via `react-native-web`, NativeWind, `expo-sqlite`+`react-native-quick-crypto`). |
| Phase 2: Chip AI, cloud sync                                                           | ⏳ Future                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Phase 3: Regional languages, crypto, international equities                            | ⏳ Future                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Full step-by-step milestone history → [`docs/MILESTONES.md`](docs/MILESTONES.md)
Phase 1.5/2/3 architecture decisions → [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## Architecture rules (enforced by ESLint)

Since the mobile migration's Track 0, these are enforced per-package (one shared `eslint.config.js` at the
repo root, with `files:`-scoped overrides — see that file for the exact paths):

1. **`@anthropic-ai/sdk`** may only be imported from `packages/core/src/core/ai-safety/anthropicClient.ts`
2. **`dexie`** may only be imported from `packages/core/src/core/db/`
3. **Feature modules** (`apps/web-legacy/src/features/`) must not cross-import — only from `core/`, `components/`, `context/`, `hooks/`, `lib/`
4. **`no-console`** is a warning — never log PII

Never disable these rules with `eslint-disable` comments.

---

## Encryption rules

- **Never access Dexie tables directly** from feature code
- Always use `EncryptedRepository<T>` from `packages/core/src/core/db/repository.ts`
- The Master Key (DMK) lives in memory only, non-extractable (`packages/core/src/core/crypto/keystore.ts`) — cleared on session expiry
- **Envelope encryption (Track 2):** a random Data Master Key (DMK) encrypts all data; it's wrapped independently by a passphrase-KEK (PBKDF2 600K) and a PIN-KEK (PBKDF2 200K). Changing passphrase/PIN re-wraps the DMK only — never re-encrypt data. Changing the passphrase requires the current passphrase. Never derive the data key directly from the passphrase. (See `docs/ROADMAP.md` → Track 2.)
- **DOB never leaves raw to AI** — use `deriveAgeBand()` (5-year band), never the exact date/age

---

## UI design

**All UI design lives in [`docs/DESIGN_GUIDELINES.md`](docs/DESIGN_GUIDELINES.md)** — the single source of truth: design ethos, navigation/layout & modal rules, reusable patterns (identity hero, in-field labels, icon-tile selector, grouped cards, danger zone), themes, design tokens, semantic theme/status colour utilities, and the mockup proposal workflow. **Read it before designing or adjusting any screen**, and add new patterns/rules there as they emerge — keep design guidance in that one doc, not scattered here.

Non-negotiables at a glance: centred modals (no bottom sheets); full-screen single-scroll over hidden tabs; a back button on every sub-page; **semantic tokens only — never hardcoded colours** (domain/brand accents excepted, as data in `core/*/meta.ts`).

## Shared utilities

- **All date logic lives in [`packages/core/src/lib/date.ts`](packages/core/src/lib/date.ts)** (keys, labels, `formatDate*`, `dueDateInfo`, `deriveAge`/`deriveAgeBand`, + `DAY_MS`/`startOfToday`/`daysUntil`/`daysBetween`). `lib/formatters.ts` is money/number only. Never re-implement day math or hardcode `86_400_000`. For DOB in AI context use `deriveAgeBand` (5-year band), never `deriveAge`/raw.

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

| File                                                          | Purpose                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/core/src/core/db/schema.ts`                          | All Dexie stores — everything depends on this                             |
| `packages/core/src/core/db/types/index.ts`                     | All TypeScript types for DB records                                       |
| `packages/core/src/core/db/repositories.ts`                    | All repository instances                                                  |
| `packages/core/src/core/crypto/securityManager.ts`             | All reads/writes flow through this                                        |
| `packages/core/src/core/ai-safety/buildUserContext.ts`         | Only path to Anthropic                                                    |
| `packages/core/src/core/ai-safety/mockChip.ts`                 | All Phase 1 dev runs on this                                              |
| `packages/core/src/core/db/seedDemoData.ts`                    | Demo data seeding                                                         |
| `packages/core/src/core/db/activityLog.ts`                     | Activity log service — `logActivity`/`restoreActivity` (Track 4 Timeline) |
| `apps/web-legacy/src/hooks/useLoggedRepository.ts`             | Logging+Undo wrapper around `useRepository` for user mutations            |
| `packages/core/tests/pii-gate/piiGate.test.ts`                 | CI gate — never skip                                                      |
| `apps/web-legacy/src/context/PrivacyContext.tsx`               | Privacy mode — wraps entire app                                           |
| `apps/web-legacy/src/context/SettingsContext.tsx`              | Module visibility + font scale                                            |
| `apps/web-legacy/src/router/index.tsx`                         | All routes + AuthGuard                                                    |

---

## Documentation discipline (enforced in every session)

After completing any implementation step:

1. **Update `docs/features/<module>.md`** if the feature's capabilities, data model, or limitations changed
2. **Update `docs/SCHEMA.md`** if any Dexie store fields were added, changed, or removed
3. **Update `docs/ARCHITECTURE.md`** if new files, directories, hooks, or components were added
   - **Update `docs/DESIGN_GUIDELINES.md`** if a UI design pattern, rule, theme, or colour token was introduced or changed (it's the single source of truth for UI design — keep it there, not scattered)
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
| **UI design** — ethos, patterns, themes, colours, mockup workflow       | [`docs/DESIGN_GUIDELINES.md`](docs/DESIGN_GUIDELINES.md)                               |
| Codebase map, component inventory, decision log                         | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                         |
| Phase 1.5/2/3 plans + backend decisions                                 | [`docs/ROADMAP.md`](docs/ROADMAP.md)                                                   |
| **Detailed approved phase/track plans** (why/what/how, step breakdowns) | [`docs/plans/`](docs/plans/)                                                           |
| Full milestone history with steps                                       | [`docs/MILESTONES.md`](docs/MILESTONES.md)                                             |
| Per-feature documentation                                               | [`docs/features/`](docs/features/)                                                     |
| Code standards + best practices                                         | [`.claude/commands/penny-standards.md`](.claude/commands/penny-standards.md)           |
| How to add a feature module                                             | [`.claude/commands/penny-feature-module.md`](.claude/commands/penny-feature-module.md) |
| Contributing guide                                                      | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                   |
