# Mobile Parity Status

The living source of truth for "what's left" in the `apps/mobile` vs `apps/web-react`
parity effort — populated and updated by the `parity-sweep` skill
(`.claude/skills/parity-sweep/SKILL.md`) and the `parity-auditor` agent
(`.claude/agents/parity-auditor.md`). Read this before starting any parity work instead of
searching `docs/plans/mobile-migration.md`'s history.

`apps/web-react` is always the source of truth. Feature-folder coverage between the two
apps is already 1:1 (24/24 modules exist on both sides) — every entry below is a
within-module depth check (functionality, behavior, theming, layout, cross-platform code
duplication), not a missing-module hunt.

## Program status — read this first, every session

The Web-react → Mobile Parity Program runs in numbered phases:

- **Phases 0–5: done, committed** (`14b99cb`, plus a follow-on round covering root
  hygiene, the `apps/web-legacy` → `apps/web-react` rename, `parity-sweep` skill + 5
  subagents, the doc overhaul, 3 diagnosed-and-fixed bugs (bottom-nav tint, `IouPage`
  background, Android `TextInput` padding), a 9-group DRY refactor, moving
  `capacitor.config.ts` into `apps/web-react/`, fixing mobile's chrome-persistence
  navigation bug (header/bottom-tab-bar now stay mounted via nested per-tab stacks),
  adding Context7 MCP, expanding all 5 agent prompts, and adding the
  `documentation-maintenance` + `ui-design-check` skills and `ui-designer` agent.
- **Phase 6 — component-folder reorganization: scoped, not executed.**
  `apps/mobile/src/components/ui/` (~28 flat files) and its web counterpart would
  benefit from Cashew-style cohesive subfolders, but this is high import-path churn for
  low urgency — deferred until it gets its own dedicated scoping pass.
- **▶ Next: Phase 7 — the full 24-module parity sweep.** Use the `parity-sweep` skill
  + `parity-auditor` agent to sweep every module below against `apps/web-react` as
  source of truth, populating this table as it goes. Spans multiple sessions — batch by
  module size (small modules together; `expenses`/`portfolio`, ~7,300+ lines each, each
  get their own dedicated pass).
- **Phase 8 — fix the resulting backlog in prioritized batches**, using
  `mobile-developer`/`web-developer` to implement and `code-reviewer` before each
  commit. Typecheck + lint + full test suite after each batch; on-device verification is
  the user's to do; update this file, the relevant `docs/features/<module>.md`, and
  `CLAUDE.md`'s pointer together each time.

**Also still open, not yet picked up:**
- `docs/ROADMAP.md`'s Track 6/Track 7 detailed prose has not been trimmed — needs
  cross-checking against `docs/features/expenses.md`/`cash-flow.md`/`tax-awareness.md`/
  `subscriptions.md` first to confirm nothing unique would be lost.
- Loans' XLSX export has not been verified on-device.

**Status legend**: ✅ verified (swept, no open gaps) · ⚠️ gaps open (swept, findings
below) · 🔍 not yet audited (no formal sweep has run yet).

| Module | Status | Last audited | Known gaps | Priority |
|---|---|---|---|---|
| accounts | 🔍 | — | — | — |
| activity | 🔍 | — | Flagged during unrelated research as notably larger/more-divergent than its web counterpart (+18% lines) — worth an early pass. See [`docs/features/activity.md`](features/timeline.md). | Medium |
| backup | 🔍 | — | — | — |
| calculators | 🔍 | — | — | — |
| cashflow | 🔍 | — | — | — |
| chip | 🔍 | — | — | — |
| expenses | 🔍 | — | Transactions list rebuilt on `FlashList` + several perf/UX fixes this session (see `docs/plans/mobile-migration.md`'s playbook) — implementation work, not a formal line-by-line sweep against web yet. | Medium |
| feedback | 🔍 | — | — | — |
| goals | 🔍 | — | — | — |
| groups | 🔍 | — | — | — |
| health | 🔍 | — | — | — |
| home | 🔍 | — | Flagged during unrelated research as notably larger/more-divergent than its web counterpart (+27% lines) — worth an early pass. | Medium |
| import | 🔍 | — | List rebuilt on `FlashList` this session for perf. | Low |
| insurance | 🔍 | — | — | — |
| iou | ⚠️ | 2026-07-26 | `IouPage.tsx` uses a flat `bg-surface-tertiary` instead of `useModeBackgroundColor()` — fix tracked in this session's active work (Phase 4 of the parity program). | High |
| loans | 🔍 | — | — | — |
| news | 🔍 | — | List rebuilt on `FlashList` this session for perf. | Low |
| onboarding | 🔍 | — | — | — |
| portfolio | 🔍 | — | Largest module (~7,300+ lines) alongside `expenses` — warrants its own dedicated sweep pass. | Medium |
| profile | 🔍 | — | — | — |
| security | 🔍 | — | — | — |
| settings | 🔍 | — | — | — |
| subscriptions | 🔍 | — | — | — |
| tax | 🔍 | — | — | — |

## Cross-cutting, non-module-scoped findings

Findings that don't belong to one module — tracked here instead of duplicated across rows:

- **Bottom tab bar** (`apps/mobile/src/navigation/MainTabs.tsx`) doesn't tint for privacy
  mode — flat `theme.surface` vs web's `--color-mode-header-bg` cascade. Chrome components
  like this are outside every `*Page.tsx`-scoped sweep by definition — the `parity-sweep`
  skill's Step 3 now explicitly includes them. Fix tracked in this session's active work.
- **Text inputs** (`TextInput.tsx`/`SearchInput.tsx`/`AmountInput.tsx`) render taller than
  web's equivalents on Android — missing `includeFontPadding={false}`. Fix tracked in this
  session's active work.
- **Platform-suffix duplication** in `packages/core/src/` — see
  [`docs/EXTERNAL_APIS.md`](EXTERNAL_APIS.md) and `docs/ARCHITECTURE.md`'s
  platform-variance-minimization principle. 9 file groups identified so far; refactor
  tracked in this session's active work.
