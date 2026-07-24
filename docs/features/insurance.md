# Insurance

## What it is

The insurance module is your personal policy register. It stores all your insurance policies — life, health, vehicle, property, travel — in one place, tracks renewal dates so you never lapse, and gives you a summary of your total coverage. Think of it as a digital folder for all your policy documents' key details.

## User-facing capabilities

- Add and manage policies across all types: Term life, Whole life, Endowment, ULIP, Health (individual or family floater), Vehicle, Property, Travel, and Other
- Store key policy details: insurer name, policy number, sum assured, premium amount, premium frequency, policy start date, renewal date, maturity date, and nominees
- See a renewal tracker that highlights policies expiring in the next 30, 60, or 90 days so you never miss a renewal
- View a coverage summary showing your total life cover and total health cover in rupees
- Track upcoming premium payments with a premium calendar view
- Edit any policy detail at any time; delete policies that are no longer active

## How it works

All policy data is stored in the encrypted `insurance_policies` Dexie store. Key fields include: type, name, insurer, policyNumber, sumAssured, premium, premiumFrequency, renewalDate, nominees array, startDate, and maturityDate.

The renewal tracker reads the `renewalDate` field across all policies and filters those within the configurable threshold window (30/60/90 days from today). Coverage totals are computed by summing `sumAssured` across all active policies of the relevant type (life or health).

Amounts respect `usePrivacy().shouldMask(!safeModeVisibility.insurance)` — Safe Mode hides cover/premium amounts only if the "Insurance" toggle in Settings → Safe Mode is switched off (visible by default); Privacy always masks; Open never does. A single module-wide toggle, not per-policy.

When insurance data is passed to Chip AI (Phase 2), insurer names are generalised to "Insurer A", "Insurer B" to avoid identifying the user's specific providers. Policy numbers are never sent to any external service.

Key files:

- `src/features/insurance/InsurancePage.tsx` — thin shell: header + policy list + FAB + PolicyForm
- `src/features/insurance/useInsurance.ts` — policies + premium total + expiring count + renewal-sorted list
- `src/features/insurance/PolicyCard.tsx` / `CoverageSummary.tsx` — policy row + coverage footer
- `src/features/insurance/PolicyForm.tsx` — add/edit policy form
- `src/core/insurance/meta.ts` — insurance-type metadata (label/icon/colour)

**Mobile (`apps/mobile`):** ported in Track 4 (second module, after Subscriptions) — `apps/mobile/src/features/insurance/` mirrors the web files above 1:1 (`useInsurance.ts` unchanged beyond import paths). Also introduced `apps/mobile/src/components/shared/` (`ListRow`, `DueDateBadge`, `FormModal` — ports of `apps/web-legacy/src/components/shared/`), needed by Insurance and reused by Loans/IOU/Goals/Portfolio as they're ported. Two platform notes: the policy-type picker's `grid-cols-4` becomes a `flex-row flex-wrap` of `w-[23%]` tiles (RN/Yoga has no CSS Grid); the "Renewal / expiry date" field is a plain `YYYY-MM-DD` text input like Subscriptions' date field, same reasoning. The back button (web's `navigate(-1)`) is dropped for now — reachable today via `AuthGuard`'s temporary `needs_onboarding` stand-in, which has no real "back" destination until onboarding/tab navigation exists.

## Current limitations

- Insurer names are stored locally in full but are generalised when passed to Chip AI
- No claim tracking — you cannot log a claim made against a policy or track its reimbursement status
- No premium comparison or market rate benchmarking against similar policies
- ULIP and endowment policies do not track fund value or maturity projections
- No document/PDF attachment for actual policy documents

## Planned improvements

- Phase 2: Health insurance claim tracker — log claims against your health policy, track reimbursements, and see how much of your deductible/co-pay has been used in the current year
- Phase 2: Term insurance adequacy check — Chip will compare your total life cover against an income-replacement benchmark (typically 10–15x annual income) and flag if you are underinsured
- Phase 2: 80D-eligible premium tagging — mark health and certain life insurance premiums as 80D-eligible so the tax module can auto-populate your deduction

## Ideas welcome

- Should Penny store scanned copies of policy documents locally (encrypted)?
- Would premium payment reminders via push notification be useful?
- Are there policy types not in the current list that you need to track?
