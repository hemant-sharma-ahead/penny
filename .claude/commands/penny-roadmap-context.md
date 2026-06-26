# Penny — Roadmap Context

Use this to understand which phase features belong to before implementing anything. This prevents re-asking questions already answered in planning sessions.

---

## What's already built (Phase 1, complete)

All features listed in `docs/features/` are built and shipped. Before adding something that might already exist, read the relevant feature doc.

**Modules built:** Portfolio (Stocks/MF/NPS/PPF/EPF/FD/RD/Gold/Silver/Property/Vehicles/IPO), Expenses (with categories/analytics/import/export/recurring), Goals, Insurance, Accounts (income/transfers/cash), IOUs, Subscriptions, Loans, Events, Home dashboard (net worth/market strip/accounts strip).

**Calculators (M13, in progress):** FIRE, HRA, PPF maturity, NPS corpus, step-up SIP, old vs new tax regime — being built by Pankhuri.

---

## Current phase: Pre-Phase 1.5

**Branch:** `feat/pre-phase-1.5`

**Tracks in order:**
1. Track 5 — Documentation overhaul (in progress)
2. Track 1 — Component extraction (`src/components/ui/` + `src/hooks/`)
3. Track 2 — Onboarding v2 (DOB, employment type, username)
4. Track 3 — Expense category overhaul (management page, icon picker, merge/bulk)
5. Track 4 — Activity log foundation

**One PR at the end after all tracks.**

---

## Phase 1.5 — do NOT implement yet

These decisions are made and documented in `docs/ROADMAP.md`. Do not start implementation until the phase begins.

- **Groups / Household OS** — multi-group model, context switcher on Home, encrypted group keys
- **Phone OTP auth** — server-side phone hash, username, public/private keypair
- **Backend** — Cloudflare Workers (Auth, Groups, API Proxy) + D1 + KV
- **Username server-side availability check**

The username field in onboarding (Track 2) is **UI only** — no server call in Phase 1. Validate format locally, store in encrypted profile. Server lookup happens in Phase 1.5.

---

## Phase 2 — do NOT implement yet

- **Real Chip AI** — `CHIP_MODE` stays `'mock'`. Never add a real Anthropic API call to Phase 1.
- **AI auto-categorisation** — Cloudflare Worker proxy to Anthropic. Phase 2.
- **CAS PDF import** (casparser SDK) — M11 step 70. Phase 2.
- **EPFO passbook PDF** (PDF.js) — M11 step 70. Phase 2.
- **Export PDF/HTML** — wealth snapshot + tax summary. Phase 2.
- **Desktop layout** (≥768px sidebar nav) — Phase 2.
- **Push notifications** (EMI reminders, renewals) — Phase 2 (native app).
- **Watchlist** — Phase 2.
- **Chip mock chat UI** — deferred from M8 step 44. Phase 2.

---

## Architecture decisions already made — don't re-derive

| Topic | Decision | Where documented |
|---|---|---|
| Backend platform | Cloudflare Workers + D1 + KV (not Supabase) | `docs/ROADMAP.md` |
| Auth method | Phone OTP only (no email, no OAuth) | `docs/ROADMAP.md` |
| Backup model | Option A — user-owned cloud (Google Drive/iCloud), no key escrow | `docs/ROADMAP.md` |
| Group key exchange | Asymmetric: encrypt group key with recipient's public key | `docs/ROADMAP.md` |
| Multi-group | A user can be in N groups; each group has independent Group Key | `docs/ROADMAP.md` |
| Context switcher | Home screen dropdown — not a 6th bottom tab | `docs/ROADMAP.md` |
| Sub-categories | Not needed — intentGroup = parent, ExpenseCategory = child, Hashtags = tags | `docs/ROADMAP.md` |
| Category icons | ~80 curated SVGs replacing Tabler text-string (Pre-1.5 Track 3) | `docs/ROADMAP.md` |
| React Native | Shared `src/core/` logic, RN-portable component props API | `docs/ROADMAP.md` |
| AI categorisation | CF Worker → Anthropic. Local rules engine after correction learning | `docs/ROADMAP.md` |
| PBKDF2 counts | 600K (passphrase→MK), 200K (PIN→KEK) — benchmark on mid-range Android (D1) | `docs/ROADMAP.md` |

---

## What the profile will have after Pre-Phase 1.5

The `profile` store will gain these fields (Track 2):
- `dob` — encrypted, used as 5-year age band in AI context, drives FIRE/NPS/EPF projections
- `employmentType` — `'salaried' | 'self_employed' | 'business_owner' | 'student' | 'retired'`
- `username` — optional string, Phase 1 UI-only, Phase 1.5 required for group invites

---

## Competitive context (already researched)

- **Fi Money** — neobank (Federal Bank partnership), requires their bank account, not privacy-first. Launched MCP server 2026.
- **INDmoney** — investment-focused, screen-scrapes EPF (ToS violation), 10M users.
- **Copilot Money** — US-only, Apple-only, $95/year. AI categorisation is strong. MCP concept useful for Phase 2 Chip.
- **Our edge** — privacy-first, E2E encrypted, offline-first, no bank account required, India-specific (EPF/NPS/PPF/IPO), comprehensive (expenses + investments + insurance + loans + household)

No need to research these again.
