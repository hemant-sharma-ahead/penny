# Penny — Developer Guide for Claude Sessions

This file is read at the start of every Claude Code session. It tells you where we are, what the rules are, and what to do next.

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
|-----------|--------|
| M0: Repo + tooling + docs | ✅ Complete |
| M1: Running skeleton (5-tab layout) | ✅ Complete |
| M2: Crypto + DB layer | ✅ Complete |
| M3: CI PII gate | ✅ Complete |
| M4: Onboarding flow | ✅ Complete |
| M5: Feature modules (no AI) | 🔄 In progress — Step 25 (Portfolio) next |
| M6: PWA + responsive polish | ⏳ Pending |
| M7: Hardening | ⏳ Pending |
| M8: Phase 1 + Chip (real Anthropic) | ⏳ Future |

**M5 step tracker:**

| Step | Feature | Status |
|------|---------|--------|
| Infra | formatters, repositories, mockChip, useRepository hook | ✅ Done |
| 22 | Home dashboard (net worth card, Chip insights, module tiles) | ✅ Done |
| 23 | Expenses (list, form, categories, hashtags, budgets) | ✅ Done |
| 24 | Goals (cards, progress rings, SIP calculator) | ✅ Done |
| 25 | Portfolio (holdings, live price fetch, report card) | 🔄 Next |
| 26 | Insurance (policy cards, form, renewal tracker) | ⏳ |
| 27 | Subscription detection (3-pass algorithm) | ⏳ |
| 28 | IOU tracker (lent/borrowed, ageing alerts) | ⏳ |
| 29 | Loan scenarios (6 on-device calculations) | ⏳ |
| 30 | Financial health score (0–100 composite) | ⏳ |
| 31 | Tax awareness (80C/80D/24B, LTCG/STCG) | ⏳ |
| 32 | Cash flow forecast (week/month ahead) | ⏳ |
| 33 | Chip tab (full chat UI, mock streaming) | ⏳ |

**Next step when you pick up a session:** Check this table and resume from the first 🔄 row.

---

## Architecture rules (enforced by ESLint)

1. **`@anthropic-ai/sdk`** may ONLY be imported from `src/core/ai-safety/anthropicClient.ts`
2. **`dexie`** may ONLY be imported from `src/core/db/`
3. **Feature modules** must not cross-import — only from `core/`, `components/`, `context/`, `lib/`
4. **`no-console`** is a warning — never log PII

Never disable these rules with `eslint-disable` comments.

---

## Encryption rules

- **Never access Dexie tables directly** from feature code
- Always use `EncryptedRepository<T>` from `src/core/db/repository.ts`
- The Master Key lives in memory only (`src/core/crypto/keystore.ts`) — cleared on session expiry
- Three-key architecture: passphrase → MK (PBKDF2 600K) → KEK (PBKDF2 200K) → wraps MK

---

## PII rules (see `docs/PRIVACY_RULES.md` for full list)

- `buildUserContext()` in `src/core/ai-safety/buildUserContext.ts` is the ONLY path to Anthropic
- PII categories: direct identifiers (stripped), financial IDs (stripped), bank/lender names (generalised), amounts (banded to ₹10K), merchant names (→ category)
- The CI gate in `tests/pii-gate/piiGate.test.ts` blocks deployment on any PII leak — never skip it

---

## Database schema summary (all 19 stores)

See `docs/SCHEMA.md` for the full field list. Quick reference:

**Encrypted stores** (all sensitive data):
`profile`, `holdings`, `expenses`, `expense_categories`, `budgets`, `hashtags`, `goals`, `goal_contributions`, `assets`, `liabilities`, `insurance_policies`, `chip_insights`, `ai_call_log`, `security`, `subscriptions`, `personal_ious`, `credit_profile`

**Plain stores** (public/cached data, no PII):
`price_cache`, `privacy_stats`

All primary keys are UUIDs (not auto-increment — sync-ready).

---

## Privacy modes

```ts
type PrivacyMode = 'safe' | 'privacy' | 'open';
```

- `safe` (amber, default): amounts masked as ••••
- `privacy` (violet): module names only, no amounts  
- `open` (green): everything visible, PIN required to switch to

Provided by `PrivacyContext` in `src/context/PrivacyContext.tsx`. Use `usePrivacy()` hook everywhere — never check mode directly in feature components.

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

Bottom nav tabs: Home · Portfolio · Chip (FAB, centred) · Expenses · Goals

---

## Design tokens

```css
--color-primary: #00A86B;       /* Penny green */
--color-safe: #F59E0B;          /* Amber — Safe mode */
--color-privacy: #7C3AED;       /* Violet — Privacy mode */
--color-open: #10B981;          /* Emerald — Open mode */
```

---

## Phase 1 feature list (no AI, no account)

**5 core modules:** Portfolio, Expenses, Net Worth & Goals, Insurance, Privacy system

**BRD v4.0 additions** (all on-device):
- Subscription detection, IOU tracker, loan repayment scenarios (6 types), liabilities expanded (12 types, 22 fields)

**WhatsNext features** (use existing data):
- Tax awareness (80C/80D/24B, LTCG/STCG), Financial health score (0–100), Cash flow forecast

---

## Chip AI (Phase 1 + Chip — future)

- `mockChip.ts` provides simulated responses during development
- `CHIP_MODE: 'mock' | 'real'` flag controls which path is used
- Real path: `buildUserContext()` → PII scanner → Anthropic SDK → `claude-sonnet-4-6`
- Temp: 0.3 (analysis), 0.7 (conversation). Max tokens: 1200 / 800

---

## Open decisions

| # | Decision | Status |
|---|----------|--------|
| D1 | PBKDF2 iteration counts (600K/200K) | Confirm after benchmarking on mid-range Android |
| D2 | Passphrase strength (zxcvbn ≥ 3) | Confirmed |
| D3 | PWA hosting | Cloudflare Pages recommended |
| D4 | Anthropic API key handling | User-supplied, encrypted with MK |

---

## Key files

| File | Purpose |
|------|---------|
| `src/core/db/schema.ts` | All 19 Dexie stores — everything depends on this |
| `src/core/crypto/securityManager.ts` | All reads/writes flow through this |
| `src/core/ai-safety/buildUserContext.ts` | Only path to Anthropic |
| `src/core/ai-safety/mockChip.ts` | All Phase 1 dev runs on this |
| `tests/pii-gate/piiGate.test.ts` | CI gate — never skip |
| `src/context/PrivacyContext.tsx` | Privacy mode — wraps entire app |
| `src/router/index.tsx` | All routes + AuthGuard |
