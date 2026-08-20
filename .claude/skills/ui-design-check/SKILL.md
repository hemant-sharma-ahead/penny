---
name: ui-design-check
description: Review or propose a screen/component against docs/DESIGN_GUIDELINES.md and cross-platform (web-react vs mobile) consistency. Use when refactoring UI, designing a new screen, or producing a mockup proposal.
---

# UI Design Check

Methodology for two related situations: **reviewing** an existing screen/component for
design-guideline and cross-platform consistency, and **proposing** a new/refactored design
before any code changes. Both follow `docs/DESIGN_GUIDELINES.md` — the single source of
truth for UI design — read it in full before either.

## Step 1. Read `docs/DESIGN_GUIDELINES.md` first, not from memory

Design rules change (a new token, a new pattern) — always read the current file rather
than relying on what a prior session established. Pay particular attention to the
non-negotiables: semantic tokens only, centered modals (no bottom sheets), a back button
on every sub-page, the z-index ladder, and the "keep shared controls in sync" rule
(anything appearing in more than one place — icon, color, label, behavior — must match
everywhere it appears, including across `apps/web-react` and `apps/mobile`).

## Step 2. Cross-platform consistency is in scope, always

Per project direction, **a UI refactor applies to both `apps/web-react` and
`apps/mobile`** until the `react-native-web` unification described in `docs/ROADMAP.md`'s
long-term vision happens — they are not independent design surfaces today. When
reviewing or proposing:

- Read the equivalent screen/component on **both** platforms before judging either one in
  isolation.
- If a design change is warranted, say explicitly whether it needs mirroring on the other
  platform, and if the two platforms' current implementations already disagree, flag that
  as a finding in its own right (this exact class of bug — a chrome/screen background not
  reacting to privacy mode on mobile the way web's CSS cascade does automatically — has
  been found and fixed multiple times already; treat it as a standing risk, not a one-off).
- Platform-appropriate translation is expected and fine (CSS grid → `flex-wrap`,
  `conic-gradient` → `react-native-svg`, bottom sheets are never used on either platform) —
  the goal is equivalent behavior/appearance, not literal pixel identity.

## Step 3. Checklist for a review

- **Tokens**: semantic only (`bg-surface`, `text-primary`, etc. on web; the matching theme/
  mode hooks on mobile) — no hardcoded colors except documented domain/brand accents.
- **Modals**: centered, never a bottom sheet, correct z-index layering relative to
  header/bottom-nav.
- **Navigation chrome**: header + bottom-nav (web) / tab bar (mobile) must remain visible
  for every screen — a screen that unmounts the persistent chrome is a bug, not a design
  choice (this exact bug existed on mobile until a navigation restructure fixed it; if
  you're adding a new mobile screen, confirm it's registered inside a nested stack under
  `MainTabs`, not as a flat top-level sibling — see `mobile-developer`'s agent definition).
- **Back button**: present on every sub-page, using the shared component
  (`BackButton`), not a one-off.
- **Privacy-mode reactivity**: any background/accent that should tint with Safe/Private/
  Open mode uses the real hook/CSS-var, not a static color that happens to look right in
  one mode.
- **Consistency with itself**: if this control/pattern appears elsewhere in the app
  (e.g. privacy-mode iconography in both the header switcher and Settings), confirm it
  still matches after your change.
- **Duplicated capability = a redesign signal, not N separate bugs.** If a bug-fix pass
  turns up multiple small issues that all trace back to the same capability being
  implemented twice (e.g. a dedicated "Back up to Google Drive" card *and* a "Drive" tab
  in an Automatic Backup control, both driving the same provider), do not patch each
  location in place (a toast here, a disabled state there) — that cements the
  duplication instead of fixing it. Stop and treat it as a Step 4 consolidation
  candidate: propose collapsing it into one control before touching the code further.
  This exact mistake happened on Penny's Backup & Restore screen (2026-07-27): three
  cosmetic patches were shipped (toast feedback, disabled tabs, a loading spinner) on top
  of a screen that actually needed consolidating from 4 cards down to 3, with each
  Automatic Backup tab becoming fully self-sufficient (its own "Back up now" doing the
  tab-appropriate action — local save, Drive upload, iCloud upload — instead of a
  separate card per destination). The user had to explicitly redirect after the fact.
  Recognize this pattern *before* implementing, not after being corrected.

## Step 4. Proposing a new design (mockup workflow)

Never jump straight to code for a UI change beyond a small, obvious fix — and per the
duplicated-capability heuristic above, "obvious fix" does not include patching multiple
spots that all do the same thing; that's a consolidation, always routed through this
mockup workflow:

1. Build the improved layout as a **new HTML mockup** in `docs/mockups/proposals/` (e.g.
   `<screen>-vN.html`), in the style of the existing mockups — ground it in the real
   current screen, never an invented layout.
2. **Every mobile screen mockup renders at real device dimensions** (e.g. a ~390×844 or
   412×915 phone frame), full-height regardless of content, never a box sized to fit its
   content — a mockup the user can't visually place on an actual phone doesn't do its job.
   This applies per-screen even when a mockup toggles between multiple design options for
   the same screen (each option's frame is still full device size, not just the option
   that happens to have the most content). First got this wrong 2026-08-19 — screens sized
   to content instead of the device made a redesign proposal hard to judge realistically.
3. Prefer making mockups **interactive** (real toggle/tab controls between options, working
   click-throughs for multi-step flows) over static side-by-side images wherever the
   discussion involves comparing options or walking through a flow — a user clicking
   through an accordion or a stepper judges it far better than reading a description of
   what it would do.
4. **Never edit an existing design-of-record mockup** (in `docs/mockups/`) without asking
   first.
5. Present the proposal and get explicit user approval before any app-code changes.
6. If the screen exists on both platforms, the mockup should account for both (or two
   mockups, one per platform, if the layout genuinely needs to differ) — don't design for
   one platform and leave the other's treatment implicit.

## Step 5. If a gap is found mid-review

Report it the same way `code-reviewer`/`parity-auditor` do — via `ReportFindings` if
invoked as a review pass, otherwise as a clear, actionable note (file, what's wrong, what
the guideline says instead) rather than fixing it silently if you were only asked to review.
