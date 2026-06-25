# Timeline (Activity log)

## What it is

A time-machine and journal for your money. Every user-initiated change across the app is recorded locally
to the encrypted `activity_log` store, then surfaced as **Settings → Timeline** — not a dry audit list, but
a safety net (Undo / Recently Deleted), a habit-builder (tracking streaks), a delight surface (Chip-narrated
Money Story, Weekly Wrapped), and living proof of the privacy promise.

## User-facing capabilities

- **Undo** after any delete — a toast with "Undo" restores the record (single and bulk deletes, e.g. the
  Track-3 "delete 47 transactions").
- **Recently Deleted** tab — restore deleted items later from a snapshot bin.
- **Timeline** feed — every change grouped by day, with action icons and times; ₹ amounts are masked
  outside Open privacy mode.
- **Beautiful diffs** — edits show friendly before→after chips (values shown only in Open mode).
- **Per-item history** — the expense edit form shows that record's own change story.
- **Tracking streak + heatmap** — a GitHub-style activity grid with current/longest streak.
- **Privacy receipt** — "N changes today, all stayed on your device."
- **On this day** — memories from the same calendar day in a past year.
- **Money Story** — Chip narrates your day in plain language.
- **Weekly Wrapped** — a full-screen, tap-through recap (Story/Instagram-style) with **share-as-image**, emphasised on Sundays; generated entirely on-device.
- **Milestone moments** — a celebratory Story banner + confetti when you hit a milestone (e.g. 100 transactions, 30 days tracked), fired once per milestone.
- **Search + filters** — search the feed and filter by action (Added / Edited / Deleted / Moved).
- **Restore points** — set a checkpoint, then "undo deletions since" it.

> Note: undo/restore is a convenience, not a guarantee — a full data reset (Settings → Security) still
> erases everything, including the activity log.

## How it works

`activity_log` is an encrypted Dexie store (v4, id-only index), pruned to the newest ~500 entries. Logging
happens at the **hook/intent layer**, never in the generic repository (which would also capture seeding,
migrations, and price-cache writes).

- **`src/core/db/activityLog.ts`** — `logActivity(input)` (fills id/timestamp, fire-and-forget, returns the
  id for Undo wiring, prunes), `restoreActivity(logId)` (re-inserts a snapshot via the entity registry,
  marks `restored`), `restoreDeletionsSince(ts)`, `summarizeDiff(before, after, fields)`.
- **`src/core/db/entityRegistry.ts`** — maps `entityType → repo.put` so restore works generically.
- **`src/hooks/useLoggedRepository.ts`** — drop-in `useRepository` replacement: logs CREATE/UPDATE on save,
  DELETE on remove, and fires an Undo toast (restore + reload). Single-entity modules (accounts, goals,
  holdings, loans, insurance, budgets, subscriptions, IOU) adopt it by swapping one call + a `summarize` fn.
- **Expenses/categories** wire `logActivity` directly in `useExpenses` (compound + Track-3 bulk), as does
  CSV import (`useImport`) and profile edits.
- **`src/context/ToastContext.tsx`** — global Undo snackbar (`useToast().showToast`).
- **`src/core/activity/narrate.ts`** — pure, local Chip-voice narration (`narrateDay`, `weeklyWrapped`). No
  AI / network; real Chip AI is Phase 2.

Excluded from logging (system/side-effect/noise): hashtags, category seeding/migration, demo seeding,
price_cache, ai_call_log, chip_insights.

Key files:

- `src/features/activity/TimelinePage.tsx` — Story / Timeline / Recently deleted tabs
- `src/features/activity/useActivityLog.ts` — feed, day grouping, restore bin
- `src/features/activity/components/` — ActivityRow, DiffChips, ItemHistory, TrackingHeatmap,
  PrivacyReceipt, OnThisDay, MoneyStory, MilestoneBanner, Confetti, WrappedModal
- `src/core/db/activityLog.ts`, `entityRegistry.ts` · `src/hooks/useLoggedRepository.ts` ·
  `src/core/activity/narrate.ts` (narrateDay + weeklyStats), `src/core/activity/milestones.ts` ·
  `src/lib/maskAmounts.ts`

## Current limitations

- No whole-app "view as of date" rewind; per-item history covers the per-record story. Restore points
  cover deletions-since, not automatic revert of edits.
- UPDATE diffs are shallow (changed top-level fields only); id-valued fields show the field name, not a
  resolved name.
- The log is pruned to ~500 entries; older activity is dropped.
- Logging is best-effort/fire-and-forget — a failed log never blocks or surfaces an error.

## Planned improvements (Timeline v2+ backlog)

Track 4 is complete; these are candidate follow-ups, not yet built.

**Highest value (reuses existing data):**
- **Revert an edit** — UPDATE entries already store a before/after `diff`; add a "revert" that restores the
  prior field values. Completes the undo story (today only deletes are undoable).
- **Tappable heatmap → jump to day** — make Story heatmap cells interactive: tap → land on that day in the
  Timeline feed.
- **Filter by module + date range** — extend the current action filters (Added/Edited/Deleted/Moved) with
  entity-type and date-range filters.

**Smaller polish:**
- **Bulk restore** ("Restore all") in Recently Deleted.
- **Per-item history everywhere** — currently only on the expense editor; add to account/goal/holding edit
  screens (`ItemHistory` is already reusable).
- **Include the Timeline in the encrypted export**; a "year in review" later.

**Phase 1.5 / Phase 2 (by design):**
- Phase 1.5: populate `actor` for the **household activity feed** (who changed what).
- Phase 2: richer Chip narration via real AI; **whole-app point-in-time rewind** (needs a periodic
  full-snapshot foundation — the current log can't reconstruct historical state for pre-existing data);
  cross-device sync indicator; push digest for Weekly Wrapped on Sundays.

## Ideas welcome

- Should the heatmap surface behavioural patterns ("you tend to log on weekends")?
- Is a "pause logging / quiet mode" privacy toggle worth offering?
