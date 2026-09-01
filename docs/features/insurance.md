# Insurance

## What it is

Your personal policy register — Term, Life (Whole Life/Endowment/ULIP), Health, Vehicle, Home, Travel,
and Other policies in one place. Beyond the original "store the details, track the renewal date" scope,
Term/Life policies get a full premium-payment engine: due dates, a grace-period/lapse/revival state
machine, a "Mark as paid" flow that can log or link a real expense, and payment history — because a
lapsed term/life policy is the single highest-stakes thing this module can let slip through the cracks.
Health/Vehicle/Home/Travel/Other keep the simpler original model (one flat annual renewal date).

## User-facing capabilities

- Add/edit/delete policies across all 7 types. Switching a policy's type on the form resets the insurer
  selection (deliberate — insurer lists are scoped per type, see below).
- **Insurer picker** scoped to the right regulatory category — 11 life insurers for Term/Life, 8
  standalone health insurers for Health, 11 general insurers shared by Vehicle/Home/Travel/Other (all
  real, IRDAI-registered names) — plus an "Other" free-text option that remembers what you've typed
  before and suggests it next time.
- **Primary coverage hero field** — Sum assured (Term/Life), Sum insured (Health), IDV (Vehicle), or
  Structure value insured (Home), with quick round-number preset pills (e.g. 25L/50L/1Cr/2Cr/5Cr for
  Term/Life, smaller ranges for Health/Vehicle/Home). Travel/Other have no hero field.
- Plan name (distinct from insurer name), policy number, start/end date, and duration presets — including
  age-based presets ("Till 60"/"Till 65") for Term/Life that read your saved date of birth.
- Payment frequency (Monthly/Quarterly/Half-yearly/Annual/Single) and an optional first-year discount
  (percent or flat rupee amount off the Year-1 installment), with a live installment-preview banner.
- **Term/Life premium tracking**: Regular vs Limited pay term (with a "pay for how many years?" field
  when Limited), a 5-state due-date badge (On track / Due soon / Grace period / Lapsed / Paid up,
  ULIP-aware revival-window wording), a "Mark as paid" flow that lets you log a new expense, link an
  existing one, or just record the payment with no expense — plus newest-first payment history with an
  "Undo" on the most recent entry.
- Nominee(s), and type-specific fields: Life — maturity benefit + ULIP toggle; Health — members covered +
  co-pay %; Vehicle — registration number + NCB%; Travel — destination + trip dates.
- **Reminders bell integration** — a Term/Life premium due or overdue surfaces in the same header
  Reminders bell as everything else, with its own "Mark as paid" action (no separate insurance-specific
  notification UI).
- **Cash-flow forecast integration** — a Term/Life policy with a real payment schedule projects one
  outflow per real due date within the forecast horizon (discount-aware), instead of one flat annual
  guess; a policy that's fully paid up projects nothing at all.
- Coverage summary showing total life cover and total health cover in rupees (unchanged from the
  original design — `CoverageSummary.tsx`).
- Edit any policy detail at any time; delete policies that are no longer active.

## How it works

**Data model** (`packages/core/src/core/db/types/index.ts`, `InsurancePolicy`): base fields —
`type: InsuranceType` (`'term' | 'life' | 'health' | 'vehicle' | 'home' | 'travel' | 'other'`), `insurer`,
`policyNumber?`, `coverageAmount`, `annualPremium`, `renewalDate` (still the field of record for
Health/Vehicle/Home/Travel/Other's one-flat-renewal-a-year model), `sumInsured?`, `nominees?`, `notes?`.
A large, all-optional set of additions layers the richer Term/Life mechanics on top without breaking any
existing saved policy: `planName`, `startDate`, `durationYears`/`durationDays`, `endDate`/
`endDateIsCustom`, `paymentFrequency: PremiumFrequency` (`'M' | 'Q' | 'H' | 'A' | 'S'`),
`firstYearDiscountEnabled`, `discountType: DiscountType` (`'pct' | 'flat'`), `discountValue`,
`nextPremiumDueDate`/`nextPremiumDueDateIsCustom`, `premiumPayments?: PremiumPayment[]` (append-only,
newest-last — `{ id, dueMs, paidMs, amount, linkedExpenseId? }`); Term/Life-specific `sumAssured`,
`premiumPaymentTerm: PremiumPaymentTerm` (`'regular' | 'limited'`), `limitedPayYears`, `isULIP` (Life
only — picks the right revival-window wording, never anything fund-value-related), `maturityBenefit`;
Health-specific `membersCovered`, `coPayPct`; Vehicle-specific `vehicleRegNumber`, `idv`, `ncbPct`
(**deliberately unlinked** from the pre-existing, separate `vehicleInsurancePolicyNo`/etc. fields on a
Real Assets Vehicle holding — two independent places by design, not an oversight); Home-specific
`structureValue`; Travel-specific `destination`, `tripStartDate`, `tripEndDate`. Full field table:
`docs/SCHEMA.md`.

**`packages/core/src/core/insurance/` — the premium engine, pure and unit-tested:**

- `insurers.ts` — the researched insurer picklists (`LIFE_INSURERS`/`HEALTH_INSURERS`/`GENERAL_INSURERS`
  — real, currently-operating IRDAI-registered names, a curated subset of the full registry, not
  exhaustive) plus `insurerCategoryForType()`/`insurersForCategory()` to scope the Add/Edit form's
  dropdown by policy type.
- `insurerMemory.ts` — "Other" (not-in-list) insurer suggestion memory, mirroring `core/expenses/
  merchantMemory.ts`'s exact normalize/key/build/search pattern. `InsurerMemory` (own encrypted store,
  see below) is keyed `` `${category}::${normalizedName}` `` so the same free-text name typed for two
  different categories doesn't collide.
