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

| Milestone                           | Status                                              |
| ----------------------------------- | --------------------------------------------------- |
| M0: Repo + tooling + docs           | ✅ Complete                                         |
| M1: Running skeleton (5-tab layout) | ✅ Complete                                         |
| M2: Crypto + DB layer               | ✅ Complete                                         |
| M3: CI PII gate                     | ✅ Complete                                         |
| M4: Onboarding flow                 | ✅ Complete                                         |
| M5: Feature modules (no AI)         | ✅ Complete                                         |
| M6: PWA + responsive polish         | ✅ Complete                                         |
| M7: Hardening                       | ✅ Complete                                         |
| M8: Phase 1 polish                  | ✅ Complete                                         |
| M9: Income, transfers & cash        | 🔄 Next — scope discussion required before starting |
| M10: Chip (AI integration)          | ⏳ Future                                           |

**M5 step tracker:**

| Step  | Feature                                                      | Status  |
| ----- | ------------------------------------------------------------ | ------- |
| Infra | formatters, repositories, mockChip, useRepository hook       | ✅ Done |
| 22    | Home dashboard (net worth card, Chip insights, module tiles) | ✅ Done |
| 23    | Expenses (list, form, categories, hashtags, budgets)         | ✅ Done |
| 24    | Goals (cards, progress rings, SIP calculator)                | ✅ Done |
| 25    | Portfolio (holdings, live price fetch, report card)          | ✅ Done |
| 26    | Insurance (policy cards, form, renewal tracker)              | ✅ Done |
| 27    | Subscription detection (3-pass algorithm)                    | ✅ Done |
| 28    | IOU tracker (lent/borrowed, ageing alerts)                   | ✅ Done |
| 29    | Loan scenarios (6 on-device calculations)                    | ✅ Done |
| 30    | Financial health score (0–100 composite)                     | ✅ Done |
| 31    | Tax awareness (80C/80D/24B, LTCG/STCG)                       | ✅ Done |
| 32    | Cash flow forecast (week/month ahead)                        | ✅ Done |

**M5 is complete.** Step 33 (Chip tab) moved to M9.

**M6 step tracker:**

| Step | Feature                                                  | Status  |
| ---- | -------------------------------------------------------- | ------- |
| 34   | PWA setup (vite-plugin-pwa, Workbox, CSP, offline icons) | ✅ Done |
| 35   | Responsive audit (360/390/768px, tap targets ≥44px)      | ✅ Done |

**M6 is complete.**

**M7 step tracker:**

| Step | Feature                                                                  | Status  |
| ---- | ------------------------------------------------------------------------ | ------- |
| 36   | PIN lockout UI (countdown, exponential backoff, attempt warnings)        | ✅ Done |
| 37   | 21-day PIN rotation banner (AuthGuard always checks, shown after unlock) | ✅ Done |
| 38   | Encrypted backup/restore (.penny export/import, passphrase-derived MK)   | ✅ Done |
| 39   | Final CI pass + CLAUDE.md updated                                        | ✅ Done |

**M7 is complete.**

**M8 step tracker:**

| Step | Feature                                                                         | Status  |
| ---- | ------------------------------------------------------------------------------- | ------- |
| 40   | Visual identity — Penny SVG logo, Chip avatar, updated PWA icons                | ✅ Done |
| 41   | Settings drawer — module visibility toggles, font scale slider                  | ✅ Done |
| 42   | Privacy mode switcher — 3-segment toggle, PIN gate for Open, theme tinting      | ✅ Done |
| 42b  | Light/dark theme system (Penny Light + Penny Dark)                              | ✅ Done |
| 43   | Demo data seeding — realistic sample records on first onboarding                | ✅ Done |
| 44   | Chip mock chat UI — full message UI wired to mockChip.ts                        | ✅ Done |
| 45   | Expense categories rethink + analytics tab + budget tab polish                  | ✅ Done |
| 46   | Import expenses — Penny CSV template + YNAB/Cashew/MoneyView parsers, 3-step UI | ✅ Done |
| 47   | Export CSV — AES-256 password-protected ZIP, date range picker                  | ✅ Done |
| 48   | Responsive/laptop layout                                                        | ⏳ Deferred to Phase 2 |
| 49   | Final CI pass + CLAUDE.md updated                                               | ✅ Done |

**M8 is complete.** Step 48 (desktop layout) deferred to Phase 2 — app is mobile-first and Phase 1 use case does not require it.

