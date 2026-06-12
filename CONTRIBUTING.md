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

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + Vite build |
| `npm run lint` | ESLint on `src/` |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier write on `src/` |
| `npm run format:check` | Prettier check (used in CI) |
| `npm run type-check` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run test:ci` | Vitest (CI mode, fails fast) |

---

## Commit conventions

Each step or module gets its own commit. Format:
```
feat(module): short description
chore: tooling/config change
test: test additions
fix(module): bug description
```

---

## Key documents

| File | What it covers |
|------|---------------|
| `CLAUDE.md` | Full developer guide for AI-assisted sessions |
| `docs/DEVELOPMENT_PLAN.md` | Phased roadmap with feature lists |
| `docs/SCHEMA.md` | All 19 Dexie stores with field definitions |
| `docs/PRIVACY_RULES.md` | PII definitions and anonymisation rules |
| `docs/FEATURES.md` | Complete feature specification |
| `.claude/commands/penny-standards.md` | Code standards loaded in every Claude session |
