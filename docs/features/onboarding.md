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

**Coming in Pre-Phase 1.5 (Track 2):** Three additional steps will be added to collect:
- **Date of birth** — with a clear explanation of exactly how Penny uses it (FIRE calculator, NPS projection, EPF retirement estimate, tax slab detection)
- **Employment type** — Salaried / Self-employed / Business owner / Student / Retired — with a brief explanation of how this personalises the app (EPF visibility, health score benchmarks)
- **Username** — optional, skippable, 3–20 characters, lowercase alphanumeric and underscores — explained as needed for future household sharing

## How it works
Onboarding lives in `src/features/onboarding/` as a set of screen components routed under `/onboarding/*`.

During the credentials setup screen, `securityManager.ts` initialises the three-key encryption architecture: your passphrase is used with PBKDF2 (600,000 iterations) to derive the Master Key; a separate KEK is derived with PBKDF2 (200,000 iterations) to wrap the Master Key. The Master Key lives in memory only and is cleared when the session expires. Nothing is ever stored in plaintext.

The `profile` store holds: displayName, currency, locale, and onboardingCompleted. When the Pre-Phase 1.5 Track 2 steps are added, it will also store: dob, employmentType, and username.

Demo data is seeded by `seedDemoData.ts` immediately after onboarding completes if the user opts in.

**Downstream effects of date of birth:**
- FIRE calculator uses your exact current age to compute years to your target retirement age
- EPF retirement projection uses years remaining to age 58
- NPS corpus projection uses years remaining to age 60
- Tax module displays the correct slab (regular / senior citizen above 60 / super senior above 80)

**Downstream effects of employment type:**
- Salaried: EPF tab visible in portfolio, tax computation shows the standard deduction (currently ₹75,000)
- Self-employed: EPF tab hidden, NPS 80CCD(1B) deduction highlighted in the tax module
- Student / Retired: different benchmark comparisons in the financial health score

Key files:
- `src/features/onboarding/` — all screen components (Splash, PrivacyPromise, SetupCredentials, PrivacyDemo, ChipIntro, SimulatedDashboard)
- `src/core/crypto/securityManager.ts` — encryption initialisation called during setup
- `src/core/db/seedDemoData.ts` — demo data population called post-onboarding

## Current limitations
- No way to re-run onboarding screens without a full app reset — if you want to review the privacy promise again, there is no in-app path
- The passphrase cannot be changed after initial setup (passphrase rotation is a planned feature)
- No biometric (Face ID / fingerprint) authentication in Phase 1 — PIN is the fastest unlock method
- Date of birth and employment type are not yet collected (Pre-Phase 1.5 Track 2)

## Planned improvements
- Pre-Phase 1.5 Track 2: Add DOB, employment type, and username steps to the onboarding flow
- Phase 2: Biometric authentication (Face ID / Touch ID) as an alternative to PIN
- Phase 2: Passphrase change flow with re-encryption of all data
- Phase 2: Cloud backup option (encrypted backup to user's Google Drive / iCloud) offered at onboarding completion

## Ideas welcome
- How much detail do users actually want to read in the Privacy Promise screen, versus a shorter summary with a "read more" link?
- Should the Privacy Demo be skippable for returning users who already know the modes?
- Are there employment types missing from the list that affect how Penny should behave?
