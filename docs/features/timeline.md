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
- **Undo a whole import batch, durably** (2026-08-06) — every not-yet-undone `IMPORT` entry in the plain
  **Timeline** tab (both CSV import via `useImport` and Bank Statement Import via `useBankImport`) shows
  an inline **Undo** action next to Restore's usual spot (mutually exclusive with Restore — Undo only
  ever appears for `action === 'IMPORT' && !entry.restored` rows). This is the durable fallback for
  the immediate post-import Undo button on the wizard's own Done screen (`DoneStep.tsx`): once that
  screen is dismissed, the Timeline is the only remaining way to reverse an import — there was
  previously no way to undo an 800-transaction bank import once its Done screen closed. Tapping Undo
  opens a confirmation dialog naming the transaction count (a destructive bulk delete, reachable well
  after the fact, unlike the immediate Done-screen button) before calling `undoImportBatch()` and
  refreshing any already-loaded transaction/balance state.
- **Undoing an import writes its own dated entry — and is itself restorable** (2026-08-06 v2, per
  explicit user feedback on the above: a Timeline that only edits its own history in place stops
  reading as a timeline, and a delete that behaves differently from every other delete in the app is an
  inconsistency, not a design choice). `undoImportBatch()` no longer just flips `restored: true` on the
  original `IMPORT` entry with no visible trace of *when* the undo happened. It now: (a) snapshots the
  full expense records (not just their ids) before deleting them; (b) logs a brand-new, dated
  `UNDO_IMPORT` entry carrying that snapshot, e.g. "Undid import: removed 800 transactions" — appearing
  today, where the action actually happened, not back at the original import's date; (c) still marks the
  original `IMPORT` entry `restored: true` (so its own Undo button correctly disappears), but links the
  two via a new `relatedLogId` field on each. Because `UNDO_IMPORT` now carries a real snapshot, it's a
  normal citizen of the **existing** Recently Deleted / restore machinery — it shows up there and in the
  Timeline's "Deleted" filter alongside `DELETE`/`BULK_DELETE`, with no new restore code path invented.
  Restoring an `UNDO_IMPORT` entry (`restoreUndoneImport()`) brings the transactions back AND flips the
  original `IMPORT` entry's `restored` back to `false` (via `relatedLogId`), so its Undo button
  reappears and the whole batch can be undone→restored→undone again with no dead end.
- **Timeline** feed — every change grouped by day, with action icons and times; ₹ amounts are masked in
  Privacy mode only (Safe and Open both show them — the log mixes entries from every module without a
  live category/account reference to resolve per-item Safe Mode sensitivity, so it's treated as an
  aggregate view; see `docs/ARCHITECTURE.md` → Context providers).
- **Beautiful diffs** — edits show friendly before→after chips (hidden in Privacy mode only).
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
  id for Undo wiring, prunes), `logActivityAwaited(input)` (same, but awaits the write — used wherever a
  caller may need the entry to definitely exist right after, e.g. import's own immediate Undo button and
  now the Timeline's durable one), `restoreActivity(logId)` (re-inserts a snapshot via the entity registry,
  marks `restored`), `restoreDeletionsSince(ts)`, `summarizeDiff(before, after, fields)`.
