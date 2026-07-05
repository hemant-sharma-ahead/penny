# Onboarding

## What it is

The onboarding experience runs once, the very first time you open Penny. It sets up your encryption keys, explains exactly how Penny protects your data, introduces Chip, and optionally loads a set of realistic demo data so you can explore all the features before entering your own information.

## User-facing capabilities

Step through the intro screens in order, then choose how to start:

1. **Splash** — Penny's logo and tagline; sets the tone for what follows
2. **Privacy promise** — a plain-language explanation of local-first storage, AES-256 encryption, zero trackers, and how Penny stores nothing personal on any server (Model B)
3. **Privacy demo** — an interactive walkthrough of Penny's three privacy modes (Safe, Privacy, Open) so you understand what each does before you start
4. **Chip intro** — meet Chip: the AI advisor's avatar is shown with a description of what Chip can help you with
5. **Simulated / preview dashboard** — an animated preview of what a fully populated Penny looks like, giving confidence that the app is worth filling in, ending in a **"Set up my account"** button
6. **How would you like to start?** (`/onboarding/start`) — three plain doors: **Start fresh**, **Restore from backup**, or **Reclaim my handle**
7. **Account screen** (`/onboarding/account`) — the same three choices as segmented tabs (so you can switch): the **new** tab continues into profile + credentials setup; **restore** brings everything back from a backup; **reclaim** recovers your handle with your passphrase

Only the **new** path continues to **"Let us know you"** → **Set up your vault** (credentials) → the app. Restore and reclaim recover an existing account without seeding demo data (see _Restore & reclaim_ below).

After onboarding, you can choose to load demo data — a complete set of realistic transactions, goals, holdings, and accounts — to explore every feature without entering real data first.

**Onboarding v2 (Pre-Phase 1.5, Track 2) — finalized design.** The flow is reordered so the user sees the full value (the simulated dashboard preview) _before_ providing personal details, and credentials are set last (so the encryption key exists right before the profile is written):

```
Splash → Privacy Promise (+ Terms/Privacy consent) → Privacy Demo → Meet Chip
  → Simulated Dashboard (preview, "Set up my account")
  → Account start (start fresh / restore / reclaim)
  → Account screen — NEW tab
  → "Let us know you"  (ONE combined screen)
  → Setup Credentials  (passphrase + 6-digit PIN)
  → [init encryption → write profile + identity → claim handle → seed demo] → app
```

The single **"Let us know you"** screen collects:

- **Full name** — this is also the display name (one field).
- **Username** — **mandatory on sync builds** (when the `sync` entitlement is on): it's the account handle used for recovery and for sharing with household members. A live, debounced availability check (`checkUsername`) confirms the handle is free before you continue, so the server claim can't fail on a taken name. 3–20 chars, lowercase alphanumeric + underscore. On Phase-1-only (non-sync) builds it stays optional and cosmetic. A local `userId` + on-device keypair are generated regardless.
- **Date of birth** — required, with a clear explanation of how Penny uses it (FIRE calculator, NPS projection, EPF retirement estimate, tax slab detection). Stored encrypted; only a 5-year age band is ever sent to the AI.
- **Employment type** — required; Salaried / Self-employed / Business owner / Student / Retired — gates EPF visibility, tax deductions, and health-score benchmarks.

Personal data is held in memory (an onboarding draft) until the final write — nothing is persisted before encryption is initialized.

On the **Set up your vault** step, once encryption is live, Penny writes the profile + local identity and, on sync builds, **claims the chosen handle on the server right then** (`claimAccount`) — the account is real from the first run, so Groups and cross-device recovery work immediately. The claim is best-effort: offline simply defers it (the Profile page then shows a "Claim" button). No later "migration" is needed. See [`docs/ROADMAP.md`](../ROADMAP.md) → _Pre-Phase 1.5 Track 2_ for the full design (envelope crypto, identity, pricing-readiness).

### Restore & reclaim (returning users)

If you've used Penny before, the two non-"new" doors recover an existing account without re-seeding demo data:

