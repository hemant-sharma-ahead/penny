# Bank Reconciliation Ledger — plan

Status as of 2026-08-10: **Phase 1 (read-only) built and iterated once on real on-device
feedback** — `core/bank-import/ledger.ts` (`buildLedgerRows`), `FullLedgerPage.tsx`,
wired into `CheckpointTimelinePage.tsx`'s all-clear state via "View full ledger ›".
Verified: tsc/eslint/prettier clean, 11 new unit tests (889/889 core suite passing).

**Two fixes from the first round of on-device testing:**
1. A back-dated transaction recorded from another screen never appeared in an
   already-open Full Ledger. Root cause: `useRepository` only fetches once on mount, and
   `expensesRepo`'s canonical single-expense save path (`useExpenses.ts`'s
   `saveExpenseWithHashtags`) wasn't broadcasting the existing `notifyTxnChanged` signal
   every OTHER mutation in that file already does — a plain missing call, not a new
   mechanism needed. Fixed at the source (added the missing call) plus subscribed both
   `FullLedgerPage.tsx` and `CheckpointTimelinePage.tsx` (identical latent gap) via the
   existing `useTxnRefresh`. (Caught mid-fix: almost built a brand-new, duplicate
   `notifyExpensesChanged`/`useExpensesRefresh` pair before finding `useTxnRefresh`
   already existed for exactly this — reverted that before it shipped.)
2. The discrete ‹/› window-swap felt disjointed on-device — paging replaced the entire
   visible set rather than extending it. Redesigned as a continuously-growing list: a
   "Load earlier transactions" action (matching the mockup's own original button, which
   the first implementation had incorrectly dropped in favor of the ‹/› pair) extends
   `loadedStart` further back, appending ABOVE the current rows since the ledger is in
   ascending statement order (oldest first) — placed above the table, not below, so new
   content appears where reading order actually expects it. No forward paging exists
   anymore; `windowEnd` stays fixed at "now" as of when the screen opened.

