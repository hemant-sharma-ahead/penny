# Onboarding

## What it is

The onboarding experience runs once, the very first time you open Penny. It sets up your encryption keys, explains exactly how Penny protects your data, introduces Chip, and lets you explore a fully-populated **Demo Mode** before ever entering — or committing to — your own information.

## User-facing capabilities

Step through the intro screens in order, then choose how to start:

1. **Splash** — Penny's logo and tagline; sets the tone for what follows
2. **Privacy promise** — a plain-language explanation of local-first storage, AES-256 encryption, zero trackers, and how Penny stores nothing personal on any server (Model B) — including that any backup you choose to make goes to your own cloud, never Penny's
3. **Privacy demo** — an interactive walkthrough of Penny's three privacy modes (Safe, Privacy, Open) so you understand what each does before you start
4. **Chip intro** — meet Chip: the AI advisor's avatar is shown with a description of what Chip can help you with
5. **Simulated / preview dashboard** — an animated preview of what a fully populated Penny looks like, ending in **two** buttons: **"Explore with Demo Data"** or **"Setup my Account"**

### Path A — "Setup my Account" (already know you want the real thing)

6. **How would you like to start?** (`/onboarding/start`) — three plain doors: **Start fresh**, **Restore from backup**, or **Reclaim my handle**
7. **Account screen** (`/onboarding/account`) — the same three choices as segmented tabs (so you can switch): the **new** tab continues into the real-setup sequence below; **restore** brings everything back from a backup; **reclaim** recovers your handle with your passphrase

The **new** tab continues straight into the shared real-setup sequence (step 9 below). Restore and reclaim recover an existing account without seeding demo data or touching Demo Mode at all (see _Restore & reclaim_ below).

### Path B — "Explore with Demo Data" (look around first)

8. **Demo vault** (`/onboarding/demo-vault`) — a fixed, shown PIN + passphrase (not typed, not validated) initialise a throwaway encryption vault so the sample data can be written like the real thing. Nothing here is meant to be remembered; both are cleared the moment you exit Demo Mode.

You land straight in the app — fully populated with realistic demo data — with a persistent purple **Demo Mode** banner across the top and an **"Exit Demo Mode"** button. Interact with everything as normal; anything you add or change while in Demo Mode is still just demo data. Tapping **Exit Demo Mode** confirms ("Ready to make it yours?"), wipes every financial table, and hands off into the same real-setup sequence Path A uses.

### The shared real-setup sequence (both paths converge here)

9. **"Let us know you"** — full name, username, date of birth, employment type. Each field now carries a short "where this lives" caption (on-device/encrypted vs. public) alongside its existing "why we ask" caption.
10. **"A bit more about you"** (`/onboarding/life-household`) — optional: relationship status, home ownership, risk appetite, dependents' birth years. Skippable; the same fields as Edit Profile's "Life & household" section, pulled forward here because they already power the Home advisor's life-stage goal suggestions (education corpus, home fund, marriage fund) — which otherwise silently degrade to just a generic Retirement goal if nobody ever finds them in Edit Profile.
11. **"Add your accounts"** (`/onboarding/add-accounts`) — optional: quick-add Cash / Bank / Credit Card / Wallet accounts (same types as the real Accounts page) so expense tracking works immediately.
12. **"Back up your data"** (`/onboarding/backup-setup`) — optional: This Device / Google Drive / iCloud (iCloud shown disabled — native-only, still dormant on the web PWA). Only records the choice here; picking Drive routes to the real Backup page after setup completes, since the live connect flow needs the app's `SyncProvider`, which isn't mounted this early.
13. **Set up your vault** (`/onboarding/setup`) — passphrase + 6-digit PIN. Same screen, same fields, regardless of which path got you here — a brand-new user is never asked for a "current" credential. Under the hood: Path A calls `initialize()` fresh; exiting Demo Mode instead re-keys the already-unlocked demo vault via `exitDemoMode()` (the demo PIN/passphrase stop working the instant this completes).

```
Splash → Privacy Promise → Privacy Demo → Chip Intro → Simulated Dashboard
  ├─ "Setup my Account" → Account Start (start fresh / restore / reclaim) ─────────────┐
  └─ "Explore with Demo Data" → Demo vault (shown) → app in Demo Mode → Exit Demo Mode ┘
                                                                                        ▼
                                        Let us know you → Life & household → Accounts → Backup
                                                                                        ▼
                                                          Set up your vault → the real app
```