- **Restore from backup** — pick a `.penny` file (or pull the latest from Google Drive) and enter your passphrase. This brings back **everything**: profile, data, groups, and your handle. Afterwards a post-unlock **identity reconcile** runs (see below).
- **Reclaim my handle** — no backup? Enter your username + original passphrase and set a new PIN. `reclaimAccount(username, passphrase)` re-derives a passphrase-based **recovery keypair** and signs a server nonce to prove ownership, then binds this device under the recovered account. This recovers your **identity + group membership only** — personal data (and group history) still need a backup or a co-member re-share, because the server can't decrypt anything (Model B / E2EE).

**Passphrase recovery verifier.** During vault setup, `securityManager.initialize()` derives a per-account Ed25519 **recovery keypair** from the passphrase + a random `recoverySalt` and stores the salt + **public** half (`recoveryPublicJwk`) in the security record. `claimAccount` uploads this verifier so the handle can later be reclaimed with the passphrase alone. It's independent of the DMK-wrapping derivation and reveals nothing about the data key. (`src/core/identity/recovery.ts`, `claim.ts`.)

**Post-restore identity reconcile.** `IdentityReconciler` (mounted in `src/router/AuthGuard.tsx`) runs once after a restore — flagged by `RECONCILE_FLAG`, now that the vault is unlocked and signed requests are possible. It re-verifies the restored identity via `/whoami`; if the account had been deregistered (e.g. erased before this reinstall) it **re-registers** the restored identity, and if the old handle was taken in the meantime it shows **`ChooseHandleScreen`** to pick a new one. All restored data + keys are untouched — only the public handle may change.

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

- `src/features/onboarding/` — all screen components:
  - Intro flow: `SplashScreen`, `PrivacyPromiseScreen`, `PrivacyDemoScreen`, `ChipIntroScreen`, `SimulatedDashboardScreen`
  - Account start: `AccountStartScreen` (`/onboarding/start` — three doors), `AccountRecoveryScreen` (`/onboarding/account` — new/restore/reclaim tabs)
  - New-user setup: `LetUsKnowYouScreen`, `SetupCredentialsScreen`
  - Recovery: `ChooseHandleScreen` (pick a new handle when the old one is taken), `IdentityReconciler` (post-restore reconcile, mounted in `AuthGuard`)
- `src/core/crypto/securityManager.ts` — encryption init called during setup; also derives + stores the passphrase recovery verifier (`getRecoveryVerifier`)
- `src/core/identity/claim.ts` — `claimAccount` / `reclaimAccount` / `checkUsername` / `deregisterAccount` (server identity)
- `src/core/identity/recovery.ts` — passphrase-derived Ed25519 recovery keypair (`deriveRecoveryKeypair`, `signRecoveryChallenge`)
- `src/core/entitlement/entitlement.ts` — the `sync` entitlement gate (env-driven) that makes username mandatory + triggers the server claim
- `src/core/db/seedDemoData.ts` — demo data population called post-onboarding (new-user path only)

## Current limitations

- No way to re-run onboarding screens without a full app reset — if you want to review the privacy promise again, there is no in-app path
- No biometric (Face ID / fingerprint) auth in Phase 1 — deferred until the React Native apps (WebAuthn-PRF on the PWA is too patchy); PIN is the fastest unlock
- Reclaim recovers your identity + group membership but **not** your personal data — that still needs a backup restore (Model B / E2EE; the server can't decrypt anything)

## Planned improvements

- **Track 2 (done):** Onboarding v2 — combined "Let us know you" screen (full name, username, DOB, employment) after the dashboard preview; Change Passphrase + Change PIN (envelope re-wrap, current passphrase required); re-auth to enter Open mode; cloud backup to the user's own Google Drive; a full-reset path.
- **Phase 1.5 (done):** server-backed identity — the handle is claimed during onboarding (`claimAccount`), plus passphrase reclaim + post-restore reconcile (see _Restore & reclaim_ above)
- Phase 2: Biometric auth (Face ID / Touch ID) — an extra DMK wrapping slot, native apps
- Phase 2: Cloud backup to iCloud (native); push notifications

## Ideas welcome

- How much detail do users actually want to read in the Privacy Promise screen, versus a shorter summary with a "read more" link?
- Should the Privacy Demo be skippable for returning users who already know the modes?
- Are there employment types missing from the list that affect how Penny should behave?
