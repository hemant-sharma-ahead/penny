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