Personal data is held in memory (an onboarding draft, `OnboardingDraftContext`) until the final write — nothing is persisted before encryption is initialized (or, on the Demo Mode exit path, before the vault is re-keyed).

On the **Set up your vault** step, once encryption is live, Penny writes the profile (+ any accounts collected) and local identity and, on sync builds, **claims the chosen handle on the server right then** (`claimAccount`) — the account is real from the first run, so Groups and cross-device recovery work immediately. The claim is best-effort: offline simply defers it (the Profile page then shows a "Claim" button). No later "migration" is needed. See [`docs/ROADMAP.md`](../ROADMAP.md) → _Pre-Phase 1.5 Track 2_ for the full design (envelope crypto, identity, pricing-readiness).

### Restore & reclaim (returning users)

If you've used Penny before, the two non-"new" doors recover an existing account without re-seeding demo data:

- **Restore from backup** — pick a `.penny` file (or pull the latest from Google Drive) and enter your passphrase. This brings back **everything**: profile, data, groups, and your handle. Afterwards a post-unlock **identity reconcile** runs (see below).
- **Reclaim my handle** — no backup? Enter your username + original passphrase and set a new PIN. `reclaimAccount(username, passphrase)` re-derives a passphrase-based **recovery keypair** and signs a server nonce to prove ownership, then binds this device under the recovered account. This recovers your **identity + group membership only** — personal data (and group history) still need a backup or a co-member re-share, because the server can't decrypt anything (Model B / E2EE).

**Passphrase recovery verifier.** During vault setup, `securityManager.initialize()` derives a per-account Ed25519 **recovery keypair** from the passphrase + a random `recoverySalt` and stores the salt + **public** half (`recoveryPublicJwk`) in the security record. `claimAccount` uploads this verifier so the handle can later be reclaimed with the passphrase alone. It's independent of the DMK-wrapping derivation and reveals nothing about the data key. (`src/core/identity/recovery.ts`, `claim.ts`.)

**Post-restore identity reconcile.** `IdentityReconciler` (mounted in `src/router/AuthGuard.tsx`) runs once after a restore — flagged by `RECONCILE_FLAG`, now that the vault is unlocked and signed requests are possible. It re-verifies the restored identity via `/whoami`; if the account had been deregistered (e.g. erased before this reinstall) it **re-registers** the restored identity, and if the old handle was taken in the meantime it shows **`ChooseHandleScreen`** to pick a new one. All restored data + keys are untouched — only the public handle may change.

## How it works

Onboarding lives in `src/features/onboarding/` as a set of screen components routed under `/onboarding/*`.

During the credentials setup screen, `securityManager.ts` initialises **envelope encryption** (Track 2): a random Data Master Key (DMK) encrypts all data, and the DMK is independently wrapped by a passphrase-derived KEK (PBKDF2 600,000 iterations) and a PIN-derived KEK (PBKDF2 200,000 iterations). The DMK lives in memory only (non-extractable) and is cleared on session expiry. Changing the passphrase or PIN only re-wraps the DMK — data is never re-encrypted. Nothing is ever stored in plaintext.

**Forgot PIN (local security hardening, 2026-07).** PIN and passphrase verification keep independent attempt counters/lockouts (`pinAttempts`/`lockedUntil` vs. `passphraseAttempts`/`passphraseLockedUntil`) so exhausting one factor never blocks the other. `SessionGate` shows a "Forgot PIN?" link only once PIN attempts are exhausted; it verifies the passphrase (`unlockWithPassphrase`) and routes to `ChangePinPage` in a non-dismissible, forced mode (`resetPinWithPassphrase`) that requires the passphrase again to set the new PIN. A user can also reach the passphrase route from `ChangePinPage` directly, without having exhausted PIN attempts — that path is dismissible. `changePassphrase()` and `changePin()` are each throttled to once per 24h; the emergency `resetPinWithPassphrase` path is not, since it's a recovery escape hatch, not a routine change.