- **`src/core/import/importWriter.ts`** — `writeImportBatch()` (writes a batch, logs it via
  `logActivityAwaited` with the created expense ids as the snapshot) and `undoImportBatch(logId)` (deletes
  every expense id in the `IMPORT` entry's snapshot, marks that entry `restored`, and — 2026-08-06 v2 —
  logs a NEW `UNDO_IMPORT` entry carrying the full deleted records as its own snapshot, linked back to the
  original via `relatedLogId` on both). `restoreUndoneImport(undoLogId)` is the reverse: calls the generic
  `restoreActivity()` on the `UNDO_IMPORT` entry (re-inserting its snapshot, same as any other restore),
  then flips the original `IMPORT` entry's `restored` back to `false` via `relatedLogId`. Used by both
  `useImport.ts`'s immediate post-import Undo and the Timeline's durable Undo/restore
  (`useActivityLog.ts`'s `undo()`/`restore()`).
- **`src/core/db/entityRegistry.ts`** — maps `entityType → repo.put` so restore works generically.
- **`src/hooks/useLoggedRepository.ts`** — drop-in `useRepository` replacement: logs CREATE/UPDATE on save,
  DELETE on remove, and fires an Undo toast (restore + reload). Single-entity modules (accounts, goals,
  holdings, loans, insurance, budgets, subscriptions, IOU) adopt it by swapping one call + a `summarize` fn.
- **Expenses/categories** wire `logActivity` directly in `useExpenses` (compound + Track-3 bulk), as does
  CSV import (`useImport`), Bank Statement Import (`useBankImport`, switched to the awaited
  `logActivityAwaited` 2026-08-06 so its entry is reliably present for the Timeline's Undo), and profile
  edits.
- **`src/context/ToastContext.tsx`** — global Undo snackbar (`useToast().showToast`).
- **`src/core/activity/narrate.ts`** — pure, local Chip-voice narration (`narrateDay`, `weeklyWrapped`). No
  AI / network; real Chip AI is Phase 2.

Excluded from logging (system/side-effect/noise): hashtags, category seeding/migration, demo seeding,
price_cache, ai_call_log, chip_insights.

Key files:

- `src/features/activity/TimelinePage.tsx` — Story / Timeline / Recently deleted tabs; owns the Undo
  confirmation dialog (`ConfirmDialog`) for import-batch Undo in the Timeline tab
- `src/features/activity/useActivityLog.ts` — feed, day grouping, restore bin (now includes
  not-yet-restored `UNDO_IMPORT` entries alongside `DELETE`/`BULK_DELETE`), `restore(id, entry?)` (routes
  to `restoreUndoneImport()` for an `UNDO_IMPORT` entry, plain `restoreActivity()` otherwise) /`undo()`
- `src/features/activity/components/` — ActivityRow (`onRestore`/`restoring` and `onUndo`/`undoing`,
  mutually exclusive per-row), DiffChips, ItemHistory, TrackingHeatmap, PrivacyReceipt, OnThisDay,
  MoneyStory, MilestoneBanner, Confetti, WrappedModal
- `src/core/db/activityLog.ts`, `entityRegistry.ts` · `src/core/import/importWriter.ts`
  (`writeImportBatch`/`undoImportBatch`/`restoreUndoneImport`) · `src/hooks/useLoggedRepository.ts` ·
  `src/core/activity/narrate.ts` (narrateDay + weeklyStats), `src/core/activity/milestones.ts` ·
  `src/lib/maskAmounts.ts`

## Current limitations

- No whole-app "view as of date" rewind; per-item history covers the per-record story. Restore points
  cover deletions-since, not automatic revert of edits.
- UPDATE diffs are shallow (changed top-level fields only); id-valued fields show the field name, not a
  resolved name.
- The log is pruned to ~500 entries; older activity is dropped.
- Logging is best-effort/fire-and-forget — a failed log never blocks or surfaces an error.
- Restore points' "Undo since" (`restoreDeletionsSince`) deliberately skips `UNDO_IMPORT` entries — that
  restore needs the extra `relatedLogId` flip-back only `restoreUndoneImport()` does; an `UNDO_IMPORT`
  entry since a checkpoint can still be restored individually from Recently Deleted.

## Planned improvements (Timeline v2+ backlog)

Track 4 is complete; these are candidate follow-ups, not yet built.

**Highest value (reuses existing data):**

- **Revert an edit** — UPDATE entries already store a before/after `diff`; add a "revert" that restores the
  prior field values. Completes the undo story (today only deletes and whole import batches are
  undoable — see the durable import Undo above).
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
