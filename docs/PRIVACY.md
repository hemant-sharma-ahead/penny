# Penny — Privacy & PII Rules

**Version:** 1.2+  
**Last updated:** July 2026 (Phase 1.5 group/household privacy — Tracks B–E; Model B backup)

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

Any factor unwraps the _same_ DMK. **Changing the passphrase or PIN only re-wraps the DMK — data is never re-encrypted** — and the old wrapping is deleted so the old secret stops working. Changing the passphrase **requires the current passphrase**.

**Critical invariants:**

- The DMK **never** exists in persistent storage — only in memory (non-extractable) during an active session.
- The DMK is random — it reveals nothing about any chosen secret.
- If the passphrase is lost, data is permanently unrecoverable. No key escrow. This is by design.
- Session clears the DMK from memory after PIN timeout.
- Backup (.penny file / cloud) carries the DMK wrapped by the backup passphrase — we store the key nowhere.

> Supersedes the earlier "passphrase-derived Master Key" model. Existing vaults migrate without re-encryption: the old MK simply becomes the opaque DMK. See `docs/ROADMAP.md` → _Pre-Phase 1.5 Track 2_.

---

## PIN & lockout policy (Track 2)

- The PIN is **mandatory** and cannot be disabled — it's one of the two DMK wrappings and the quick-unlock factor.
- **One shared lockout** across every PIN entry point (unlock, Open-mode re-auth, change-PIN): 5 attempts → exponential backoff (5→10→20→40 min, capped 24h). A failed attempt shows "attempts remaining."
- **Trivial PINs are rejected** (all-same, straight sequences, common values).
- **PIN changes are limited to once per 24h**; a 21-day rotation reminder nudges periodic changes.
- **Opt-in anti-theft (off by default):** erase all local data after N consecutive failed attempts — irreversible, no recovery.
- **Opt-in:** lock immediately when the app is backgrounded (otherwise after 30 min idle).

## PII categories and treatments

### Category 1 — Direct identifiers (stripped entirely)

These are never included in any AI context.

| Data point             | Treatment                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Full name              | Removed                                                                              |
| Phone number           | Removed                                                                              |
| Email address          | Removed                                                                              |
| PAN number             | Removed                                                                              |
| Aadhaar number         | Removed                                                                              |
| Passport number        | Removed                                                                              |
| Driving licence number | Removed                                                                              |
| Vehicle RC number      | Removed                                                                              |
| IOU person names       | Replaced with "Person 1", "Person 2", etc. (ordinal, not consistent across sessions) |
| Group member names     | Replaced with ordinal labels (same rule as IOU names) — Phase 1.5 Tracks B–E         |
| Account numbers (bank) | Removed                                                                              |
| Demat account number   | Removed                                                                              |
| UPI ID                 | Removed                                                                              |

### Category 2 — Financial identifiers (stripped or generalised)

| Data point             | Treatment                                                     |
| ---------------------- | ------------------------------------------------------------- |
| Bank name              | Replaced with generic "Bank A", "Bank B"                      |
| Lender name (loan)     | Replaced with "Lender A", "Lender B"                          |
| Insurance company name | Replaced with "Insurer A", "Insurer B"                        |
| Employer name          | Replaced with "Company A" (current), "Previous Company" (old) |
| MF fund house name     | Allowed (public information, no PII)                          |
| Stock ticker/symbol    | Allowed (public information, no PII)                          |
| Property address       | Removed entirely                                              |
| Vehicle make/model     | Removed; asset type only ("Vehicle")                          |

### Category 3 — Amounts (banded to ₹10,000 granularity)

Raw amounts are never sent. They're banded into rounded ranges:

- ₹850 → "₹0–10K"
- ₹23,400 → "₹20–30K"
- ₹1,87,000 → "₹1.8–1.9L"
- ₹48,00,000 → "₹4.7–4.8Cr"

The banding logic is in `buildUserContext()`. The AI sees approximate financial scale, not actual amounts.

### Category 4 — Sensitive personal facts