**Open mode is always temporary.** `PrivacyContext` never starts in `'open'` — `defaultPrivacyMode` (persisted in `SettingsContext`) only ever resolves to Safe or Privacy. Switching to Open (via the PIN + warning confirmation in `PrivacyModeSwitcher`) arms an auto-revert timer for `openModeDurationMinutes` (1/5/10/15/30, default 1, configurable in Settings) and reverts immediately on backgrounding/`visibilitychange` — it can never be left on indefinitely, even if `defaultPrivacyMode` is somehow set to it.

The `profile` store holds: `displayName` (= full name), `currency`, `locale`, `onboardingComplete`, and (Track 2) `dob`, `employmentType`, `username`, `userId`, plus the opt-in Life & household fields (`maritalStatus`, `children`, `homeOwner`, `riskAppetite`). The on-device keypair and the `plan`/entitlement marker are stored alongside (the keypair in the encrypted DB).

**Demo Mode (2026-07).** `DemoVaultScreen` is the only place `seedDemoData()` is ever called — a fixed `DEMO_PIN`/`DEMO_PASSPHRASE` (exported from `securityManager.ts`, shown on-screen, never validated) initialise a throwaway vault, defaulting to the `salaried` persona since no employment type has been collected yet. Neither the "Setup my Account" path nor an Exit-Demo-Mode re-key ever seeds demo data — only actual demo exploration does. The seed itself is **tailored to the chosen employment type** (`salaried | self_employed | business_owner | student | retired`) when seeded from the Profile page's reseed path: each persona gets a distinct, realistic income mix, scaled everyday spend, and a fitting set of holdings, liabilities, subscriptions, rent/SIP, and due bills. `DemoModeBanner` (mounted in `AppShell`, gated on `profile.demoSeeded`) shows a persistent strip with **"Exit Demo Mode"**, which calls `wipeDemoData()` (a wholesale `.clear()` on every financial table — so anything a user adds *while* in Demo Mode also counts as demo data and is wiped, not just what was originally seeded) and hands off to the real-setup sequence via `navigate(..., { state: { fromDemoMode: true } })`. If the user later changes employment on the Profile page while still on untouched demo data, `reseedForEmployment(employmentType)` wipes and re-seeds for the new persona (it bails out if any real, non-demo financial data has been created — detected via the activity log).