**Phase 2 (relink/unmatch/resolve, built 2026-08-10) — not yet manually verified on-device.**
`core/bank-import/ledgerActions.ts` (`unmatchLedgerRow`, `relinkLedgerRow`,
`resolveSkippedRowToExisting`, `buildResolvedImportRecord`) + `FullLedgerPage.tsx` gained a
tap-to-open action menu on `'matched'`/`'skipped-unresolved'` rows. Mockup:
`docs/mockups/proposals/bank-reconciliation-ledger-phase2-v1.html` — approved, except its
own bottom-sheet chrome was corrected to a centered `Modal` during implementation
(`docs/DESIGN_GUIDELINES.md`'s non-negotiable "centered modals, never bottom sheets" rule;
only the mockup's options/content carried over, not its visual shell). Both open design
questions from the Phasing section below resolved during implementation, not left open:
- **Unmatch never loses data** — converts the matched row back into an ordinary
  `skippedRows` entry on its ORIGINAL batch (direction derived from the linked expense's
  own sign via `delta()`, not guessed from the record's `type`) rather than deleting the
  statement's own facts. The row reappears with the same resolve action available on it.
- **A resolved skipped row reuses its own original `batchId`** for the new
  `BankStatementImportRecord` it creates — no synthetic "manual resolution" marker or new
  `origin` field needed, resolving the plan's own open question more simply than
  anticipated.
- **`PossibleMatchPickerModal.tsx` moved** from `features/bank-import/` to
  `apps/mobile/src/components/shared/` — Phase 2's relink/resolve actions needed the exact
  same picker, and a feature module may not import from another feature module. See
  `docs/ARCHITECTURE.md`'s dated entry for the full rationale.
- **`'anomaly'`/`'not-covered'` rows never needed their own fix action** — resolving a
  `'skipped-unresolved'` row via "Pick the matching transaction" and choosing the
  anomaly's own expense links them correctly and the anomaly row disappears on its own.
- **Known, accepted simplification**: "Add as a new transaction" doesn't route through
  `useExpenses.ts`'s `saveExpenseWithHashtags` (off-limits — a `features/expenses/`-scoped
  hook), so it skips hashtag usage-count tracking and merchant-memory learning. It DOES
  call `logActivity()` directly (all four Phase 2 mutations do), so the activity feed
  stays complete regardless.

**Duplicate-skipped-row bug + real fix (2026-08-11, first round of on-device testing on
Phase 2).** Repeatedly matching then unmatching the SAME statement line appended a fresh
`skippedRows` entry every time — 1, then 2, then 3 identical "skipped" rows in the ledger
for what was really one line (all disappearing together the next time any one of them got
matched, since resolution matched by value, not by which array entry). First attempt
(dedup by value — narration + date + amount) was itself wrong: two GENUINELY SEPARATE
transactions can legitimately share identical narration/date/amount (e.g. two same-day,
same-merchant purchases), and that fix would have silently hidden the second one. **Real
fix, per the user's own proposed design**: persist the statement file's own 1-based line
number end-to-end. `ParsedStatementRow.rowIndex` already existed (previously only used for
the rejected-rows report) — now also written to `BankStatementImportRecord.sourceRowIndex`
(every record, both live-matched-at-commit and later resolved/relinked) and
`ImportBatchSummary.skippedRows[].rowIndex`. Two matching mechanisms now coexist,
deliberately:
- **Same batch, `rowIndex` known on both sides** — precise, exact-row match only. Two
  same-batch entries that look identical but have different `rowIndex` never value-match
  each other, in either direction (`isSkippedRowResolved`'s resolution check, or
  `unmatchLedgerRow`'s idempotency check).
- **Different batch, or `rowIndex` missing on either side (legacy)** — value-based, exactly
  as originally designed; a different import's own row numbering starts over from 1 with no
  relationship to another batch's, so there's nothing precise to compare there regardless.
- The render-time dedup safety net (`seenLegacyFingerprints`) now applies ONLY to entries
  with no `rowIndex` at all — anything `rowIndex`-tracked is trusted individually and never
  deduped against a sibling, since two such entries are already guaranteed to be genuinely
  distinct by construction.

Phase 2 is what's built now — this plan's own "Phasing" section below is the source of
truth for what's built vs. deferred; don't assume anything past Phase 2 exists without checking the
code. This was the "interactive bank-vs-recorded reconciliation console" idea
originally sketched and deliberately parked in `docs/mockups/proposals/bank-balance-sync-v3.html`
(§"A bigger, separate idea") — picked back up now that the checkpoint/anchor system
(`docs/plans/bank-balance-sync.md`) and its reconciliation table are shipped, verified,
and reachable even in the all-good state. This plan is scoped narrowly to the ledger
itself; it does not reopen or change anything already shipped in `bank-balance-sync.md`.

## The problem this solves (user's own manual workflow, as told)

The user's actual monthly/quarterly process today, done by hand: export the app's
expenses CSV and the bank's own statement(s) (sometimes multiple banks), sit down, and
match them line by line. That catches four kinds of issues no balance check alone ever
can:

1. A statement transaction with no recorded counterpart in the app.
2. A recorded transaction whose date drifted from the statement's own date (common with
   manual entry).
3. A recorded transaction that's in a different order than the statement.
4. A recorded transaction that was never in the statement at all (wrongly added, or
   belongs to a different account).

Plus one recurring annoyance: a cash withdrawal is an `expense` in the raw statement's
own language but is really a `transfer` between the user's own accounts in Penny's
model — today fixed by hand, tediously, each time.

Penny's existing checkpoint/anchor system (balance-diff only) and the live 4-bucket
import-review screens (session-scoped, gone once you move on) each solve *part* of
this, but neither gives a durable, row-by-row, after-the-fact view — which is exactly
what manual CSV-diffing was standing in for. This plan is that view.

## Relationship to what's already shipped — additive, not a replacement

- `CheckpointTimelinePage` (the balance-diff reconciliation table, `bank-balance-sync.md`
  §7 Stage 4) stays exactly as it is today — the fast, lightweight, checkpoint-only,
  "are we verified" view. Nothing about it changes.
- The 4-bucket live import-review screens (`MatchedBucket`/`PossibleBucket`/
  `UnmatchedBucket`/`LoneWolfBucket`) stay exactly as they are — the in-session,
  one-shot triage UI for a single import.
- Import History (`BankImportHistoryPage`) stays as the per-batch audit trail.
- **New**: one additional view, reached from `CheckpointTimelinePage` via a "View full
  ledger" action — a dense, row-by-row, Statement ⟷ Expense reconciliation for a
  chosen date window. This is a *second zoom level* of the same feature family, not a
  fourth competing screen. Decided explicitly to avoid duplicating capability that
  already exists (`CheckpointTimelinePage` for the fast case, the 4-bucket screens for
  live triage).

## Row model (decided)

One row per statement-order transaction, in a chosen account's ledger, split into a
Statement side and an Expense side:

| Statement side | Expense side | Meaning |
|---|---|---|
| filled | filled | Matched — the common case |
| filled | **blank** | Statement row never became a recorded expense — see "Skipped rows" below |
| **blank** | filled, date inside a covered range | Genuine anomaly — an expense inside a period the account's own import history claims is fully covered, but has no statement link. Reuses `findStandingCoverageGaps()` directly — this function already computes exactly this, today, for the account badge; no new logic needed. |
| **blank** | filled, date outside any covered range | Not an anomaly — "statement not imported for this period yet." Same `coveredStatementRanges` union, inverted. |

Live balance diff per row reuses `computeCheckpointDiagnostics`'s math, extended to
render for every row (today it only renders checkpoint-carrying rows).

**Transfers**: a cross-account transfer legitimately appears once in each of its two
accounts' own ledgers. The row must read clearly as "→ Transfer to `<other account>`"
so it's never mistaken for a lone anomaly on either side.

**Ordering**: date order, with a stable tiebreaker (creation order) for same-day
entries. **No drag-to-reorder in v1** — `reconciledSeq` today only disambiguates
same-day order for checkpoint-carrying days, and extending it ledger-wide is real new
work for a case the user themselves called rare. Revisit only if real use shows it's
actually needed.

**Scope gate**: bank accounts only (`CHECKPOINT_ELIGIBLE`) — same gate as today's
verification badge. Credit cards and cash accounts have no statement to reconcile
against.

**Windowing (decided)**: recent-first, bounded by default (e.g. since the last verified
checkpoint, or a recent window), with a way to page further back — not the full account
history unbounded. Realistic use is a periodic sit-down over a recent period, not a
permanently-open view over years of history; bounding it up front avoids a real
performance problem (this view is dense — every transaction, not just checkpoints —
unlike `CheckpointTimelinePage`, which is sparse).

## Skipped rows — the "read-only, never re-actionable" reversal

**Current behavior** (`ImportBatchSummary.skippedRows`, §11a): whatever's left in the
Possible/Unmatched buckets at commit time is saved as a bare `{rawNarration, date,
amount}` snapshot, shown only in Import History's "Excluded rows" list. Its own doc
comment is explicit: *"a read-only historical record, never re-parsed/re-actionable."*
That was a deliberate, narrower design — the original ask was "don't be silent about
what got skipped," not "let me act on it forever." Today the only way to actually
resolve a skipped row is to re-import the whole file and resolve it properly the second
time — which never updates the *original* batch's own `skippedRows` snapshot (it stays
permanently "skipped" even once a later import catches the same row).

