---
name: parity-sweep
description: Audit apps/mobile against apps/web-react (the source of truth) for feature, behavior, design, and theming parity gaps — including chrome/navigation components and cross-platform code duplication, not just screen files. Use when asked to run a parity sweep, audit mobile for gaps vs web, or check web-vs-mobile consistency for a module.
---

# Parity Sweep

Formalizes a methodology that's been run ad hoc three times already (see
`docs/plans/mobile-migration.md`'s history before it was distilled) — each time re-derived
from scratch, each time finding real bugs. This skill exists so the 4th sweep starts from a
better rubric instead of zero, and so results land in one place instead of prose.

**Source of truth is always `apps/web-react`.** Mobile is being brought to parity with it,
not the other way around — never resolve a mismatch by changing web to match mobile without
being asked.

## Step 1. Scope the sweep

Check `docs/MOBILE_PARITY.md` first. Don't re-audit a module already marked ✅ verified
unless specifically asked to — but if a module is ⚠️ or 🔍, or the user names it directly,
proceed. Pick one module (or a few small ones together) per pass — `expenses` and
`portfolio` are large enough (~7,300+ lines each) to warrant their own dedicated pass.

## Step 2. Read `apps/web-react` first, in full — not from memory

For every screen/component in the module, read the actual web source end-to-end before
looking at mobile at all. Don't work from what a doc or a prior progress-log entry claims
is there — read the real file.

## Step 3. Compare against mobile, line by line

For every screen (`*Page.tsx`) **and every chrome/navigation component** the module
touches or is reachable from (tab bars, headers, modals mounted outside a page,
`MainTabs.tsx`-style app shell) — prior sweeps only checked `*Page.tsx` files and missed
real bugs in chrome as a result:

- **Functionality**: every action/feature/edge case on web exists on mobile.
- **Behavior**: interaction patterns match — taps, swipes, empty/loading/error states,
  what happens on the boundary conditions (zero items, first-time-use, error responses).
- **Design/theming**: colors use semantic tokens matching web's CSS-var cascade —
  specifically check privacy-mode and dark-mode *reactivity*
  (`useModeBackgroundColor()`/`useModeAccentColor()`/`shouldMask()`), not just a
  same-looking static color. A flat `theme.surface` or a hardcoded Tailwind class where web
  has a mode-reactive CSS var is a real bug, not a style nitpick — this exact shape caused
  two confirmed bugs this session (`MainTabs.tsx`'s tab bar, `IouPage.tsx`).
- **Layout**: matches web's structure adapted for RN (flex-wrap instead of CSS grid, etc.),
  not simplified or dropped without it being a documented, deliberate scope decision.

## Step 4. Cross-platform duplication check (permanent, every sweep)

For every `.native.ts`/`.web.ts` pair touched by or reachable from the module in
`packages/core`, diff each against its unsuffixed base file. Flag any literal (URL, storage
key, event name, cache TTL, etc.) that's hardcoded independently instead of imported from a
shared `*.constants.ts` file — this exact pattern caused the IPO API bug (fixed in only one
of two files, silently diverged). See `docs/ARCHITECTURE.md`'s platform-variance-
minimization principle and `docs/EXTERNAL_APIS.md` for the registry this feeds.

## Step 5. Never trust "already fixed"

If a prior doc or progress-log entry claims an item is already fixed, re-verify it directly
against current source anyway — don't skip re-verification based on stale status text. A
prior sweep missed a real bug exactly this way.

## Step 6. Report findings in a fixed format

One block per module, matching `docs/MOBILE_PARITY.md`'s columns exactly:

```
### <module>
Status: ✅ verified | ⚠️ gaps open | 🔍 not yet audited
Last audited: <date>
Known gaps:
- <short bullet, cite the exact file/line> [Severity: High/Medium/Low]
Priority: <High/Medium/Low>
```

If invoked as a review pass (not a fix pass), use the `ReportFindings` tool instead of
prose so results render structured.

## Step 7. Update `docs/MOBILE_PARITY.md`

Write the swept module's block back into that file directly — this is the one place
"what's the current status" should ever need to be answered from.