**Exiting Demo Mode has two identical entry points, not two different actions.** `profile.demoSeeded` only ever means "the vault itself is the throwaway demo one" (the real-setup sequence always writes `demoSeeded: false`, on both the fresh and exit-demo branches) — so anywhere that flag is checked, the button must hand off to the real-setup sequence, never just wipe-and-reload. Settings' danger-zone **"Exit Demo Mode"** row (same `profile.demoSeeded` guard, formerly "Clear sample data") and `DemoModeBanner`'s button both call `wipeDemoData()` directly and navigate to `/onboarding/let-us-know-you` with `{ state: { fromDemoMode: true } }` — there is no other way to leave Demo Mode. (The previous `clearDemoData()` — wipe + `window.location.reload()` — was removed: under the old, pre-Demo-Mode design every user's vault was real from the first screen, so reloading into an empty-but-still-yours app was correct; under this design that would silently strand the user on the known demo PIN/passphrase with no real profile, since reloading never asks for real credentials.)

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
  - Intro flow: `SplashScreen`, `PrivacyPromiseScreen`, `PrivacyDemoScreen`, `ChipIntroScreen`, `SimulatedDashboardScreen` (the two-button fork)
  - Account start: `AccountStartScreen` (`/onboarding/start` — three doors), `AccountRecoveryScreen` (`/onboarding/account` — new/restore/reclaim tabs)
  - Demo Mode: `DemoVaultScreen` (`/onboarding/demo-vault` — shown throwaway credentials)
  - Shared real-setup sequence: `LetUsKnowYouScreen`, `LifeHouseholdScreen` (`/onboarding/life-household`), `AddAccountsScreen` (`/onboarding/add-accounts`), `BackupSetupScreen` (`/onboarding/backup-setup`), `SetupCredentialsScreen` (final vault step — branches `initialize()` vs `exitDemoMode()`)
  - Recovery: `ChooseHandleScreen` (pick a new handle when the old one is taken), `IdentityReconciler` (post-restore reconcile, mounted in `AuthGuard`)
- `src/context/OnboardingDraftContext.tsx` — in-memory draft shared across the onboarding route tree (name/username/DOB/employment, Life & household fields, `accountsToCreate`, `backupChoice`, and the `fromDemoMode` flag read from router location state)
- `src/components/demo/DemoModeBanner.tsx` — persistent "Demo Mode" strip + exit-confirm dialog, mounted in `AppShell` (gated on `profile.demoSeeded`)
- `src/components/ui/LifeRow.tsx` / `OptionalSeg.tsx` — the Life & household row/segmented-control pair, shared between Edit Profile and `LifeHouseholdScreen`
- `src/core/crypto/securityManager.ts` — encryption init called during setup; `DEMO_PIN`/`DEMO_PASSPHRASE` + `exitDemoMode()` for the Demo Mode re-key (bypasses the once/24h change throttle — the vault is seconds old); also derives + stores the passphrase recovery verifier (`getRecoveryVerifier`)
- `src/core/identity/claim.ts` — `claimAccount` / `reclaimAccount` / `checkUsername` / `deregisterAccount` (server identity)
- `src/core/identity/recovery.ts` — passphrase-derived Ed25519 recovery keypair (`deriveRecoveryKeypair`, `signRecoveryChallenge`)
- `src/core/entitlement/entitlement.ts` — the `sync` entitlement gate (env-driven) that makes username mandatory + triggers the server claim
- `src/core/db/seedDemoData.ts` — demo data population, called only from `DemoVaultScreen`; `wipeDemoData()` (exported) wholesale-clears every financial table, with no reload/navigation of its own — both `DemoModeBanner` and Settings' "Exit Demo Mode" call it directly, then hand off into the real-setup sequence
- `src/core/session/SessionGate.tsx` — PIN unlock, attempts-remaining, "Forgot PIN?" (post-lockout) → passphrase recovery sub-flow
- `src/features/security/ChangePinPage.tsx` / `ChangePassphrasePage.tsx` — in-app change flows + forced/non-dismissible reset-via-passphrase mode
- `src/context/PrivacyContext.tsx` / `src/context/SettingsContext.tsx` — Open-mode auto-revert timer + `openModeDurationMinutes` setting

## Current limitations

- No way to re-run onboarding screens without a full app reset — if you want to review the privacy promise again, there is no in-app path
- No biometric (Face ID / fingerprint) auth in Phase 1 — deferred until the React Native apps (WebAuthn-PRF on the PWA is too patchy); PIN is the fastest unlock
- Reclaim recovers your identity + group membership but **not** your personal data — that still needs a backup restore (Model B / E2EE; the server can't decrypt anything)
- Picking Google Drive on the Backup step only records the choice — the live connect flow runs on the real Backup page after setup (`SyncProvider` isn't mounted pre-auth); separately, the Drive OAuth launch itself is currently broken (tapping it does nothing, no error) — tracked as a bug fix, not part of Demo Mode

## Planned improvements

- **Track 2 (done):** Onboarding v2 — combined "Let us know you" screen (full name, username, DOB, employment) after the dashboard preview; Change Passphrase + Change PIN (envelope re-wrap, current passphrase required); re-auth to enter Open mode; cloud backup to the user's own Google Drive; a full-reset path.
- **Phase 1.5 (done):** server-backed identity — the handle is claimed during onboarding (`claimAccount`), plus passphrase reclaim + post-restore reconcile (see _Restore & reclaim_ above)
- **Local security hardening (done, 2026-07):** Forgot-PIN recovery via passphrase (independent attempt lockouts, forced non-dismissible PIN reset) + Open mode made strictly temporary (auto-revert timer + configurable duration, never a persistent launch state)
- **Demo Mode first (done, 2026-07):** the Simulated Dashboard forks into "Explore with Demo Data" (shown throwaway vault → full app in a persistent Demo Mode → Exit re-keys via `exitDemoMode()`) vs. "Setup my Account" (unchanged three-doors flow) — both converge on a shared real-setup sequence that now also collects Life & household details and initial accounts, and offers backup setup, before the final vault step.
- Phase 2: Biometric auth (Face ID / Touch ID) — an extra DMK wrapping slot, native apps
- Phase 2: Cloud backup to iCloud (native); push notifications

## Ideas welcome

- How much detail do users actually want to read in the Privacy Promise screen, versus a shorter summary with a "read more" link?
- Should the Privacy Demo be skippable for returning users who already know the modes?
- Are there employment types missing from the list that affect how Penny should behave?
- Should "Add your accounts" collect an opening balance at setup time, or defer that to first use?