**Decision**: reverse this — skipped rows become visible and, in Phase 2, actionable
directly from the ledger. Two things make this safe rather than a rewrite:

1. **No schema change needed to detect "already resolved."** `normalizeNarration()` (the
   exact pure function that produces a `BankStatementImportRecord.normalizedKey`) can be
   applied to a stored `skippedRows` entry *at ledger-render time* and compared against
   every `BankStatementImportRecord` the account has (date/amount/normalized-narration).
   If a later import already caught it, the ledger shows the real match live — the old
   batch's own snapshot stays historically accurate ("skipped at the time of that
   import") without needing to be touched. Same "always derive, never trust a frozen
   value" pattern already used for `computeAccountVerificationStatus`/coverage gaps.
2. **No new matching logic needed for the resolver itself.** `PossibleMatchPickerModal`
   already operates on any `ParsedStatementRow`-shaped object + a candidate `Expense[]`
   pool — a skipped-row snapshot has everything needed to reconstruct one. Picking a
   match reuses `reconcileMatchedExpense`/`attachCheckpoint` verbatim. "No match — add as
   new" reuses `ExpenseForm`'s existing `statementPreset` path verbatim. The new code is
   thin glue (a standalone orchestrator outside the live `useBankImport` session state,
   plus an "already-linked" exclusion query over the account's import records) — not new
   matching logic.
3. **No double-import risk.** If a row is resolved from the ledger and the same statement
   is *also* later re-imported out of habit, the matcher treats the ledger-resolved
   expense exactly like any other recorded expense (the matcher's candidate pool doesn't
   care how an expense was created) — it matches normally, no special-casing required.

## Phasing (decided)

**Phase 1 — read-only ledger.**
- The row model above, rendered for a windowed date range.
- Skipped-row detection via live `normalizeNarration()` dedup (no schema change).
- Blank-expense-side classification via `findStandingCoverageGaps()` reuse (no new
  logic).
- A skipped, still-unresolved row shows: *"Skipped during import. Reimport the statement
  to resolve this."*
- **New, needed regardless of phase**: a persistent dismiss action ("I've looked at
  this, it's not mine, stop flagging it") — today, leaving a row unresolved silently
  means "no"; a permanent ledger view showing it forever needs an explicit
  acknowledgement, or it nags indefinitely. Mirrors the existing
  `Account.dismissedVerificationFindings` pattern. **Open question**: skipped rows have
  no stable ID today (no `normalizedKey` even persisted on the snapshot) — dismissal
  needs its own keying scheme, to be resolved before Phase 1 mockup/schema work, not
  deferred to Phase 2.
- Ship and verify this fully, on-device, before starting Phase 2 — deliberately not
  stacking a brand-new mutation path on top of an unverified new view in one go, given
  how many subtle bugs this exact machinery has already produced this session.

**Phase 2 — actionable resolution. Built 2026-08-10, not yet manually verified on-device.**
- Relink/unmatch for a wrong match — built on the Full Ledger only (not
  `CheckpointTimelinePage`'s own sparse table, which stays action-light), reusing
  `PossibleMatchPickerModal`, `reconcileMatchedExpense`, per the design already discussed
  for the Timeline drill-down.
- Actionable resolution for a still-skipped row — pick a match or add-as-new, per the
  reuse plan above. Both built.
- The `batchId` open question resolved simply: reuse the row's own ORIGINAL `batchId`,
  no synthetic marker or new field needed (see the status line at the top of this doc).

**Phase 3 — not committed.** Drag-to-reorder for same-day sequencing, only if real
on-device use after Phase 1/2 shows it's actually needed.

## Known, accepted limitations carried forward unchanged

- **Two-errors-cancel-out** (a missing credit + a missing debit of the same amount) is
  still fundamentally invisible to any of this — nothing in any phase changes that; nothing
  we discussed does. This has been an explicit, permanent, accepted limitation since
  `bank-balance-sync.md` §10c/§8, restated here for completeness, not reopened.
- No batch-deletion/retraction mechanism exists — a wrong *whole file* import (wrong
  account/bank) has no way to be undone as a unit; corrective re-imports fix individual
  transactions' date/amount/balance going forward, not retract a batch's footprint
  entirely.
- Credit cards and cash accounts stay out of scope for this whole mechanism, same as the
  checkpoint system itself.

## What needs a mockup (per the mockup-first rule)

Before any `apps/mobile` code — **all four items done**:
1. ~~The ledger row itself — Statement/Expense side-by-side, the three blank-side variants
   (matched / statement-only-unresolved / expense-only-anomaly / expense-only-not-yet-
   covered), live diff, transfer-leg labeling.~~ Approved 2026-08-10
   (`docs/mockups/proposals/bank-reconciliation-ledger-v1.html`). Built without the
   live-diff column (Phase 1's `LedgerRow.diff` is always `undefined` — see `ledger.ts`'s
   own doc comment on why; the meta column shows Penny's own running balance instead).
2. ~~The windowing/paging UI.~~ Shipped as a discrete ‹/› pair first, then redesigned
   on-device feedback into a continuously-growing "Load earlier transactions" list (see
   this doc's own status-line fixes list) — 60-day chunks, pinned to "now" as of when the
   screen opened, no forward paging.
3. ~~The dismiss action's UI.~~ Originally a standalone inline "Dismiss, not mine" text
   action; folded into Phase 2's unified row-tap action menu as one of three options once
   that existed, rather than leaving two separate ways to act on the same row.
4. ~~The relink/unmatch/resolve action affordances.~~ Approved 2026-08-10
   (`docs/mockups/proposals/bank-reconciliation-ledger-phase2-v1.html`), with one
   correction during implementation — the mockup's bottom-sheet chrome was replaced with a
   centered `Modal` (`docs/DESIGN_GUIDELINES.md`'s non-negotiable rule), only its
   options/content carried over.

Grounded in the real current `CheckpointTimelinePage.tsx` (Opening Balance card, color
legend, Date/Txn/Balance/Diff header) — the new view should feel like a deeper zoom of
that screen, not a visually unrelated new surface. New file under
`docs/mockups/proposals/` (never edit an existing mockup without asking); render an
accurate "current" frame alongside proposed options, per this project's own mockup
convention.

### Critical files
- `apps/mobile/src/features/accounts/CheckpointTimelinePage.tsx` — the screen this
  extends; entry point for "View full ledger."
- `packages/core/src/core/bank-import/checkpointDiagnostics.ts` — `computeCheckpointDiagnostics`,
  extend to cover every row, not just checkpoint-carrying ones.
- `packages/core/src/core/bank-import/coverage.ts` — `findStandingCoverageGaps`,
  `mergeCoveredRanges`, reused directly for blank-side classification.
- `packages/core/src/core/bank-import/normalization.ts` — `normalizeNarration`, reused
  live for skipped-row dedup.
- `apps/mobile/src/features/bank-import/PossibleMatchPickerModal.tsx` — reused verbatim
  for Phase 2 relink/resolve.
- `packages/core/src/core/bank-import/checkpoint.ts` — `reconcileMatchedExpense`,
  `attachCheckpoint`, reused verbatim for Phase 2.
- `packages/core/src/core/db/types/index.ts` — `ImportBatchSummary.skippedRows`,
  `BankStatementImportRecord`, `Account.dismissedVerificationFindings` (pattern to
  mirror for the new dismiss action).
- `docs/mockups/proposals/bank-balance-sync-v3.html` — where this idea was originally
  sketched and parked.
