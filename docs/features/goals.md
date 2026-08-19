# Goals

## What it is

The goals module lets you set financial targets and track progress toward them over time. Whether you are saving for an emergency fund, a home down payment, a vacation, or retirement, each goal gets its own progress tracker, SIP calculator, and contribution history — plus Chip's projection of when you will get there.

## User-facing capabilities

- Create a financial goal with a name, target amount, target date, icon, and colour
- See a visual progress indicator showing what percentage of your goal you have achieved — a ring on
  `apps/web-react` (frozen); a "liquid fill" card on `apps/mobile` since 2026-08-02 (see the mobile
  section below)
- Calculate the monthly SIP (systematic investment plan) amount needed to reach your goal — enter the target amount, number of years, and expected annual return percentage
- Log contributions manually to update your progress. **Mobile only, since 2026-08-01**: a contribution
  can also be recorded as (or linked to) a real Expense/Income/Transfer — see the mobile section below.
- View a full history of every contribution toward each goal
- Get a Chip insight on each goal: "At your current savings rate, you will reach this goal in X months"
- Track multiple goals simultaneously with a summary view
- **`apps/mobile`, 2026-08-02:** each goal has a "Counts toward Safe to spend" toggle (default **on**) —
  when on, the goal's saved amount is excluded from the "Safe to spend" figure shown on Home, Expenses,
  and Cash Flow, since that money is already spoken for even though it physically sits in the same
  account as the rest of your cash. See [`docs/features/cash-flow.md`](cash-flow.md).

Goal types are not enforced — you can name them anything. Common examples include: Emergency fund, Home purchase down payment, Vacation, Child's education, Wedding, Car purchase, Retirement corpus.

## How it works

Goals are stored in the encrypted `goals` Dexie store. Each goal record tracks: name, targetAmount, currentAmount, targetDate, sipAmount, sipFrequency, and expectedReturn (used for the SIP calculation).