| Data point                    | Treatment                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Date of birth                 | Sent as 5-year age band only: "29–34" (not exact date, not exact age)                                         |
| Health conditions (insurance) | Policy type only ("Health insurance") — no diagnosis, no condition details                                    |
| Medical expenses              | Category only ("Healthcare") — no merchant names, no amount details                                           |
| Salary                        | Banded to ₹10K (Category 3 treatment)                                                                         |
| Credit score                  | Sent as range: "700–750"                                                                                      |
| Credit tradeline details      | `raw_report_encrypted` field from `credit_profile` store is **never sent** — contains PAN and full tradelines |

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

| Mode      | Display                       | Colour           | Default |
| --------- | ----------------------------- | ---------------- | ------- |
| `safe`    | Amounts masked as ••••        | Amber (#f59e0b)  | Yes     |
| `privacy` | Module names only, no amounts | Violet (#7c3aed) | No      |
| `open`    | All data visible              | Red (#dc2626)    | No      |

**Switching to `open` mode requires PIN verification.** This is a deliberate friction point — Open mode shows all data on screen, which is a shoulder-surfing risk.

The default mode can be changed in Settings. The privacy badge in the header shows the current mode. Users can tap it to switch modes (with PIN gate for switching to Open).

---

## Data stored on-device

### Encrypted stores (IndexedDB, AES-256-GCM)

All 17 primary stores are encrypted:
`profile`, `holdings`, `expenses`, `expense_categories`, `budgets`, `hashtags`, `goals`, `goal_contributions`, `assets`, `liabilities`, `insurance_policies`, `chip_insights`, `ai_call_log`, `security`, `subscriptions`, `personal_ious`, `credit_profile`

Plus the stores added in later milestones (see `docs/SCHEMA.md` for the authoritative list):
`accounts`, `activity_log`, `merchant_memory`, `transaction_templates` (Pre-Phase 1.5); `persons`, `ledger_entries` (Phase 1.5 Track 1); `device_keys`, `group_keys`, `sync_cursor` (Phase 1.5 Track B — device keypairs, per-group keys, sync cursors; private key material is DMK-encrypted like everything else).

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

In Phase 1.5+, the backend (Cloudflare Workers + D1 + R2) is designed so the server sees only:

- **No phone number, no email — no PII.** (Phone + OTP was dropped; the earlier "hashed phone" design is gone.)
- **Optional** username (public — a self-chosen sharing handle; it can never decrypt anything). The permanent identity anchor is `userId` (a UUID), not the username.
- Device public keys (signing + wrapping) + a random `deviceId`. **Registration (Track C) uploads only the public JWKs** — the private keys never leave the device.
- Group-membership metadata (which `userId`s are in which group) + per-group **encrypted event ciphertext** (server cannot decrypt) + **key-grant ciphertext** relayed between members.

**Request authentication (Track C).** Authenticated calls are signed: the device signs `nonce‖method‖path‖sha256(body)` with its private signing key, and the worker verifies against the stored public key using a single-use nonce. **No password or passphrase is ever sent** — the passphrase never leaves the device.

**The server never stores a personal backup blob (Model B).** Personal data lives on-device and in the user's **own Google Drive/iCloud** — see the Backup model section below. See `docs/BACKEND_STRATEGY.md` §5 and `docs/ROADMAP.md` for the full Phase 1.5 backend design.

---

## Backup model (Track 2)

The encrypted backup exports a `.penny` file containing every encrypted store (raw rows) plus the security record. The bundle is encrypted with the **DMK**; the file header carries the DMK **wrapped by the passphrase** (v2) so restore can recover it. Properties:

- Encrypted on-device before it leaves; neither Google nor we can read it.
- Restored by entering the **passphrase** → unwrap the DMK → decrypt → bulk-restore → session re-locks (re-enter PIN). Old **v1** files (legacy passphrase-derived MK) still restore.
- **Never stored by Penny.** Two destinations:
  - **Manual file** — user downloads the `.penny` and keeps it themselves.
  - **Google Drive (cloud)** — uploaded to the user's own Drive `appDataFolder`. Routed through the entitlement gate; **inert until a Google client ID + matching CSP entries are configured** (until then the UI is disabled).

**Phase 1.5 (Model B):** the user's own Drive/iCloud becomes the **primary** recovery path — our servers store **no personal blob**. On a fresh device, recovery is: sign into Drive/iCloud → pull the encrypted `.penny` blob (which carries the data + device keypair + every Group Key) → enter passphrase; the server's membership table then says which groups to re-pull. Groups reappear from **server membership**, personal history from **Drive** (the WhatsApp split). A `mergeBundle()` (non-destructive, last-write-wins) merges pulls without clobbering local changes. See `docs/BACKEND_STRATEGY.md` §5.

**Track D — automatic backup:** backup runs automatically (debounced on change + daily). It uploads only the **already-encrypted** `.penny` blob to the user's **own** Google Drive (`drive.appdata` scope) or iCloud — never to our servers, and readable by no one without the passphrase. When no cloud destination is chosen, a **daily on-device OPFS snapshot** is kept (same-origin — a convenience safeguard, not disaster recovery; the UI recommends cloud). Background pulls decrypt with the in-memory DMK (`openBundleWithDmk`); a blob from a different vault is refused (`ForeignBlobError`), never silently merged.

**Full reset:** "Erase all data" wipes every local store and the encryption keys, returning to onboarding. Irreversible without a backup — no escrow.

---

## IOU privacy

Person names in the IOU tracker are Category 1 PII. They are:

- Stored encrypted in the `personal_ious` store
- Never sent to the Anthropic API
- In AI context, referred to as "Person 1", "Person 2" — ordinal labels that are not consistent across sessions (so the AI cannot correlate IOU relationships over time)

---

## Group & household privacy (Phase 1.5 — Tracks B–E)

Groups/sharing are an **additive, opt-in layer**. The offline single-user app stays fully usable with no backend, and nothing here weakens the local encryption model. The privacy design:

### Device identity keys (Track B)

- Each synced device holds two **P-256 keypairs** — an **ECDSA signing** key (authenticates requests to the workers) and an **ECDH wrapping** key (receives the DMK during device pairing and Group Keys during grants). Stored in the `device_keys` store.
- **Private keys never leave the device in plaintext.** They are DMK-encrypted at rest like all other data and only their **public** halves are uploaded to the server.
- Keys are generated **lazily at claim** — a purely local, offline user never generates them, so there is no identity footprint until the user opts into sharing.

### Per-group encryption (Tracks B/E)

- Each group has its own random **AES-256-GCM Group Key** (`group_keys` store). A user can be in many groups; **each group's data is independently encrypted** — a compromise of one group key never exposes another.
- **Key exchange happens between members' public keys.** The server relays only **ciphertext key-grants** — it never sees a Group Key.
- **Key rotation on member-leave:** the epoch is bumped and the new key re-wrapped to remaining members; a **departed member cannot decrypt events created after they left**. (Old epochs are retained so a long-offline member can still decrypt historical events — hence the composite `groupId:epoch` id.)

### The multi-group sharing boundary (Track E)

- **Per-item share = a group selector, not a boolean.** Every expense/goal/IOU defaults to **Personal**; the user explicitly pushes an item to one or more groups.
- An item shared to "Trip" is **invisible to "Family"** and invisible to Personal-only views on other devices. This per-item selector is the privacy boundary between contexts.

### Group member names & AI

- Real member names (and any linked `Person` name/phone) are **Category 1 PII** — the same rule as IOU person names. They are **never sent raw to Chip**; the ordinal-label rule (`assignOrdinalLabels` — "Person 1/2/…", not stable across sessions) is the single enforcement point and covers group members too.

### Settle-up stores no payment handles

- Penny stores **no UPI VPA** and generates **no payee QR**. Settling is only a **recorded ledger entry**; the actual payment happens in whatever UPI app the user already trusts. This is a deliberate privacy choice — we don't hold payment identifiers.

### Invites

- An invite carries only `SHA-256(secret)` + TTL + optional `max_uses` on the server; the **raw secret lives only in the link/QR** (shared over WhatsApp), and the **Group Key is never in the invite**. Invites are one-time-use by default and revocable.

### What the server can and cannot see (Model B)

- **Can see:** device public keys, an optional public username, the group-membership graph (which `userId`s share a group), and per-group **encrypted** event + key-grant ciphertext.
- **Cannot see:** any financial data, any personal backup blob (that's in the user's **own Drive/iCloud**), any Group Key or plaintext, any name/phone/amount. No phone, no PII.

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