- `premiumSchedule.ts` — all due-date/grace-period/revival/discount math: `periodsPerYear`/
  `intervalMonths` (per `PremiumFrequency`), `gracePeriodDays` (15 days for Monthly, 30 for
  Quarterly/Half-yearly/Annual, `null` for Single — WebSearch-verified against GoDigit/Axis Max Life/
  Kotak Life/PayBima), `revivalWindowYears(isULIP)` (3 years for ULIP, 5 for non-linked Term/Endowment/
  Whole Life, per IRDAI's June 2024 Master Circular), `installmentAmount()` (even division of the annual
  premium by frequency, discount-aware for Year 1 only — a documented simplification that doesn't model
  real insurers' ~3–5%/year "modal loading" surcharge for non-annual modes), `firstNextDueDate()`,
  `applyMarkAsPaid()` (records a `PremiumPayment` and rolls `nextPremiumDueDate` forward one interval —
  and, for a Limited Pay policy whose pay term just completed, returns `nextPremiumDueDate: undefined`
  instead of continuing to roll forward forever), `applyUnmarkPayment()` (reverses only the most recent
  payment — returns `null` for anything else, since un-marking an arbitrary earlier entry would desync
  the rolled-forward due date from the remaining history), `scheduledOccurrencesWithin()` (every due date
  in a range, with a bounded 60-day overdue look-back so a genuinely-missed premium still surfaces as
  overdue instead of being silently skipped), `computeDueStatus()` (the 5-state machine — `onTrack` /
  `dueSoon` / `grace` / `lapsed` / `paidUp`), and `isPaidUp()` (true once a Limited Pay policy has
  finished its pay term but is still within cover — the single authoritative check shared by the
  forecaster, `useInsurance.ts`'s sort order, and the form's own "Paid up" banner).
- `expenseLinking.ts` — `findCandidateExpenses()` (date/amount-proximity heuristic, up to 3 results
  within a 10-day window, excludes transfers and already-linked expenses) and `buildPremiumExpense()`
  (constructs a real `Expense` for the "log a new expense" mark-as-paid choice, filed under the real
  existing `cat-insurance-premium` default category).

**New encrypted store `insurer_memory`** (`InsurerMemory`: `id`, `name`, `category`, `usageCount`,
`updatedAt`) — wired through `schema.ts`/`schema.native.ts`/`repositories.ts` (`insurerMemoryRepo`) and
included in backup/restore (`backupManager.ts`'s `BACKUP_STORES`).

**Cash-flow forecaster** (`packages/core/src/core/cashflow/forecaster.ts`): a Term/Life policy with a
real schedule set (`paymentFrequency !== 'S'` and `nextPremiumDueDate` defined) emits one
`CashFlowEvent` per real due-schedule occurrence within the forecast horizon (via
`scheduledOccurrencesWithin()`, using the discount-aware `installmentAmount()`), each carrying the
event's `policyId`; every other case (Health/Vehicle/Home/Travel/Other, or a legacy/Single-premium
Term/Life record with no schedule) keeps the original flat annual event from `renewalDate`/
`annualPremium`. A genuinely paid-up policy (`isPaidUp()`) emits no insurance event at all.

**Reminders** (`packages/core/src/core/reminders/reminders.ts`): a new `'mark_paid'` `ReminderAction`
(alongside `log`/`cancel`/`none`) and a `policyId` field on `Reminder` surface a Term/Life premium due in
the same header Reminders bell (`apps/mobile/src/components/reminders/RemindersBell.tsx`) as every other
due item, with its own "Mark as paid" action — not a bespoke insurance notification component.
`apps/mobile/src/hooks/useReminders.ts` calls the shared mark-as-paid mutation below.

**Shared hook `apps/mobile/src/hooks/useInsurancePremiumActions.ts`** (deliberately in `hooks/`, not
`features/insurance/` — this codebase's "promote to hooks/ for cross-consumption" convention, since both
`features/insurance/useInsurance.ts` and the unrelated `hooks/useReminders.ts` need to call the exact
same real repo write): `markPremiumPaid(policy, choice, paidMs?)` — `choice` is `{kind:'log'}` |
`{kind:'link', expenseId}` | `{kind:'skip'}` — logs/links/skips a real `Expense`, calls
`applyMarkAsPaid()`, persists via `insurancePoliciesRepo.put()`, logs activity, and broadcasts
`notifyTxnChanged()`; `unmarkLastPremiumPayment(policy, paymentId, alsoRemoveExpense)` — the
`alsoRemoveExpense` boolean is the caller's already-confirmed answer to its own `ConfirmDialog`, this
function performs no confirmation itself; `candidateExpensesForPolicy(policy)`.

**`apps/mobile/src/features/insurance/useInsurance.ts`** also owns `insurerMemories`/`rememberInsurer`
(remembers a typed "Other" insurer locally) and exposes `markAsPaid`/`unmarkPayment`/`candidateExpenses`
— thin wrappers around the shared hook above that also call the screen's own `reload()` for same-screen
immediate consistency, on top of the cross-instance `useTxnRefresh(reload)` subscription already there.

**Add/Edit form** (`apps/mobile/src/features/insurance/PolicyForm.tsx`) — a dense 2-column grid, the
result of two full rewrites: an initial type-conditional redesign, then a second full relayout after
real user feedback on the first shipped layout (see the mockups below and the decision log entry in
`docs/ARCHITECTURE.md`). Structure, top to bottom: type tile picker; the primary-coverage hero field +
preset pills; paired rows — [Insurer | Annual premium], [Plan name | Policy number], [Start date | End
date] — with duration preset chips directly below the date row (no separate label; they exist purely to
set End date); a full-row payment-frequency pill group; a full-row first-year-discount toggle (with a
%-vs-flat control + value chips when enabled) and installment-preview banner; for Term/Life only, a
paired [Premium payment term | Next premium due] row, a conditional Limited-pay-years field, the
Mark-as-paid button/3-way choice panel, payment history, and Nominee(s) (placed after Mark-as-paid); then
trailing type-specific blocks (Life: `fields/TermLifeFields.tsx`; Health: `fields/HealthFields.tsx`;
Vehicle: `fields/VehicleInsuranceFields.tsx`; Travel: `fields/TravelFields.tsx` — unchanged). Home has no
type-specific block left (`fields/HomeFields.tsx` was deleted — its one field, Structure value, moved to
the universal hero field). Two bugs fixed mid-redesign: the age-based "Till 60"/"Till 65" duration
presets used to silently no-op with no feedback when the profile had no saved date of birth — now shows a
toast ("Add your date of birth in Settings → Profile to use age-based durations like 'Till 60'.");
and a Limited Pay policy used to keep generating due-date/mark-as-paid prompts forever past its pay term
instead of reaching a genuine "Paid up" state (see `applyMarkAsPaid()`/`isPaidUp()` above) — the form now
shows a "Paid up — cover continues without further premiums." banner in place of the due-date/mark-as-paid
section, mirroring `PolicyCard.tsx`'s own wording.

**Insurer picker** (`apps/mobile/src/features/insurance/InsurerField.tsx`) — a centered-Modal radio list
scoped to the policy type's insurer category, plus an "Other" row revealing a free-text field with
locally-remembered suggestion chips.

**`apps/mobile/src/features/insurance/Chip.tsx`** — a small single-select pill (label/active/onPress),
distinct from the pre-existing `components/ui/DismissibleChip` (always has an "×", for removable tags,
not single-select). See `docs/DESIGN_GUIDELINES.md` §3.

**Tracked Insurance card** (`apps/mobile/src/features/insurance/PolicyCard.tsx`): Term/Life gets the new
5-state due-date treatment with ULIP-aware revival-window messaging; Health/Vehicle/Home/Travel/Other
keep a lighter-restyled version of the original simple annual-renewal card (a deliberate, smaller scope
call — the new mechanics only exist for Term/Life, so effort concentrated there rather than a full
pixel-level rebuild of every card).

**`apps/mobile/src/features/insurance/InsurancePage.tsx`** holds `editingPolicyId: string | null` — never
the policy object itself — and re-resolves the live policy from its own `policies` array on every render.
This matters here specifically because the form can trigger its own child mutation (mark-as-paid) while
still open; see the "never snapshot, always re-resolve live by id" rule in `docs/ARCHITECTURE.md`'s
decision log (first established for the EPF employer-detail modal, applied here for the same reason).

Amounts respect `usePrivacy().shouldMask(!safeModeVisibility.insurance)` — Safe Mode hides cover/premium
amounts only if the "Insurance" toggle in Settings → Safe Mode is switched off (visible by default); Open
never masks. A single module-wide toggle, not per-policy.

When insurance data is passed to Chip AI (Phase 2), insurer names are generalised to "Insurer A",
"Insurer B" to avoid identifying the user's specific providers. Policy numbers are never sent to any
external service.

**Mockups:** the full-feature exploration lives in `docs/mockups/proposals/insurance-redesign-v1.html`
through `v4.html`; the follow-up form-layout-only discussion (after the user tried the first shipped
form) lives in `insurance-form-layout-options-v1.html`/`v2.html`. All are approved-and-superseded
references now — the shipped code described above is the real source of truth.

Key files:

- `apps/mobile/src/features/insurance/InsurancePage.tsx` — header + policy list + FAB + `PolicyForm`,
  owns `editingPolicyId`
- `apps/mobile/src/features/insurance/useInsurance.ts` — policies + premium total + expiring count +
  renewal-sorted list + insurer memory + mark-as-paid/unmark/candidate-expenses wrappers
- `apps/mobile/src/features/insurance/PolicyCard.tsx` / `CoverageSummary.tsx` — policy row + coverage
  footer
- `apps/mobile/src/features/insurance/PolicyForm.tsx` — add/edit policy form (dense 2-column grid)
- `apps/mobile/src/features/insurance/InsurerField.tsx` — insurer picker modal
- `apps/mobile/src/features/insurance/Chip.tsx` — single-select pill
- `apps/mobile/src/features/insurance/fields/{TermLifeFields,HealthFields,VehicleInsuranceFields,
TravelFields}.tsx` — trailing type-specific field blocks
- `apps/mobile/src/hooks/useInsurancePremiumActions.ts` — shared mark-as-paid/unmark mutation
- `packages/core/src/core/insurance/{insurers,insurerMemory,premiumSchedule,expenseLinking,meta}.ts`

## Current limitations

- Insurer names are stored locally in full but are generalised when passed to Chip AI
- No claim tracking — you cannot log a claim made against a policy or track its reimbursement status
- No premium comparison or market rate benchmarking against similar policies
- ULIP and endowment policies do not track fund value or maturity projections
- No document/PDF attachment for actual policy documents
- Un-marking a premium payment only ever reverses the most recent entry, never an arbitrary earlier one
- `installmentAmount()`'s even-division-by-frequency math doesn't model real insurers' ~3–5%/year "modal
  loading" surcharge for non-annual payment modes — a documented simplification, not a bug
- "Link an existing expense" candidates aren't restricted to the `cat-insurance-premium` category — shows
  any recent expense near the amount/date, since a pre-feature payment likely wasn't categorized that way
- Health's co-pay is a single flat percentage (no per-diagnosis/per-treatment variation)
- Vehicle insurance's registration number/IDV/NCB% are intentionally unlinked from the separate,
  pre-existing vehicle-insurance-adjacent fields already on a Real Assets Vehicle holding — two
  independent places by design, not an oversight
- Health/Vehicle/Home/Travel/Other's Tracked Insurance cards got a lighter restyle only, not the full new
  visual treatment Term/Life received
- The premium due-date/grace-period/mark-as-paid mechanics only exist for Term/Life — Health/Vehicle/
  Home/Travel/Other still use the original single flat annual renewal date

## Planned improvements

- Phase 2: Health insurance claim tracker — log claims against your health policy, track reimbursements,
  and see how much of your deductible/co-pay has been used in the current year
- Phase 2: Term insurance adequacy check — Chip will compare your total life cover against an
  income-replacement benchmark (typically 10–15x annual income) and flag if you are underinsured
- Phase 2: 80D-eligible premium tagging — mark health and certain life insurance premiums as 80D-eligible
  so the tax module can auto-populate your deduction

## Ideas welcome

- Should Penny store scanned copies of policy documents locally (encrypted)?
- Would push notifications for premium due dates be useful, beyond the in-app Reminders bell?
- Should the due-date/grace-period/mark-as-paid mechanics extend to Health/Vehicle/Home/Travel too, or
  is the simpler annual-renewal model the right fit there?
