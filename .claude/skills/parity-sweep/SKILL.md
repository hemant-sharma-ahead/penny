---
name: parity-sweep
description: Audit apps/mobile against apps/web-react (the source of truth) for feature, behavior, design, and theming parity gaps — including chrome/navigation components, shared/global components outside any feature module, popups/modals app-wide, and cross-platform code duplication, not just per-module screen files. Use when asked to run a parity sweep, audit mobile for gaps vs web, or check web-vs-mobile consistency for a module.
---

# Parity Sweep

Formalizes a methodology that's been run ad hoc multiple times already (see
`docs/plans/mobile-migration.md`'s history) — each earlier pass found real bugs but also
missed real bugs, because the rubric kept being re-derived from scratch or scoped too
narrowly. This skill is the accumulated, corrected version. **Read it in full every time,
even if you've run a sweep before** — it gets updated when a miss is found, and an out of
date mental model of it defeats the purpose.

**Source of truth is always `apps/web-react`.** Mobile is being brought to parity with it,
not the other way around — never resolve a mismatch by changing web to match mobile without
being asked.

## The standard this sweep is held to

The 2026-07-26 sweep covered all 24 feature modules, found and got ~50 findings fixed, and
was still missing real, visible-on-first-launch bugs — caught only when the user manually
opened the app and screenshotted it (a doubled top-inset gap on 18 of 23 pushed screens; a
button overflowing outside its modal's boundary). Both were 100% provable by reading source
code alone, no device needed — they were missed because of *scope*, not depth: neither bug
lived inside a `features/<module>/` folder, which is all earlier sweeps looked at. **Read
every single line of the relevant web-react file(s), top to bottom, before touching
mobile — do not skim, do not sample a "representative" section, do not infer behavior from
a function or prop name.** The goal is to catch the smallest inaccuracy, not just the
obvious ones.

## Step 1. Scope the sweep — modules AND shared/global code

Check `docs/MOBILE_PARITY.md` first. Don't re-audit a module already marked ✅ verified
unless specifically asked to — but if a module is ⚠️ or 🔍, or the user names it directly,
proceed. Pick one module (or a few small ones together) per pass — `expenses` and
`portfolio` are large enough (~7,300+ lines each) to warrant their own dedicated pass.

**A per-module sweep is not the whole app.** Code outside every `features/<module>/`
folder — `apps/mobile/src/components/` (`ui/`, `shared/`, `privacy/`, `demo/`,
`reminders/`), `apps/mobile/src/context/`, `apps/mobile/src/navigation/` — is used by
*every* screen and has the widest blast radius when broken, but belongs to no single
module, so a module-scoped sweep silently skips it forever. This is exactly where the
button-overflow bug lived (`components/privacy/PrivacyModeSwitcher.tsx`) and it will keep
happening unless these get their own explicit, periodic full pass — treat them as their own
pseudo-modules in `docs/MOBILE_PARITY.md` ("chrome/navigation", "shared components") rather
than only checking them incidentally when a feature module happens to reference them.

**Popups/modals get a dedicated, app-wide pass of their own**, not just whatever modals
happen to fall inside the module being swept. Run `grep -rn "<Modal" apps/mobile/src
--include="*.tsx"` to enumerate every usage, and its web equivalent, and diff each pair
individually for: button-row layout (see the systemic check below), input sizes, icon
circle sizes, spacing/padding, and centering. Modals are disproportionately bug-prone
because they're small, numerous, and easy to eyeball as "probably fine."

## Step 2. Read `apps/web-react` first, in full — not from memory

For every screen/component in the module, read the actual web source end-to-end before
looking at mobile at all. Don't work from what a doc or a prior progress-log entry claims
is there — read the real file, every line, every prop, every className string in full
(not just the parts that look load-bearing).

## Step 3. Compare against mobile, line by line

For every screen (`*Page.tsx`) **and every chrome/navigation/shared component** the module
touches or is reachable from (tab bars, headers, modals mounted outside a page,
`MainTabs.tsx`-style app shell):

- **Functionality**: every action/feature/edge case on web exists on mobile.
- **Behavior**: interaction patterns match — taps, swipes, empty/loading/error states,
  what happens on the boundary conditions (zero items, first-time-use, error responses).
- **Design/theming**: colors use semantic tokens matching web's CSS-var cascade —
  specifically check privacy-mode and dark-mode *reactivity*
  (`useModeBackgroundColor()`/`useModeAccentColor()`/`shouldMask()`), not just a
  same-looking static color. A flat `theme.surface` or a hardcoded Tailwind class where web
  has a mode-reactive CSS var is a real bug, not a style nitpick.
- **Layout**: matches web's structure adapted for RN (flex-wrap instead of CSS grid, etc.),
  not simplified or dropped without it being a documented, deliberate scope decision (check
  `docs/features/<module>.md`'s Mobile section for such a note before flagging a difference
  as a bug).
- **Navigation reachability**: is the screen actually reachable via a real
  `navigation.navigate()` call from somewhere in the app, or a registered-but-dead route?
- **Security/dismissibility of chrome during a sensitive in-progress flow**: if web hides
  or disables any chrome (a menu button, the whole nav bar) while a screen is in a
  forced/sensitive state (e.g. a forced PIN reset), check whether mobile's persistent
  chrome — which lives in a different file (`MainTabs.tsx`) than the sensitive screen
  itself — replicates that lockdown. This class of bug is invisible to a sweep that only
  reads the sensitive screen's own file; it requires explicitly checking the chrome that
  wraps it.
- **Top-inset/SafeAreaView duplication for any nested/pushed screen**: if a screen is
  reachable by being *pushed* inside a stack navigator that itself renders under a
  persistent chrome header (which already reserves top inset space), check whether the
  pushed screen *also* wraps itself in `<SafeAreaView edges={['top']}>` — that's a doubled
  inset, producing a visible blank gap above the screen's content. Compare against a tab
  *root* screen (rendered directly under `Tab.Navigator`, no persistent header nested
  above it a second time) — those correctly use `edges={[]}`. Any screen registered inside
  a per-tab nested stack (`HomeStack`/`ExpensesStack`) should match that, not the
  pre-refactor `edges={['top']}` convention from when it was a standalone top-level route.

## Step 4. Static, provable-from-source bug classes — check these explicitly, every time

These don't require running the app; they're deducible from reading the JSX/styles alone,
and have each caused real, confirmed, on-device-visible bugs:

- **Two or more sibling elements each with `fullWidth`/`w-full` inside one `flex-row`
  parent.** Each tries to claim 100% of the row's width — they overflow/overlap instead of
  sharing it evenly, and the effect (a button rendering outside its modal's boundary) is
  easy to miss by eye in a code review but glaring on a real screen. The fix is always the
  same: wrap each in its own `<View className="flex-1">`. Grep the whole
  `apps/mobile/src` tree for this shape, don't just check the module in scope — this
  pattern recurred independently in at least 6 different files across 4 different modules
  plus one shared component before it was caught everywhere.
- **`SafeAreaView edges={['top']}` on a screen nested under a persistent chrome header**
  — see Step 3's bullet above; grep `apps/mobile/src/features` for
  `SafeAreaView edges={\['top'\]}` and cross-check each hit against whether it's a tab
  root (correct) or a pushed/nested screen (wrong — should be `edges={[]}`).
- **A hardcoded hex/opacity value standing in for a shared design token** (a `${color}18`
  alpha suffix instead of the shared `tint()` helper, a raw `#10b981` instead of
  `theme.success`) — grep for the literal, don't assume it's an isolated instance.
- **`<Svg>` (react-native-svg) with no explicit `width`/`height`, or a wrapping `View`
  constrained on only one axis** (e.g. `className="w-48 self-center"` with no height and
  no `aspectRatio`). An SVG's `viewBox` alone does not give it an intrinsic size in RN —
  without `width`/`height` (numeric, `%`, or a resolvable parent via `aspectRatio`
  matching the viewBox's ratio), it can render at zero size, and did: a health-score
  gauge collapsed to nothing, and the surrounding modal was reported as "rendering
  blank." Grep `apps/mobile/src` for every `<Svg` and check each one has a real,
  resolvable size, not just a `viewBox`.
- **A bare `TextInput` whose padding is applied to a wrapping `View`, not the input
  itself** (e.g. `SearchInput.tsx`'s pattern: `<View className="... px-3 py-2">` wrapping
  an `<RNTextInput className="flex-1 text-sm">` with no padding of its own). Android's
  native text-entry widget carries its own default internal padding independent of
  `includeFontPadding` (which only affects font-metric spacing, not the widget's own
  padding) — if nothing on the `TextInput` itself zeroes it (`style={{ padding: 0,
  margin: 0 }}`), that default padding stacks on top of the wrapper's padding and the
  field renders visibly taller than its siblings. Compare against a `TextInput` where the
  padding is applied directly to the input (e.g. `components/ui/TextInput.tsx`) — those
  don't have this problem, because the input's own box is what's constrained.
- **A native-only library (wraps real OS UI — a native dialog, a native widget) with no
  RN-Web build, used unconditionally with no `.web.tsx` variant.** Found 2026-07-31:
  `components/ui/DateInput.tsx` used `@react-native-community/datetimepicker`
  unconditionally; the installed package has `.ios.js`/`.android.js`/`.windows.js` source
  files but no `.web.js` anywhere, and its platform-less fallback
  (`src/datetimepicker.js`) renders `null` with a `console.warn('...not supported on:
  ' + Platform.OS)` — so on RN Web the component's `Modal` opened with a blank body and no
  way to pick a date. Nothing about this is visible from the RN-side code alone (the
  `Platform.OS === 'android'` branch reads as complete); it only shows up by checking
  what the *library itself* ships. For every native-only dependency the module touches
  (grep the file's imports against `find <pkg> -iname "*.web.*"` in the resolved
  `node_modules` path — a wrapped native dialog, slider, camera view, biometric prompt,
  etc.), confirm a `.web.js`/`.web.ts` actually exists upstream, or that the component has
  its own hand-written `ComponentName.web.tsx` sibling providing a DOM-based equivalent
  (see `DateInput.web.tsx`'s real `<input type="date">` for the pattern — reuse the exact
  DOM element web-react itself uses wherever one exists, rather than hand-rolling a
  lookalike). A library merely being importable and type-checking under `tsc -b` proves
  nothing about its web behavior — `tsc -b`'s `moduleSuffixes` doesn't even include
  `.web`, so it silently type-checks the native fallback path as if it were fine.

## Step 5. Systemic-pattern check (the meta-rule behind Step 4)

**Any bug that looks like a *pattern* — not a one-off typo — earns an immediate
full-`apps/mobile/src` grep for the same shape before you finalize findings.** The
2026-07-26 sweep's biggest single finding (a missing-border bug) started as "one instance
in `tax`" and became 32 instances across 24 files once the whole tree was searched;
Step 4's `fullWidth`-sibling bug likewise started as one modal and became 6+. Don't report
"the instance in front of you" and move on — ask "if this developer made this mistake
once, where else did they make it?" and go check.

## Step 6. Cross-platform duplication check (permanent, every sweep)

For every `.native.ts`/`.web.ts` pair touched by or reachable from the module in
`packages/core`, diff each against its unsuffixed base file. Flag any literal (URL, storage
key, event name, cache TTL, etc.) that's hardcoded independently instead of imported from a
shared `*.constants.ts` file. See `docs/ARCHITECTURE.md`'s platform-variance-minimization
principle and `docs/EXTERNAL_APIS.md` for the registry this feeds.

## Step 7. Never trust "already fixed"

If a prior doc or progress-log entry claims an item is already fixed, re-verify it directly
against current source anyway — don't skip re-verification based on stale status text.

## Step 8. Report findings in this format

Per module (or per shared-component group), a numbered, severity-tagged list — this is
what `docs/MOBILE_PARITY.md` actually uses:

```
### <module>
1. **[Severity] Short title.** Description with exact file:line citations on both sides.
2. **[Severity] ...**
```

**You (the auditor) almost certainly have no `Edit`/`Write` tools** — don't attempt to
write `docs/MOBILE_PARITY.md` yourself. Report in the format above as your final message;
the session that invoked you (which has write access) copies it in verbatim. If asked to
also self-check your tool access, note plainly that you couldn't write the file rather than
silently omitting that step.

## Step 9. On fix: strikethrough, don't delete

Whoever fixes a finding later marks it `~~struck through~~` **Fixed** in place (with a
one-line note on the fix) rather than deleting the line — `docs/MOBILE_PARITY.md` is a
living history of what was found and fixed, not just a current-state snapshot, until the
backlog for a sweep is fully cleared (at which point the whole finished round can be
condensed/cleared for the next sweep to start clean).