Contributions are stored separately in the encrypted `goal_contributions` store, linked to a goal by ID.
**As of the 2026-08-01 mobile goal-transaction linking**, `currentAmount` on the goal record is a
one-time baseline only (set via `GoalForm`'s "Already saved" field when the goal is created/edited) —
it is never incremented again. The amount actually shown/used everywhere (progress ring, "₹X of ₹Y",
the SIP-needed calc) is that baseline **plus** the live sum of the goal's `goal_contributions`,
computed on read rather than stored — the exact same non-denormalized-balance principle IOU's net
balance already uses (`core/iou/ledger.ts`). See `docs/SCHEMA.md` for the full field list.

`core/goals/progress.ts` (2026-08-02) holds this baseline-plus-contributions math (`effectiveSaved`) as a
shared pure function — `useGoals.ts` (this module's own progress bars) and `~/hooks/useForecast.ts`
(Safe-to-spend's goal exclusion) both call it rather than each keeping its own copy. The same file's
`goalReservations`/`totalGoalReserved` turn a goal list + its `countsTowardSafeToSpend` flag into the
total Safe-to-spend should subtract.

Amounts respect `usePrivacy().shouldMask(!safeModeVisibility.goals)` — Safe Mode hides goal amounts only if the "Goals" toggle in Settings → Safe Mode is switched off (visible by default); Open never masks. A single module-wide toggle, not per-goal.

The SIP calculator uses the standard future value of a series formula: it works backwards from the target corpus to calculate the required monthly investment given the expected return rate and time horizon. The calculation happens entirely on-device.

Chip's projection insight reads the average monthly contribution rate from the contribution history and extrapolates linearly to estimate when the goal will be reached, flagging if the current pace falls short of the target date.

Key files:

- `src/features/goals/GoalsPage.tsx` — thin shell: header summary + tab strip → GoalsTab | SipCalculatorTab
- `src/features/goals/GoalsTab.tsx` — goals list + FAB + GoalForm; `GoalCard.tsx` owns its own contribution row
- `src/features/goals/SipCalculatorTab.tsx` + `useSipCalculator.ts` — standalone SIP calculator
- `src/features/goals/GoalForm.tsx` — create/edit goal form
- `src/core/goals/sipCalculator.ts` — SIP math; `meta.ts` — risk colour/return metadata
- **Mobile only, 2026-08-01:** `src/core/goals/goalLink.ts` (pure two-way reconcile —
  `reconcileGoalLink`/`reconcileLinkedGoalTxn`, mirrors `core/iou/expenseLink.ts`);
  `src/features/goals/GoalDetailView.tsx` (progress + every contribution at once, a centred `Modal`);
  `LinkTransactionModal.tsx` (retroactively tag an existing transaction)
- **Mobile only, 2026-08-02:** "Add contribution" opens the real, shared `~/components/shared/
  ExpenseForm.tsx` (goal-preset) instead of a look-alike form — see below.
  `LegacyContributionEditModal.tsx` is a small edit-only fallback solely for a contribution logged before
  this change with no linked transaction at all.

**Mobile (`apps/mobile`):** ported in Track 4 (fifth module) — `apps/mobile/src/features/goals/` mirrors the web files above 1:1 (`useGoals.ts`/`useSipCalculator.ts` unchanged beyond import paths). `GoalCard`'s "Suggested" pill and risk badge, and `SuggestedGoals`' icon/button backgrounds, replace their web `var(--color-primary)`/`color-mix(...)` CSS with the existing `Badge` component and `~/lib/color`'s `tint()` (same pattern as Insurance/Loans). `GoalForm`'s 3-column risk picker (`grid-cols-3`) becomes a `flex-row flex-wrap` of `compact` `OptionButton` tiles (RN has no CSS Grid). Verified on-device: `AmountInput`'s Indian-grouping/words helper confirmed again with a real value (₹20,00,000 → "Twenty Lakh"), and the full Add-goal form renders correctly including the pre-filled target date.

**Mobile — 2026-08-01 Calculators relocation** (`apps/mobile` only, diverges from web here): the tab strip
grew from Goals/SIP Calculator to 5 tabs — Goals · Goal SIP · FIRE · SIP & SWP · Lumpsum & CAGR
(`TabStrip`'s `scrollable` prop, since 5 no longer fit one screen width). "SIP Calculator" renamed
"Goal SIP" to disambiguate from the new "SIP & SWP" tab — same topic, different question ("what SIP do
I need for this goal" vs. "given a SIP, what corpus/drawdown do I get"). FIRE/SIP & SWP/Lumpsum & CAGR
reuse the exact `apps/mobile/src/features/calculators/*.tsx` components unchanged, moved out of Home's
now-deleted generic Calculators hub — see `docs/features/calculators.md`. `GoalForm.tsx` also gained an
inline "adjusted for inflation" note under the target-amount/date fields (assumes 6% p.a., only shown
once the target is more than ~6 months out) — this replaces what used to be a separate standalone
Inflation calculator on Home; `calcInflation()` from `packages/core/src/core/calculators/inflation.ts`
is called directly rather than reusing the old `InflationCalculator.tsx` form (deleted on mobile —
that component's own inputs didn't fit a one-line inline note).

**Mobile — 2026-08-01 goal-transaction linking** (`apps/mobile` only, `apps/web-react` untouched/frozen;
researched against Cashew's own open-source implementation — its `SelectObjective` widget confirmed the
single-select pill pattern, but Penny puts it behind a Tags-style icon toggle instead of Cashew's
always-visible row): the same two-way link IOU already has between an Expense and a `LedgerEntry` was
built for Goals, reusing the identical shape (`core/goals/goalLink.ts` mirrors `core/iou/expenseLink.ts`
field-for-field). Two directions:

- **Transaction → goal:** `ExpenseForm.tsx` gained a "Goal" icon tile (between Receipt and Lent/Borrowed
  in the circular icon row) — shown for expense, income, **and** transfer (IOU's own Lent/Borrowed tile
  stays expense/income-only). Enabling it reveals a single-select pill row of existing goals (reusing
  the exact pill style the Vacation-event tags already use in this file), tinted by each goal's own risk
  colour. Picking one calls `reconcileGoalLink()` on save, creating/updating/removing an
  `origin: 'expense'` `GoalContribution` linked to that transaction (`linkedTxnId`). A linked
  transaction shows a small green target icon next to its title in the Transactions list — same spot
  and treatment `TransactionsTab.tsx` already uses for the receipt/shared-expense icons — and is
  excluded from spending analytics the same way IOU-linked transactions are (`goalLinkedTxnIds`, a
  synthetic "Goal contributions" set-aside group in `useExpenseAnalytics.ts`).
- **Goal → transaction:** `GoalCard.tsx` is now tappable, opening `GoalDetailView.tsx` (a centred
  `Modal`, never a bottom sheet — progress ring + every contribution at once, footer: "Link existing" /
  "Add contribution"). Both actions also sit directly on `GoalCard.tsx` itself (2026-08-02, replacing the
  old "Quick add" — see below), so adding money doesn't require opening Detail first. "Link existing"
  opens `LinkTransactionModal.tsx` to retroactively tag an already-recorded, not-yet-linked transaction.

**Mobile — 2026-08-02, "Add contribution" becomes the real Expense form:** found via a real on-device
screenshot review that `GoalContributionForm.tsx` (plain labeled fields, a dropdown for the account) read
as a different app from the redesigned `ExpenseForm.tsx` — even though it created the exact same kind of
Expense record. Since the transaction it creates flows straight into the Transactions tab, the fix wasn't
to re-skin a look-alike form; `ExpenseForm.tsx` (relocated to `~/components/shared/ExpenseForm.tsx` so
both the Expenses and Goals feature modules can use it, alongside `AccountChips.tsx`/`PaymentModeChips.tsx`/
`paymentModes.ts`) gained a `goalPreset` prop: hides the Goal/Lent-Borrowed sections entirely (the goal is
already fixed, not a separate choice this form makes), shows a small "Contributing to {name}" caption,
restricts the type switch to Expense/Transfer (Income was never a valid shape for a contribution), and
defaults the category to Savings/Transfer-bank + the description to "Contribution: {name}" — both still
editable; the category tile itself is locked (non-interactive, no picker) since there's always one
obviously-correct default and this is meant to show only the necessary details. `GoalCard`'s old inline
"Quick add" (a manual contribution with no linked transaction — the fastest but least "real" of the four
overlapping entry points a redesign review found) is retired entirely; "Link existing" and "Add
contribution" now sit directly on the card instead, the same pairing Goal Detail's footer already used.
`useGoals.ts` gained its own independent `categories`/`hashtags`/`saveAccount` (same shape as
`useExpenses.ts`'s and `useAccounts.ts`'s own copies — a feature module still can't import another
feature module's hook directly) and `saveGoalContributionTxn`, which persists the fully-assembled Expense
`ExpenseForm` produces (tags, receipt, payment mode, custom description — everything, unlike the old
toggle-based flow's narrower reconstruction) and upserts the linked `GoalContribution` alongside it.
Ownership is unchanged from before: still `origin: 'manual'` (goal-owned, editable/deletable from Goal
Detail) — only the UI that creates it changed, not what the link means. `saveContribution` (the old
toggle-based path) and `GoalContributionForm.tsx` (renamed `LegacyContributionEditModal.tsx`, trimmed to
amount + date only) still exist solely so a contribution logged before this change — bookkeeping-only, no
transaction at all — can still be edited or deleted; a contribution can never end up in that shape again.

Deletion: a manual contribution's cascade to its linked transaction works like IOU's
`deleteEntryAndTxn` (delete either, both go) but isn't yet a single atomically-restorable Undo the way
IOU's is — a smaller-scope simplification, noted as a gap below. Expense-origin contributions (from
`ExpenseForm.tsx`'s own Goal picker tile, when logging a transaction directly from the Expenses tab)
aren't directly deletable from `GoalDetailView` — that link is removed by editing the transaction and
turning its Goal toggle off, one path instead of two (`docs/DESIGN_GUIDELINES.md`'s "one capability, one
control").

**Mobile — 2026-08-02, liquid-fill goal card:** `GoalCard.tsx`'s ring+text layout replaced with a
"liquid fill" card — researched against Jar's literal jar-fill, Qapital's illustrated buckets, Monarch's
trajectory framing, and CRED's NeoPOP block language first (see
`docs/mockups/proposals/goal-card-redesign-v1.html`) before picking this direction: the card itself is
the vessel, filled bottom-up to the goal's actual percentage in its own risk colour (a `LinearGradient` +
a small decorative SVG wave cap at the waterline, `react-native-svg`), with a large icon watermark
layered *above* the fill (not behind it) so it stays equally legible whether that part of the card is
still-empty surface or already-filled liquid. Every goal now gets an icon, never blank: `core/goals/
meta.ts` gained `resolveGoalIcon()`/`inferGoalIcon()` — an explicit `Goal.icon` (only ever set by the 4
life-stage suggestion templates) wins when present, otherwise a small keyword table guesses one from the
name (emergency→shield, trip/vacation/goa→plane, home→house, car→car, wedding→heart, education→school,
retirement→beach, laptop/phone→device, no match→a plain target fallback) — the same idea category
auto-suggestion and event auto-tagging already use elsewhere, applied here since `GoalForm.tsx` has no
icon picker and most goals are created manually. The card's risk badge, target date, and per-goal "N
contributions"/Suggested pill were dropped as part of this redesign (the liquid colour already conveys
risk; contribution history lives in Goal Detail) — **SIP needed is kept**, as a second small line under
the amount/days-left row, same `sipNeeded > 0` condition as before. The card's own inline edit-pencil
button was also dropped — editing a goal is still one tap away via `GoalDetailView`'s own pencil icon,
reached by tapping the card.

**Mobile — 2026-08-02, icon-fill gauge (replaces the whole-card liquid fill):** `GoalCard.tsx`'s card
background is now a plain neutral surface — the goal's own icon (`resolveGoalIcon()`) is the sole
progress vessel, via a new `IconFillGauge`: a dim outline icon underneath (always fully visible) plus
Tabler's solid "Filled" variant of the same icon on top, clipped to the goal's percentage bottom-up (same
technique the old whole-card liquid fill used, just scoped to the icon's own box). Because the Filled
variant is a real solid silhouette with its cutouts intact (the home icon's door is a genuine hole in the
path, not decoration), clipping it bottom-up reveals exactly that much of the *real* shape at every fill
level — see `docs/mockups/proposals/goal-card-icon-fill-mask-v1.html` for the shape-fidelity check against
real icon geometry. `components/Icon.tsx` gained a `filled` prop for this (resolves `${name}Filled`,
falling back to the outline component if Tabler didn't ship one for that icon).

This forced every keyword-inferred goal icon (`core/goals/meta.ts`) to actually have a Filled
counterpart — three didn't (`ti-beach`, `ti-target`, `ti-device-laptop`) and were swapped for a
filled-available equivalent (`ti-umbrella`, `ti-flag`, `ti-device-desktop`). The keyword table was also
expanded well beyond the original ~8 categories to cover the range of goals people actually set — medical/
hospital/health, legal/advocate, home renovation, baby/children, family, plus the existing emergency/
vacation/home/vehicle/wedding/education/retirement/gadget groups — aiming to cover the large majority of
goal names without falling through to the generic flag fallback.

**Mobile — 2026-08-02, action chips + Safe-to-spend tag + screen reorder:** `GoalCard.tsx`'s "Link
existing"/"Add contribution" buttons moved from a full-width row *below* the card to two small circular
icon chips overlaid top-right on the liquid fill (`ActionChip`) — the card and its actions now read as one
visual unit instead of a card-plus-detached-toolbar. A "Non-spendable" (lock icon) / "Spendable" (wallet
icon) tag sits under the goal name on every card, reflecting the new `Goal.countsTowardSafeToSpend`
(default true → "Non-spendable", the money is excluded from Safe to spend; explicit false → "Spendable")
— shown on every card, not just the exception, per user request (see
`docs/mockups/proposals/goal-card-footer-and-safe-to-spend-badge-v2.html`). `GoalsTab.tsx` also gained a
`GoalsSummaryCard` leading the screen — a completion ring ("X of Y goals in progress") beside the total
monthly SIP still needed across every goal not yet fully funded (`calcSipNeeded` already returns 0 for a
completed/overdue goal, so summing it across every goal needs no extra filtering) — and `SuggestedGoals`
moved from right below the header to the very end of the screen, after your own goals (see
`docs/mockups/proposals/goals-screen-summary-card-reorder-v1.html`).

**Mobile — 2026-08-02, Suggested-goals dedup fix:** `SuggestedGoals.tsx` already deduped suggestions
against existing goal names, but by an exact `trim().toLowerCase()` compare — demo data seeds a goal
named "Home Down Payment" while the life-stage template's fixed name is "Home down-payment" (different
punctuation/casing), so the comparison missed the match and kept suggesting an effectively-duplicate
goal. Fixed with a punctuation-insensitive `normalizeGoalName()` (strips everything but letters/digits
before comparing) — handles this case and the general class of casing/spacing/hyphenation mismatches.

**Mobile — 2026-08-05, suggested/quick-win goals not appearing:** `createGoalFromTemplate()`
(`core/advisor/guidance.ts`) is called directly by two places outside `useGoals.ts` entirely —
`SuggestedGoals.tsx`'s "Add" and `FinancialHealthCard.tsx`'s "Set as goal" quick-win — neither of which
shared a repo instance with the Goals screen's own `useLoggedRepository(goalsRepo, ...)`. The goal was
genuinely written and logged to the activity feed (the toast and Timeline were both telling the truth),
but the Goals screen's own `goals` list never reloaded to show it, since MainTabs keeps every tab root
mounted (so navigating to Goals afterward didn't force a remount either). Fixed with a new
`notifyGoalsChanged()`/`useGoalsRefresh()` pair (`hooks/useDataRefresh.ts`/`.native.ts`, same in-memory
listener-set pattern as `notifyAccountsChanged`/`notifyTagsChanged`) — `useGoals.ts` subscribes
(`useGoalsRefresh(reloadGoals)`), and both call sites notify right after their `createGoalFromTemplate()`
await resolves.

**Mobile — 2026-08-05, Retirement corpus suggestion computed from real data, not a flat constant:**
`lifeStageGoalTemplates()`'s suggested "Retirement corpus" target used to be a hardcoded `₹2Cr` constant
regardless of the user's actual circumstances — someone whose real number (via the same math the Home
Retirement Corpus chart already uses) comes to ₹28Cr was getting a suggestion off by more than an order
of magnitude, undermining the app's own purpose of making the user financially *aware*. `lifeStageGoals.ts`
now takes an optional `RetirementSuggestion` (`{ targetAmount, yearsToRetirement }`) computed by the
caller via `calcRetirementProjection()` — the exact same function and stored `RetirementPlan` singleton
Home's chart reads — instead of owning a fallback constant itself. `SuggestedGoals.tsx` gathers the same
raw inputs (holdings/accounts/expenses/categories/profile DOB/the retirement plan) independently, since
a feature module can't cross-import `features/home`'s own hook; the computation is a `useMemo` that
recomputes live on every render while the goal is still just a suggestion (so it always reflects the
latest data), but is not recomputed again once the goal is actually added — from that point its
`targetAmount` is a normal editable field like any other goal.
- **No expense data yet → no Retirement corpus suggestion at all**, rather than falling back to a
  guessed number — a confidently wrong number is exactly the problem this replaces. (Education corpus,
  Home down-payment, and Marriage fund keep their existing flat India-benchmark constants — there's no
  equivalent real user data those could be computed from instead, e.g. no tracked home price or wedding
  budget, so they stay explicit starting points rather than trading one guess for a different one.)
- `guidanceForComponent()`'s own "Set as goal" quick-win for Emergency Fund (`core/advisor/guidance.ts`)
  was already correctly data-driven (`months × real avgMonthlyExpenses`, real `liquidAssets`, and
  already skips itself as an `'add-data'` action when there's no expense data) — audited as part of this
  work, no change needed there.

## Current limitations

- **`apps/web-react` (frozen):** contributions must still be logged manually — no way to link an expense
  or bank transaction as a goal contribution. This is resolved on `apps/mobile` only (see above).
- Mobile's manual-contribution delete-cascade isn't a single atomic Undo yet, unlike IOU's
  `deleteEntryAndTxn` — deleting a contribution and its linked transaction are two separate log entries
- No goal categories or grouping (e.g. "short-term" vs "long-term")
- The goal-driven SIP calculator (Goal SIP) assumes a constant return rate; it does not model volatility
  or step-up SIP scenarios — on mobile, the separate "SIP & SWP" tab does model step-up SIP + drawdown
  (see the 2026-08-01 relocation note above), but the two aren't reconciled into one tool
- No milestone tracking within a goal (e.g. celebrate hitting 25%, 50%, 75%)

## Planned improvements

- Phase 1.5: Joint goals — share a goal with household group members, with each person's contributions tracked separately
- Shipped on mobile (2026-08-01): tagging an expense/income/transfer as a contribution to a specific
  goal — see the mobile section above. Still open on `apps/web-react` (frozen).
- A single atomically-restorable Undo for a manual contribution + its linked transaction (mobile),
  matching IOU's `deleteEntryAndTxn`
- Phase 2: Goal milestone celebrations — visual rewards when you hit 25%, 50%, 75%, and 100%
- Phase 2: Step-up SIP modelling — plan for increasing your monthly contribution by a percentage each year

## Ideas welcome

- Should goals support sub-goals or milestones within a single goal?
- Would a goal-to-investment account linking be useful (e.g. "this goal is funded by my ELSS fund")?
- What goal types or templates would make setup faster?
