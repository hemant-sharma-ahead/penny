# "Did You Know" Tips

## What it is

A whole-app content library of genuinely non-obvious Penny capabilities (bulk actions, tag tricks,
auto-linking behaviors, EPF/PPF calculators, privacy mechanics, and more), surfaced through three
distinct delivery tiers designed to inform without cluttering the UI or nagging the user.

## User-facing capabilities

Three tiers, one shared content library (`packages/core/src/core/tips/didYouKnowFacts.ts`):

- **Contextual nudges** — a small dismissible tip banner appears exactly where it's relevant, only when
  a real, already-computed condition is true (e.g. selecting 3+ transactions, or having a few tags but
  never having used "Set Aside"). Fires at most once, ever, per fact — dismissed or acted upon, it's
  gone for good.
- **Home's daily tip card** — sits at the very top of Home (above the at-a-glance summary), revealing one
  new tip a day. Tap to revisit an earlier day's tip; dismiss hides it for the rest of today only. Once
  every curated tip has been shown once, it stops appearing on Home entirely — by then "Discover Penny"
  is the known place to keep exploring. Turn it off entirely from Discover Penny's own toggle (default
  on).
- **Analytics' own ambient card** — a smaller, always-present tip card at the bottom of Analytics,
  preferring Analytics-relevant tips.
- **"Discover Penny" hub** (Settings → Discover Penny) — the full catalogue, grouped by module and
  searchable, including tips that never appear in the other two tiers. This is the one place that shows
  everything the research turned up, not gated by "seen" state.

## How it works

The content library (`DID_YOU_KNOW_FACTS`) tags every fact with a `module` and a `curated: boolean`.
Only `curated: true` facts (~39, hand-picked for genuine surprise/value) ever feed the contextual
nudges or the rotating cards (Home's daily card, Analytics' ambient card, and the Tax feature's own
`DidYouKnow` card — all three share one `DidYouKnowCard`/`DailyTipCard` implementation rather than
separate one-off components). "Discover Penny" shows the full library regardless of the `curated` flag.

- **Trigger logic** (`packages/core/src/core/tips/tipTriggers.ts`) — pure functions, unit-tested, each
  taking already-available screen state (a selection count, a tag list, a goal count + months tracked)
  and returning whether a nudge is eligible right now. The screen itself decides the "when"; the nudge
  component (`TipNudgeBanner`) only owns dismiss/persist.
- **Persistence** (`apps/mobile/src/lib/tipsStorage.ts`) — `AsyncStorage`-backed, following the same
  `Set<string>`-as-JSON-array dismiss convention already used elsewhere in the app
  (`penny_vacation_note_dismissed`, `penny_recurring_due_dismissed`): `penny_tips_dismissed` (Tier 1,
  permanent per-fact suppression), `penny_daily_tip_state` (Tier 2's Home card — how many curated tips
  have been revealed so far, the date of the last reveal, and today's dismiss state), and
  `penny_daily_tip_enabled` (the Discover Penny toggle, default on).
- Home's daily card advances `revealedCount` the first time it mounts on a new calendar day (bounded to
  the curated total — never loops or repeats past the end); tapping only cycles back through days
  already revealed, never ahead of the daily pace.
- The Tax feature's original `DidYouKnow.tsx` (a tappable, non-persisted fact-cycling card — the one
  existing precedent this whole feature generalizes from) is now a thin wrapper over the shared
  `DidYouKnowCard`, scoped to `module: "tax"` — `taxFacts.ts` remains the single source of truth for
  those facts, just consumed through the shared library instead of a Tax-only component.

## Current limitations

- No deep-link/CTA per tip (e.g. "Go to Manage Tags") — v1 is text-only, a deliberate scope cut to keep
  this shippable; each tip's own module grouping in Discover Penny is the closest thing to a pointer.
- Only 3 contextual nudges exist so far (bulk-hashtag, Set Aside, goal-linking) — more trigger
  conditions can be added the same way (a pure function in `tipTriggers.ts` + a `TipNudgeBanner` at the
  relevant screen) as real usage patterns suggest good moments.
- The "one new fact per day" pacing applies only to Home's own daily card — Analytics' and Tax's ambient
  cards are independent, always-on tap-to-cycle surfaces with no daily gating of their own (a deliberate
  simplification over coordinating "has today's new reveal already been claimed" across unrelated
  screens, which added real complexity for marginal benefit given Home's card is already the prominent,
  once-a-day surface).

## Planned improvements

- Per-tip CTAs/deep-links once the navigation-typing plumbing is worth the investment.
- More contextual nudges as real usage data suggests good trigger moments.
- Consider migrating iOS's/`apps/web-react`'s own equivalents if either ever gets this feature (currently
  mobile/Android + iOS-native both get it since it's `apps/mobile`-wide, not gated per-platform; only
  `apps/web-react` — frozen — has no equivalent).

## Ideas welcome

- Should a tip ever earn its own "New!" badge on the feature it describes (e.g. a small dot on the
  Budgets icon until first opened), as a fourth, even more ambient discovery channel?
- Should Discover Penny track which tips a user has actually read, to fade out ones already seen instead
  of always showing the full list undifferentiated?