**Next step when you pick up a session:** M9 — Income, transfers & cash. Requires scope discussion first: data model changes (income/transfer types on expenses), cash account tracking, net cash flow view. Have this conversation with the user before writing any code.

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
--color-primary: #00a86b; /* Penny green */
--color-safe: #f59e0b; /* Amber — Safe mode */
--color-privacy: #7c3aed; /* Violet — Privacy mode */
--color-open: #10b981; /* Emerald — Open mode */
```

---

## Semantic theme utilities (use these in all components)

Defined in `src/index.css` via `@layer utilities`. These reference CSS variables so they auto-switch between Penny Light and Penny Dark — **never use hardcoded Tailwind colors** (`bg-white`, `text-slate-900`, `border-slate-100`) in new components.

| Class                 | What it does                                                       |
| --------------------- | ------------------------------------------------------------------ |
| `bg-surface`          | Card / panel background (`--color-surface`)                        |
| `bg-surface-2`        | Slightly deeper background (`--color-surface-secondary`)           |
| `bg-surface-3`        | Body / page background (`--color-surface-tertiary`)                |
| `text-primary`        | Primary text (`--color-text-primary`)                              |
| `text-secondary`      | Secondary / label text (`--color-text-secondary`)                  |
| `text-tertiary`       | Muted / placeholder text (`--color-text-tertiary`)                 |
| `border-theme`        | Standard border color (`--color-border`)                           |
| `border-theme-strong` | Emphasis border color (`--color-border-strong`)                    |
| `surface`             | Card shorthand: `bg-surface` + `1px solid border-theme`            |
| `input-surface`       | Input shorthand: bg + text + border-color for `<input>`/`<select>` |

**Usage example:**

```tsx
<div className="surface rounded-2xl p-4">
  <h2 className="text-primary font-semibold">Title</h2>
  <p className="text-secondary text-sm">Subtitle</p>
  <input className="input-surface border rounded-xl px-3 py-2" />
</div>
```

For inline styles that reference CSS variables (e.g. SVG `fill`, dynamic colors), continue using `style={{ color: 'var(--color-text-primary)' }}`.

---

## Phase 1 feature list (no AI, no account)

**5 core modules:** Portfolio, Expenses, Net Worth & Goals, Insurance, Privacy system

**BRD v4.0 additions** (all on-device):

- Subscription detection, IOU tracker, loan repayment scenarios (6 types), liabilities expanded (12 types, 22 fields)

**WhatsNext features** (use existing data):

- Tax awareness (80C/80D/24B, LTCG/STCG), Financial health score (0–100), Cash flow forecast

---

## Chip AI (M9 — future)

- `mockChip.ts` provides simulated responses during development
- `CHIP_MODE: 'mock' | 'real'` flag controls which path is used
- Real path: `buildUserContext()` → PII scanner → Anthropic SDK → `claude-sonnet-4-6`
- Temp: 0.3 (analysis), 0.7 (conversation). Max tokens: 1200 / 800

---

## Open decisions

| #   | Decision                            | Status                                          |
| --- | ----------------------------------- | ----------------------------------------------- |
| D1  | PBKDF2 iteration counts (600K/200K) | Confirm after benchmarking on mid-range Android |
| D2  | Passphrase strength (zxcvbn ≥ 3)    | Confirmed                                       |
| D3  | PWA hosting                         | Cloudflare Pages recommended                    |
| D4  | Anthropic API key handling          | User-supplied, encrypted with MK                |

---

## Key files

| File                                     | Purpose                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| `src/core/db/schema.ts`                  | All 19 Dexie stores — everything depends on this      |
| `src/core/crypto/securityManager.ts`     | All reads/writes flow through this                    |
| `src/core/ai-safety/buildUserContext.ts` | Only path to Anthropic                                |
| `src/core/ai-safety/mockChip.ts`         | All Phase 1 dev runs on this                          |
| `src/core/import/importParsers.ts`       | CSV parsers: Penny, YNAB, Cashew, MoneyView           |
| `src/core/export/exportCsv.ts`           | CSV export + AES-256 ZIP download (zip.js, no workers)|
| `src/core/db/seedDemoData.ts`            | Demo data seeding — called once after onboarding      |
| `tests/pii-gate/piiGate.test.ts`         | CI gate — never skip                                  |
| `src/context/PrivacyContext.tsx`         | Privacy mode — wraps entire app                       |
| `src/context/SettingsContext.tsx`        | Module visibility + font scale (localStorage)         |
| `src/router/index.tsx`                   | All routes + AuthGuard                                |
