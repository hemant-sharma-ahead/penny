# Penny — Privacy & PII Rules

**Version:** 1.1+  
**Last updated:** June 2026

This document defines what is and isn't PII in Penny, how each category is handled when sent to Chip AI, and the overall privacy architecture.

---

## Privacy architecture

Penny is local-first and encrypted-at-rest. The architecture has three layers:

1. **On-device encryption (AES-256-GCM)** — all sensitive data encrypted before writing to IndexedDB. Decrypted only in memory, never on disk in plaintext.

2. **PII anonymisation pipeline** — before any data touches the Anthropic API, it passes through `buildUserContext()` in `src/core/ai-safety/buildUserContext.ts`. This strips, bands, and generalises PII into statistical proxies.

3. **CI gate** — `tests/pii-gate/piiGate.test.ts` automatically blocks any deployment where raw PII would reach the AI. This test must never be skipped.

---

## Envelope encryption model (Track 2)

```
Data Master Key (DMK, random 256-bit AES-GCM)
    └── Encrypts all user data in IndexedDB
    └── In memory only, non-extractable, while unlocked

The DMK is wrapped independently by each unlock factor and only the
wrapped form is stored in IndexedDB — never the bare DMK:

  User passphrase ── PBKDF2 (600K, SHA-256) ── KEK ──wraps──▶ [DMK]
  User PIN        ── PBKDF2 (200K, SHA-256) ── KEK ──wraps──▶ [DMK]
  (biometric/device key — Phase 2 native — another wrapping slot)
```

Any factor unwraps the *same* DMK. **Changing the passphrase or PIN only re-wraps the DMK — data is never re-encrypted** — and the old wrapping is deleted so the old secret stops working. Changing the passphrase **requires the current passphrase**.

**Critical invariants:**
- The DMK **never** exists in persistent storage — only in memory (non-extractable) during an active session.
- The DMK is random — it reveals nothing about any chosen secret.
- If the passphrase is lost, data is permanently unrecoverable. No key escrow. This is by design.
- Session clears the DMK from memory after PIN timeout.
- Backup (.penny file / cloud) carries the DMK wrapped by the backup passphrase — we store the key nowhere.

> Supersedes the earlier "passphrase-derived Master Key" model. Existing vaults migrate without re-encryption: the old MK simply becomes the opaque DMK. See `docs/ROADMAP.md` → *Pre-Phase 1.5 Track 2*.

---

## PII categories and treatments

### Category 1 — Direct identifiers (stripped entirely)

These are never included in any AI context.

| Data point | Treatment |
|---|---|
| Full name | Removed |
| Phone number | Removed |
| Email address | Removed |
| PAN number | Removed |
| Aadhaar number | Removed |
| Passport number | Removed |
| Driving licence number | Removed |
| Vehicle RC number | Removed |
| IOU person names | Replaced with "Person 1", "Person 2", etc. (ordinal, not consistent across sessions) |
| Account numbers (bank) | Removed |
| Demat account number | Removed |
| UPI ID | Removed |

### Category 2 — Financial identifiers (stripped or generalised)

| Data point | Treatment |
|---|---|
| Bank name | Replaced with generic "Bank A", "Bank B" |
| Lender name (loan) | Replaced with "Lender A", "Lender B" |
| Insurance company name | Replaced with "Insurer A", "Insurer B" |
| Employer name | Replaced with "Company A" (current), "Previous Company" (old) |
| MF fund house name | Allowed (public information, no PII) |
| Stock ticker/symbol | Allowed (public information, no PII) |
| Property address | Removed entirely |
| Vehicle make/model | Removed; asset type only ("Vehicle") |

### Category 3 — Amounts (banded to ₹10,000 granularity)

Raw amounts are never sent. They're banded into rounded ranges:
- ₹850 → "₹0–10K"
- ₹23,400 → "₹20–30K"
- ₹1,87,000 → "₹1.8–1.9L"
- ₹48,00,000 → "₹4.7–4.8Cr"

The banding logic is in `buildUserContext()`. The AI sees approximate financial scale, not actual amounts.

### Category 4 — Sensitive personal facts

| Data point | Treatment |
|---|---|
| Date of birth | Sent as 5-year age band only: "29–34" (not exact date, not exact age) |
| Health conditions (insurance) | Policy type only ("Health insurance") — no diagnosis, no condition details |
| Medical expenses | Category only ("Healthcare") — no merchant names, no amount details |
| Salary | Banded to ₹10K (Category 3 treatment) |
| Credit score | Sent as range: "700–750" |
| Credit tradeline details | `raw_report_encrypted` field from `credit_profile` store is **never sent** — contains PAN and full tradelines |

---

## What IS allowed in AI context

The following are not PII and may be sent to Chip:

- **Asset classes** — "holding in equities, MFs, EPF" (not amounts, not names)
- **Category distributions** — "65% spending in Food & Transport" (percentage, not amount)
- **MF fund house and scheme names** — public market information
- **Stock tickers** — public market information
- **Financial year** — current FY context
- **Goal types** — "emergency fund goal, home purchase goal" (not target amounts)
- **NPS lifecycle fund type** — LC-75/LC-50/BLC etc. (public scheme names)
- **Insurance policy types** — "term life, health insurance" (not policy numbers, not insurer names)
- **IPO interest** — "has applied for IPOs" (no names, no amounts)
- **General financial health bands** — "health score 68/100 (moderate)"

---

## Privacy modes

Three modes control what's visible on-screen. These are independent of encryption — all data is always encrypted at rest regardless of mode.

```ts
type PrivacyMode = 'safe' | 'privacy' | 'open';
```

| Mode | Display | Colour | Default |
|---|---|---|---|
| `safe` | Amounts masked as •••• | Amber (#f59e0b) | Yes |
| `privacy` | Module names only, no amounts | Violet (#7c3aed) | No |
| `open` | All data visible | Red (#dc2626) | No |

**Switching to `open` mode requires PIN verification.** This is a deliberate friction point — Open mode shows all data on screen, which is a shoulder-surfing risk.

The default mode can be changed in Settings. The privacy badge in the header shows the current mode. Users can tap it to switch modes (with PIN gate for switching to Open).

---

## Data stored on-device

### Encrypted stores (IndexedDB, AES-256-GCM)

All 17 primary stores are encrypted:
`profile`, `holdings`, `expenses`, `expense_categories`, `budgets`, `hashtags`, `goals`, `goal_contributions`, `assets`, `liabilities`, `insurance_policies`, `chip_insights`, `ai_call_log`, `security`, `subscriptions`, `personal_ious`, `credit_profile`

Plus the new stores added in later milestones:
`accounts`, `activity_log` (added in Pre-Phase 1.5)

### Plain stores (IndexedDB, no encryption)

Two stores contain no PII and are not encrypted:
- `price_cache` — market prices, MF NAVs, IPO data (all public data)
- `privacy_stats` — aggregate usage counts (no per-transaction data)

---

## Data that is never stored

- Plain text passwords, PINs, or passphrases (only their derived keys)
- The Master Key in persistent storage (memory only)
- Raw bank statement data (import is parsed and discarded after user review)
- Browser cookies for financial data (we use IndexedDB only)
- Any data from external APIs that contains PII (RC lookup response: only depreciation value stored, not raw RC data)

---

## What the server sees (Phase 1)

In Phase 1, there is **no backend server.** The app is a static PWA hosted on Cloudflare Pages. Nothing is sent to our servers.

The only network calls are to third-party APIs (MFAPI.in, Yahoo Finance, investorgain.com, etc.) and these receive only public lookup parameters — stock tickers, MF scheme codes, IPO listing names. No user data.

In Phase 1.5+, the backend architecture is designed so the server sees only:
- Hashed phone number (never plaintext)
- Username (public — used for invites)
- Public key (for group key exchange)
- Encrypted ciphertext blobs (for group data sync — server cannot decrypt)

See `docs/ROADMAP.md` for the Phase 1.5 backend design.

---

## Backup model

The encrypted backup feature exports a `.penny` file containing all user data encrypted with a user-chosen backup passphrase. This file is:
- Encrypted before it leaves the device
- Identical in structure to the on-device storage (just differently keyed)
- Never stored by Penny — the user downloads it and stores it themselves
- Restorable on any device with the correct backup passphrase

The backup uses PBKDF2-derived key from the backup passphrase, independently of the app PIN or device passphrase.

---

## IOU privacy

Person names in the IOU tracker are Category 1 PII. They are:
- Stored encrypted in the `personal_ious` store
- Never sent to the Anthropic API
- In AI context, referred to as "Person 1", "Person 2" — ordinal labels that are not consistent across sessions (so the AI cannot correlate IOU relationships over time)

---

## Credit profile privacy

The `credit_profile` store has two fields:
- `summary` — human-readable summary (score range, account count, etc.) — may be sent to AI in banded form
- `raw_report_encrypted` — full bureau report data including PAN and tradelines — **never sent to AI, never shown outside the credit profile screen**

---

## Developer responsibilities

1. **Never bypass `buildUserContext()`** to send data to the AI
2. **Never read from Dexie tables directly** — always use `EncryptedRepository`
3. **Never log financial data** — `console.log(expense.amount)` is a PII leak
4. **Never weaken the CI gate** — `tests/pii-gate/piiGate.test.ts` must always pass
5. **Never store data in localStorage or sessionStorage** — IndexedDB only, through the repository
6. When adding new fields to any store, evaluate the PII category and update this document
