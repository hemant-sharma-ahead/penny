# Contributing to Penny

## Local setup

### Prerequisites

- Node 20+ (see `.nvmrc`)
- npm 10+

```bash
git clone https://github.com/<your-handle>/penny.git
cd penny
npm install
npm run dev
```

App runs at `http://localhost:5173`. DevTools → 390px viewport to see the mobile layout.

### Environment variables

There are no environment variables required for Phase 1 development. All features run on mock/simulated data locally.

For Phase 1 + Chip (AI), create `.env.local`:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

This key is only used in development. In the shipped app, users supply their own API key during onboarding (stored encrypted with their passphrase).

---

## Architecture overview

```
src/
├── core/           # Infrastructure — features import FROM here only
│   ├── crypto/     # Web Crypto API, three-key encryption
│   ├── db/         # Dexie schema + EncryptedRepository
│   ├── ai-safety/  # buildUserContext(), PII scanner, mock Chip
│   └── session/    # PIN session, AuthGuard
├── features/       # Feature modules (self-contained per tab)
├── components/     # Shared UI (layout, privacy, primitives)
├── context/        # React contexts (PrivacyContext)
├── router/         # createBrowserRouter, AuthGuard, route paths
└── lib/            # Formatters, constants
```

**Architecture rules enforced by ESLint:**

- `@anthropic-ai/sdk` may only be imported from `src/core/ai-safety/anthropicClient.ts`
- `dexie` may only be imported from `src/core/db/`
- Feature modules must not cross-import from other features — only from `core/`, `components/`, `context/`, `hooks/`, `lib/`
- `no-console` is a warning — avoid logging, it risks PII leaks

---

## The encryption boundary

**Never access Dexie tables directly from feature code.** Always go through `EncryptedRepository<T>` in `src/core/db/repository.ts`. This ensures:

1. All writes are encrypted before hitting IndexedDB
2. All reads are decrypted transparently
3. The session key is checked on every access

```ts
// Correct
const repo = new EncryptedRepository(db.expenses, ['amount', 'merchant', 'notes']);
const expenses = await repo.getAll();

// Wrong — bypasses encryption
const expenses = await db.expenses.toArray();
```

---

## The PII boundary

**`buildUserContext()` is the only path from raw data to the Anthropic API.** It strips all PII before assembling the payload. See `docs/PRIVACY_RULES.md` for the full list of what gets stripped, banded, or generalised.

The CI gate (`tests/pii-gate/piiGate.test.ts`) will fail the build if any PII escapes. Never skip or weaken this test.

---

## Scripts

| Script                 | What it does                  |
| ---------------------- | ----------------------------- |
| `npm run dev`          | Start Vite dev server         |
| `npm run build`        | TypeScript check + Vite build |
| `npm run lint`         | ESLint on `src/`              |
| `npm run lint:fix`     | ESLint auto-fix               |
| `npm run format`       | Prettier write on `src/`      |
| `npm run format:check` | Prettier check (used in CI)   |
| `npm run type-check`   | `tsc --noEmit`                |
| `npm run test`         | Vitest                        |
| `npm run test:ci`      | Vitest (CI mode, fails fast)  |

---

## Branch rules

- Every milestone or track gets its own branch cut from `main`: `feat/<milestone-slug>`
- Examples: `feat/pre-phase-1.5`, `feat/m16-groups`, `feat/m13-calculators`
- Never commit milestone work directly to `main`
- Open a PR when a milestone (or all tracks within it) is complete

---

## Pre-commit gates — all three must pass before every commit

```bash
npm run format      # Prettier — no unformatted files
npm run lint        # ESLint — zero errors (warnings tolerated, minimise them)
npm test -- --run   # Vitest — all tests green including PII gate
```

Run them in this order. Fix failures before committing. Never use `--no-verify` or suppress lint with `eslint-disable`.

---

## Commit conventions

Each completed step or track gets its own commit. Format:

```
feat(scope): step X — short description
feat(scope): short description
fix(scope): short description
chore: tooling or config change
docs: documentation change
test: test additions
```

**Milestone commit examples:**

```
feat(pre-1.5): track 5 — documentation overhaul
feat(m16): step 1 — groups data model and Dexie store
fix(expenses): category merge not updating transaction count
```

---

## PR rules

- **Title:** `feat(<milestone>): <milestone short name>`
- **Example:** `feat(pre-phase-1.5): documentation, components, onboarding, categories, activity log`
- Every PR must pass CI (lint + tests) before merge
- PR description: what changed, why, and any decisions or trade-offs made

---

## Key documents

| File                                  | What it covers                                                             |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `CLAUDE.md`                           | Orientation: project identity, rules, milestone status, key files          |
| `CONTRIBUTING.md`                     | This file — branching, commits, CI, PR rules                               |
| `docs/README.md`                      | Documentation index — navigate all docs from here                          |
| `docs/BRD.md`                         | Product vision, users, competitive positioning, phase plan                 |
| `docs/ARCHITECTURE.md`                | Codebase map (dirs, components, hooks) + architectural decision log        |
| `docs/SCHEMA.md`                      | All Dexie stores with field definitions                                    |
| `docs/PRIVACY.md`                     | PII definitions, anonymisation rules, privacy architecture                 |
| `docs/ROADMAP.md`                     | Phase 1.5/2/3 scope, backend design, architectural decisions               |
| `docs/MILESTONES.md`                  | Full milestone history — M0 through current, all steps                     |
| `docs/features/`                      | Per-feature documentation — what's built, data model, planned improvements |
| `.claude/commands/penny-standards.md` | Best practices skill — loaded at the start of every implementation session |
