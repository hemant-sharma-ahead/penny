# Mobile Parity Status

The living source of truth for "what's left" in the `apps/mobile` vs `apps/web-react`
parity effort — populated and updated by the `parity-sweep` skill
(`.claude/skills/parity-sweep/SKILL.md`) and the `parity-auditor` agent
(`.claude/agents/parity-auditor.md`). Read this before starting any parity work instead of
searching `docs/plans/mobile-migration.md`'s history.

`apps/web-react` is always the source of truth. Feature-folder coverage between the two
apps is already 1:1 (24/24 modules exist on both sides) — every entry below is a
within-module depth check (functionality, behavior, theming, layout, cross-platform code
duplication), not a missing-module hunt. "Chrome/shared components" and "popups/modals
(app-wide)" aren't feature modules — they're code outside every `features/<module>/`
folder (`components/`, `context/`, `navigation/`) and every `<Modal>` usage across the
app respectively, tracked as their own rows since they belong to no single module but
are used everywhere.

## Program status — read this first, every session

The Web-react → Mobile Parity Program runs in numbered phases:

- **Phases 0–5: done, committed** (`14b99cb`, plus a follow-on round covering root
  hygiene, the `apps/web-legacy` → `apps/web-react` rename, `parity-sweep` skill + 5
  subagents, the doc overhaul, 3 diagnosed-and-fixed bugs, a 9-group DRY refactor, moving
  `capacitor.config.ts` into `apps/web-react/`, fixing mobile's chrome-persistence
  navigation bug, adding Context7 MCP, expanding all 5 agent prompts, and adding the
  `documentation-maintenance` + `ui-design-check` skills and `ui-designer` agent.
- **Phase 6 — component-folder reorganization: scoped, not executed.**
  `apps/mobile/src/components/ui/` (~28 flat files) and its web counterpart would
  benefit from Cashew-style cohesive subfolders, but this is high import-path churn for
  low urgency — deferred until it gets its own dedicated scoping pass.
- **Phase 7 — the full 24-module parity sweep: done, 2026-07-26.**
- **Phase 8 — fix the accumulated backlog: done, 2026-07-26.** Ran in 3 rounds as gaps
  in the sweep methodology itself were found and closed: (1) the original 24-module
  sweep, (2) a wider re-scope to chrome/shared components + an app-wide popups pass after
  2 real bugs were found outside any module's scope, (3) a full from-scratch re-audit of
  everything after 2 more bug classes (`<Svg>` sizing, `TextInput` wrapper-padding) were
  discovered via on-device screenshots. The `parity-sweep` skill and `parity-auditor`
  agent carry the accumulated methodology forward — read them, not this history, for what
  to check in the next sweep. Every fix was verified via `tsc -b` +
  `eslint --max-warnings 0` + the full test suite (401 core + 39 workers passing).
- **Phase 9 — full from-scratch re-sweep: done, 2026-07-31.** Triggered by a user report
  that the date picker didn't work on RN Web. Root-caused first (`@react-native-community/
  datetimepicker` ships no web build at all — its platform-less fallback silently renders
  `null`), fixed, and added to the skill as a new permanent bug class. That triggered a
  full, from-scratch re-audit of all 24 modules + chrome/shared components + an app-wide
  popups/modals pass (10 parallel `parity-auditor` runs, none trusting the existing ✅
  status per the skill's Step 7), specifically re-checking every native-only library used
  anywhere in `apps/mobile` for the same "no web build" gap. Found and fixed 2 more
  instances of that exact bug class (`ProfilePage.tsx`'s DOB field hand-rolled its own
  raw `datetimepicker` call instead of routing through the fixed `DateInput`; `loans`'
  `PlannerResults.tsx` called `expo-file-system` unconditionally, which throws on RN Web),
  plus a re-surfacing of the 2026-07-27 empty-string-text-node bug class in `security`'s
  two Change PIN/Passphrase screens, and ~14 smaller findings (a systemic `theme.danger`-
  vs-`theme.open` error-color mismatch across the shared UI kit, a dropped `tabular-nums`
  on numeric displays, a missing bottom scroll inset in `tax`, a duplicated `entitlement.
  native.ts`/`.web.ts` pair, and several one-off style/spacing misses). All fixed,
  verified via `tsc -b` + `eslint --max-warnings 0` + the full test suite (491 core/web +
  43 workers passing), and now consistent between `apps/mobile` and `apps/web-react` — per
  the skill's Step 9, the per-finding detail was cleared from "Findings by module" below
  once the round's backlog was fully closed (see git history for file:line specifics). 2
  net-new-scope items (an `Icon` spin capability; porting `ImportCleanupPanel` to mobile)
  were surfaced separately from the parity-bug findings, since they're feature additions
  rather than 1:1 parity fixes — both confirmed with the user and implemented.
- **▶ Next**: on-device verification of the open items below (loans XLSX export, expenses
  scroll-to-focus), then either another sweep round (the `numberOfLines`-without-
  `flex-shrink` sweep is the natural next target) or Phase 6 (component-folder
  reorganization).

**Open items (all fixes below are code-complete, not yet confirmed on-device):**
- **Loans' XLSX export** — the library was switched from web's `xlsx` to
  `write-excel-file/universal` (`xlsx`'s CJS `require('fs')` fails under Metro); the two
  libraries' cell/column type models differ enough that output can't be confirmed
  identical by reading code alone. Needs a real download-and-open check.
- **Expenses' scroll-to-focus-on-validation-error** (`ExpenseForm.tsx`'s `focusPanel()`,
  using RN's `measureLayout` to scroll a failed panel into view) — touches native
  measurement/scroll behavior, which can't be confirmed by reading code alone.
- **`WrappedModal`'s close-button vertical offset** doesn't textually match web's, but
  mobile's version reserves its own top-inset space (`SafeAreaView`) in a way web has no
  equivalent of — the two values may or may not net out to the same visual position.
  Left as-is pending an on-device look rather than guessed at.
- **Everything else fixed across all three rounds** (chrome-persistence, Svg/TextInput
  bugs, the 24-module + popups re-audit's full batch) — code-complete and verified via
  `tsc -b`/`eslint`/tests, but a general visual pass over the touched screens is still
  worthwhile.
- **[Low, deliberate — not fixed] `IdentityReconciler` shows a brief full-screen spinner
  on every cold start, not just after a restore** — web reads its flag synchronously from
  `localStorage`; mobile's `AsyncStorage` read can't be synchronous, so `phase` always
  starts at `'checking'` first. Documented in the code's own comment as an unavoidable
  platform difference; the flash is likely sub-frame in practice.
- `docs/ROADMAP.md`'s Track 6/Track 7 detailed prose has not been trimmed — needs
  cross-checking against `docs/features/expenses.md`/`cash-flow.md`/`tax-awareness.md`/
  `subscriptions.md` first to confirm nothing unique would be lost.
- **[New bug class, 3 instances fixed (2026-07-27, 2026-07-31)] `stringVar && <Text>`
  renders a raw empty-string text node under a `<View>` on RN Web, but not on true
  native.** Found via `SettingsPage.tsx:272`'s `handleLine` (built with
  `.filter(Boolean).join(' · ')`, which is `''` — falsy but still a string — when both
  parts are absent): `{handleLine && <Text>...}` then renders the empty string itself as a
  `View` child, and RN Web validates that strictly ("Unexpected text node... cannot be a
  child of a `<View>`"), while true native silently tolerates it. Fixed there via a
  ternary to `null` instead of relying on `&&`'s short-circuit value; the same shape
  re-surfaced and was fixed in `security`'s `ChangePinPage.tsx`/`ChangePassphrasePage.tsx`
  (both gating on an `error` string reset to `''`). A grep for the same
  `stringVar && <Text>`/`<View>` shape still finds ~30 other matches across
  `apps/mobile/src` — most look to be gating on `null`/booleans (safe), but none have been
  individually re-verified; a dedicated sweep for this exact pattern (specifically any
  that gate on a string built via `.join()`, template literals, or `?? ''` fallbacks) is
  worth doing as its own pass, ideally tested under RN Web where it actually surfaces.
- **[Recommended, not yet done] App-wide sweep for `numberOfLines={1}` without a paired
  `flex-1`/`flex-shrink`.** RN's Yoga engine defaults `flexShrink` to 0 (unlike CSS), so a
  `Text` with `numberOfLines` but no `flex-1`/`flex-shrink` never actually gets constrained
  to a shrinkable width and won't elide long content. One confirmed instance
  (`features/import/review/CategoryTile.tsx`'s `sourceName`) was found and fixed; a
  full-tree grep found 103 `numberOfLines={1}` hits total, too many to individually verify
  in a single pass.

**Status legend**: ✅ verified (swept, no open gaps) · ⚠️ gaps open (swept, findings
below) · 🔍 not yet audited (no formal sweep has run yet).

| Module | Status | Last audited | Priority |
|---|---|---|---|
| chrome/shared components | ✅ | 2026-07-31 | — |
| popups/modals (app-wide) | ✅ | 2026-07-31 | — |
| accounts | ✅ | 2026-07-31 | — |
| activity | ✅ | 2026-07-31 | — |
| backup | ✅ | 2026-07-31 | — |
| calculators | ✅ | 2026-07-31 | — |
| cashflow | ✅ | 2026-07-31 | — |
| chip | ✅ | 2026-07-31 | — |
| [expenses](#expenses) | ⚠️ | 2026-07-31 | On-device verify |
| feedback | ✅ | 2026-07-31 | — |
| goals | ✅ | 2026-07-31 | — |
| groups | ✅ | 2026-07-31 | — |
| health | ✅ | 2026-07-31 | — |
| home | ✅ | 2026-07-31 | — |
| import | ✅ | 2026-07-31 | — |
| insurance | ✅ | 2026-07-31 | — |
| iou | ✅ | 2026-07-31 | — |
| [loans](#loans) | ⚠️ | 2026-07-31 | On-device verify |
| news | ✅ | 2026-07-31 | — |
| onboarding | ✅ | 2026-07-31 | — |
| portfolio | ✅ | 2026-07-31 | — |
| profile | ✅ | 2026-07-31 | — |
| security | ✅ | 2026-07-31 | — |
| settings | ✅ | 2026-07-31 | — |
| subscriptions | ✅ | 2026-07-31 | — |
| tax | ✅ | 2026-07-31 | — |

Modules with no findings just show ✅ above — see "Findings by module" below for the
ones with something still open or worth a note.

## Findings by module

### expenses

1. **[On-device verify] Scroll-to-focus on validation error.** `ExpenseForm.tsx`'s
   `focusPanel()` uses RN's `measureLayout` (via `Modal`'s new `scrollRef` prop) to scroll
   a failed conditionally-required panel (tags/IOU/share/repeat) into view, matching web's
   `scrollIntoView`-based `focusPanel()`. Implemented and typechecked, but native
   `measureLayout` behavior needs a real confirmation: trigger a validation error on each
   of the 4 panels and confirm the form scrolls to the right one.

### loans

1. **[On-device verify] XLSX export.** `PlannerResults.tsx` generates the amortization
   schedule via `write-excel-file/universal` instead of web's `xlsx` (which fails under
   Metro). Needs a real download-and-open check to confirm the output (columns, number
   formatting, headers) matches web's export. (`write-excel-file/universal` itself was
   re-verified 2026-07-31 to be genuinely web-safe — pure JS, only depends on `fflate` +
   the global `Blob` — so this item is scoped to output-fidelity, not a web-support gap.)
