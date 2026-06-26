# Onboarding

## What it is
The onboarding experience runs once, the very first time you open Penny. It sets up your encryption keys, explains exactly how Penny protects your data, introduces Chip, and optionally loads a set of realistic demo data so you can explore all the features before entering your own information.

## User-facing capabilities
Step through six screens in order:

1. **Splash** — Penny's logo and tagline; sets the tone for what follows
2. **Privacy promise** — a plain-language explanation of local-first storage, AES-256 encryption, zero trackers, and the fact that there is no backend server receiving your data in Phase 1
3. **Setup credentials** — create a passphrase (minimum strength score of 3/4 on the zxcvbn strength meter) and a PIN (4 to 8 digits) used to unlock the app quickly
4. **Privacy demo** — an interactive walkthrough of Penny's three privacy modes (Safe, Privacy, Open) so you understand what each does before you start
5. **Chip intro** — meet Chip: the AI advisor's avatar is shown with a description of what Chip can help you with
6. **Simulated dashboard** — an animated preview of what a fully populated Penny looks like, giving confidence that the app is worth filling in

After onboarding, you can choose to load demo data — a complete set of realistic transactions, goals, holdings, and accounts — to explore every feature without entering real data first.

**Onboarding v2 (Pre-Phase 1.5, Track 2) — finalized design.** The flow is reordered so the user sees the full value (the simulated dashboard preview) *before* providing personal details, and credentials are set last (so the encryption key exists right before the profile is written):

```
Splash → Privacy Promise (+ Terms/Privacy consent) → Privacy Demo → Meet Chip
  → Simulated Dashboard (preview, "Continue")
  → "Let us know you"  (ONE combined screen)
  → Setup Credentials  (passphrase + 6-digit PIN)
  → [init encryption → write profile + identity → seed demo] → app
```

The single **"Let us know you"** screen collects:
- **Full name** — this is also the display name (one field).
- **Username** — optional; 3–20 chars, lowercase alphanumeric + underscore. Format-validated locally now; server availability check arrives with Phase 1.5 auth. A local `userId` + on-device keypair are also generated (no backend) so the Phase 1.5 "claim your account" upgrade needs no data migration.
- **Date of birth** — with a clear explanation of how Penny uses it (FIRE calculator, NPS projection, EPF retirement estimate, tax slab detection). Stored encrypted; only a 5-year age band is ever sent to the AI.
- **Employment type** — Salaried / Self-employed / Business owner / Student / Retired — gates EPF visibility, tax deductions, and health-score benchmarks.

Personal data is held in memory (an onboarding draft) until the final write — nothing is persisted before encryption is initialized. See [`docs/ROADMAP.md`](../ROADMAP.md) → *Pre-Phase 1.5 Track 2* for the full design (envelope crypto, identity, pricing-readiness).

## How it works
Onboarding lives in `src/features/onboarding/` as a set of screen components routed under `/onboarding/*`.

During the credentials setup screen, `securityManager.ts` initialises **envelope encryption** (Track 2): a random Data Master Key (DMK) encrypts all data, and the DMK is independently wrapped by a passphrase-derived KEK (PBKDF2 600,000 iterations) and a PIN-derived KEK (PBKDF2 200,000 iterations). The DMK lives in memory only (non-extractable) and is cleared on session expiry. Changing the passphrase or PIN only re-wraps the DMK — data is never re-encrypted. Nothing is ever stored in plaintext.

The `profile` store holds: `displayName` (= full name), `currency`, `locale`, `onboardingComplete`, and (Track 2) `dob`, `employmentType`, `username`, `userId`. The on-device keypair and the `plan`/entitlement marker are stored alongside (the keypair in the encrypted DB).

Demo data is seeded by `seedDemoData.ts` immediately after onboarding completes if the user opts in. The seed is **tailored to the chosen employment type** (`salaried | self_employed | business_owner | student | retired`): each persona gets a distinct, realistic income mix (salary vs. retainer + irregular invoices vs. business drawings vs. pocket money/part-time vs. pension/rental), scaled everyday spend, and a fitting set of holdings, liabilities, subscriptions, rent/SIP, and due bills. Calling `seedDemoData(employmentType)` with no argument defaults to `salaried`. If the user later changes employment on the Profile page while still on untouched demo data, `reseedForEmployment(employmentType)` wipes and re-seeds for the new persona (it bails out if any real, non-demo financial data has been created — detected via the activity log).

**Downstream effects of date of birth (wired in Track 2):**
- FIRE calculator pre-fills your current age from DOB (still editable)
- Tax Awareness shows an informational note for your basic-exemption tier (senior 60+ → ₹3L, super-senior 80+ → ₹5L) — informational, not a tax computation
- (EPF/NPS retirement projections already use a per-asset birth year toward age 58/60; pre-filling that from DOB is a future convenience)

**Downstream effects of employment type (wired in Track 2):**
- Salaried: the "Track EPF" prompt is shown; Tax Awareness notes the ₹75,000 standard deduction
- Self-employed / business owner / student: the untracked EPF prompt is hidden (an existing EPF holding is always shown — data is never stranded); self-employed sees an NPS 80CCD(1B) note
- Health score: employment type sets the emergency-fund target (salaried 6 months · self-employed/business 12 · student 3 · retired 6)

Key files:
- `src/features/onboarding/` — all screen components (Splash, PrivacyPromise, SetupCredentials, PrivacyDemo, ChipIntro, SimulatedDashboard)
- `src/core/crypto/securityManager.ts` — encryption initialisation called during setup
- `src/core/db/seedDemoData.ts` — demo data population called post-onboarding

## Current limitations
- No way to re-run onboarding screens without a full app reset — if you want to review the privacy promise again, there is no in-app path
- No biometric (Face ID / fingerprint) auth in Phase 1 — deferred until the React Native apps (WebAuthn-PRF on the PWA is too patchy); PIN is the fastest unlock
- Date of birth and employment type are not yet collected (being added in Track 2)

## Planned improvements
- **Track 2 (in progress):** Onboarding v2 — combined "Let us know you" screen (full name, username, DOB, employment) after the dashboard preview; Change Passphrase + Change PIN (envelope re-wrap, current passphrase required); re-auth to enter Open mode; cloud backup to the user's own Google Drive; a full-reset path; local identity (userId + keypair) ready for Phase 1.5 server registration
- Phase 2: Biometric auth (Face ID / Touch ID) — an extra DMK wrapping slot, native apps
- Phase 2: Cloud backup to iCloud (native); push notifications

## Ideas welcome
- How much detail do users actually want to read in the Privacy Promise screen, versus a shorter summary with a "read more" link?
- Should the Privacy Demo be skippable for returning users who already know the modes?
- Are there employment types missing from the list that affect how Penny should behave?
