# Real-device testing pass — fixes & feature gaps

**Status:** 🚧 In progress — Phases 1-5, 6b, and 6c (items 1-58 except item 42's perf half) ✅ done.
Phases 1-3 committed at `e801e14`; everything through Phase 6c (items 28-58) is implemented in the
working tree as of this doc update, pending its own commit. Remaining: item 42's Home perf half
(Phase 6), and Phases 7-9 (auto-refresh audit, gesture survey, new-user home experience spec) — all
still not started.

This is a living punch-list doc, not a phase/track plan in the usual `docs/plans/` sense — it
tracks a batch of real-device testing findings (bugs + feature gaps) rather than a single
architectural initiative. Kept here per the project's plan-file convention so the source list and
its status survive beyond the originating chat session. Three items (Groups redesign, new-user
home experience, CSV import flow rethink) are large enough to warrant their own follow-up plan
docs once designed — see Phase 3, Phase 5, and Phase 9 below.

## Context

The app is in real-device testing. This doc works through a running punch list from that testing
(bugs, missing features, and several open-ended product questions) without regressing anything
and without re-touching the same area of the app twice. The list grew across four batches: items
1-18, then 19-20, then 21-27 (all folded into Phases 1-3, done), then a 4th batch — items 28-43 —
found once Phases 1-3 were live on a real device, running longer with real data volume. **Item
numbers 1-27 and 28-43 are two separate sequences that never collide** (the 4th batch continues
the count rather than restarting it), but note the original list's own items 15 and 16 (new-user
home experience, Phase 9) are unrelated to this doc's items 28-43 despite the nearby numbers.

**Execution order:** overkill-feature removal first, then the quick/easy fixes, then moderate
feature work, then the genuinely big items (Groups redesign, app-wide auto-refresh audit, gesture
survey, new-user experience) last. The source list below is sorted in that pick-up order (not
original item number) and carries a **Status** column — flip it to ✅ as each item actually ships,
so this table stays the single source of truth for "what's left." Phases group items by subsystem
_within_ that ordering, so related files still only get touched once.

Ground rules for this work: no verification sweep / docs update until explicitly asked for at
commit time — each item is "fix it, done," iterated freely in between. Mockups precede any UI
change, built from existing components (no new pickers/dropdowns invented where one already
exists).

## Source list → execution order

| Order | #            | Item (paraphrased)                                                      | Phase   | Status      |
| ----- | ------------ | ----------------------------------------------------------------------- | ------- | ----------- |
| 1     | 1            | Privacy: drop Private mode + Open-mode timer (overkill removal — first) | 1       | ✅ Done     |
| 2     | 2            | Google Drive restore "undefined" error                                  | 1       | ✅ Done     |
| 3     | 4            | Restore-from-Drive button "never enables" (helper text)                 | 1       | ✅ Done     |
| 4     | 3            | "Belongs to another account" message wrong/undiscoverable               | 1       | ✅ Done     |
| 5     | 10           | Toast blocks app interactivity                                          | 1       | ✅ Done     |
| 6     | 19           | Transaction date disappears in multi-select mode                        | 1       | ✅ Done     |
| 7     | 27           | Expenses top icon bar reorder                                           | 1       | ✅ Done     |
| 8     | 25           | Analytics: reorder — Cash Flow last, Daily Routine before Set Aside     | 1       | ✅ Done     |
| 9     | 18           | Financial Health should prefill take-home from income data              | 1       | ✅ Done     |
| 10    | 20           | No bulk "remove hashtag" — only bulk-add exists                         | 1       | ✅ Done     |
| 11    | 21           | Tags must be case-insensitive; lowercase on save; migrate existing      | 2       | ✅ Done     |
| 12    | 26           | Filters popup: add tag filtering, above Category group                  | 2       | ✅ Done     |
| 13    | 7            | Duplicate person/IOU created on repeat name entry                       | 2       | ✅ Done     |
| 14    | 12           | Person-name suggestions while typing Lent/Borrowed                      | 2       | ✅ Done     |
| 15    | 8            | Delete/archive a person's IOU entry (see correction below)              | 2       | ✅ Done     |
| 16    | 11           | Bulk-add existing transactions into a person's IOU ledger               | 2       | ✅ Done     |
| 17    | 6            | Switch transaction type (expense↔income) after save                     | 2       | ✅ Done     |
| 18    | 17 (partial) | Cash-negative check in IOU forms + demo-data audit                      | 2       | ✅ Done     |
| 19    | 24           | Analytics: "Set Aside" groups don't expand like Daily Routine           | 2       | ✅ Done     |
| 20    | 22/23        | Subscriptions "seen N times" → transaction popup with count             | 2       | ✅ Done     |
| 21    | 9, 17 (rest) | Groups (multi-party) redesign — full track                              | 3       | ✅ Done |
| 22    | 29           | ExpenseForm: discard-changes confirmation on close                       | 4       | ✅ Done |
| 23    | 30           | Transactions: auto-scroll to newly-added transaction                    | 4       | ✅ Done |
| 24    | 32, 36       | Shared TextInput ref-forwarding fix (PIN keypad autofocus + PersonTypeahead keyboard flicker) | 4       | ✅ Done |
| 25    | 33           | App-wide 2-decimal-place currency formatting (now decided, see note)    | 4       | ✅ Done |
| 26    | 34           | Transactions: hardware back exits select mode                           | 4       | ✅ Done |
| 27    | 35           | Long-press-to-select latency (renderItem re-render scope)               | 4       | ✅ Done |
| 28    | 37           | Tags missing from Manage Tags/Filter despite being used (needs 1 more investigation pass) | 4 | ✅ Done |
| 29    | 38           | Category rename: "Legal Transport" → "Legal Transport & Hotels"         | 4       | ✅ Done |
| 30    | 39           | Notary Charges missing icon + audit all category icons                  | 4       | ✅ Done |
| 31    | 40           | CSV import: backport "Show N more" from DuplicatesBucket.tsx to TileRowList.tsx | 4 | ✅ Done |
| 32    | 41 (tags)    | CSV import: tag suggestions during categorization (port BulkHashtagModal's pattern) | 4 | ✅ Done |
| 33    | 42 (default) | Transactions tab: default to current month instead of All-time          | 4       | ✅ Done |
| 34    | 28           | Analytics Cash Flow card row layout — design approved (v5)              | 5       | ✅ Done |
| 35    | 44           | Real per-bank icon/logo system, app-wide (Simple Icons for 3 banks + placeholder) | 5 | ✅ Done |
| 36    | 41 (flow)    | CSV import Accounts + Categorization redesign — design approved (v5)    | 5       | ✅ Done |
| 37    | 43           | Month-filter UX — persistent scrub bar — design approved (v5)           | 5       | ✅ Done |
| 38    | 31           | About Penny screen — content sign-off needed before its own mockup      | 5       | ✅ Done     |
| 39    | 42 (perf)    | Home: dedupe redundant full-table scans/decrypts + skeleton loading      | 6       | Not started |
| —     | 45           | Manual-entry category suggestions never see CSV-imported history        | 6b      | ✅ Done |
| —     | 46           | Analytics: no Income card                                                | 6b      | ✅ Done |
| —     | 47           | Filter icon too similar to Select icon                                   | 6b      | ✅ Done |
| —     | 49           | Account list redesign — grouped by type, tap-to-reveal actions, real bank logos+colors | 6c | ✅ Done |
| —     | 50           | Real HSBC bank logo (item 44 follow-up — was missed, not actually unavailable) | 6c | ✅ Done |
| —     | 51           | Analytics: Income section mis-grouping + cross-contaminated drill-downs | 6c      | ✅ Done |
| —     | 52           | Analytics: Income + Total Spent moved above the ring graph, all views   | 6c      | ✅ Done |
| —     | 53           | Analytics Cash Flow card: numbers row not vertically centered on icon   | 6c      | ✅ Done |
| —     | 54           | Month scrub bar: auto-scroll broken on RN-Web specifically               | 6c      | ✅ Done |
| —     | 55           | Backup/export: missing `await` on `File.write()` — 6 call sites          | 6c      | ✅ Done |
| —     | 56           | Backup: `accounts` + 7 other real tables missing from `BACKUP_STORES`   | 6c      | ✅ Done |
| —     | 57           | Backup: no override for the Drive foreign-blob state                    | 6c      | ✅ Done |
| —     | 58           | CSV import: tile-list (not just row-list) render caps missing            | 6c      | ✅ Done |
| 40    | 14           | App-wide auto-refresh / stale-data audit                                | 7       | Not started |
| 41    | 5            | Mobile gesture survey                                                   | 8       | Not started |
| 42    | 15, 16       | New-user / progressive home experience — spec + mockup only             | 9       | Not started |
| —     | 13           | SMS tracking optimization                                               | Backlog | Not started |

---

## Phase 1 — Quick fixes (do first) — ✅ Complete

**1. Privacy mode → Safe/Open only** _(overkill removal)_

- `PrivacyContext.tsx`: dropped `'privacy'` from `PrivacyMode`; `PersistedPrivacyMode` collapsed to
  `'safe'` only. Removed the Open-mode countdown (`openModeExpiresAt`, the `setTimeout`/
  `formatCountdown` ticker in `PrivacyModeSwitcher.tsx`). Kept the `AppState`-background
  auto-revert-to-Safe safety net — independent safety behavior, not "the timer."
- `PrivacyModeSwitcher.tsx`: 2-item dropdown, no countdown badge, PIN + warning step for
  Safe→Open kept.
- `SettingsContext.tsx`/`SettingsPage.tsx`: removed the now-pointless default-mode picker and the
  `openModeDurationMinutes` setting infrastructure entirely (dead code without a timer).
- `SafeModeSettingsPage.tsx`: banner copy no longer references "Privacy Mode."
- Follow-up dead-code sweep also removed: `PrivacyContext.tsx`'s `setMode` wrapper (had become a
  no-op passthrough) and `loadDefaultPrivacyMode()` + its now-dead hydration `useEffect` (the
  function had already been reduced to a hardcoded `'safe'` return, making the effect a no-op).
- `packages/core`'s shared `privacyModeColors.ts` 3-mode type left untouched — `apps/web-react`
  (frozen) still legitimately uses `'privacy'`.
- Docs flagged as now-stale but **not fixed yet** (deferred to the documentation-maintenance pass
  at commit time): `docs/PRIVACY.md`, `docs/BRD.md`, `docs/ROADMAP.md`'s "Open mode timer —
  still open, not decided" line (now resolved), `docs/features/home.md`,
  `docs/features/cash-flow.md`.

**2/3/4. Backup & Restore**

- **2 — "undefined" error**: `googleDriveProvider.native.ts`'s `getAccessToken()` — wrapped the
  previously-unguarded `GoogleSignin.getTokens()` call; throws a real, readable `Error` now.
- **4 — button never enables**: added "Enter your passphrase above first" helper text under the
  Google Drive restore button in `BackupPage.tsx` when disabled.
- **3 — "belongs to another account"**: added a distinct `BackupStatus` value (`'foreign_blob'`)
  in `backupEngine.ts` with reworded copy explaining the real cause (fresh post-reinstall vault
  key vs. old Drive backup). `AutoBackupCard.tsx` shows a "Restore with my passphrase" CTA for that
  status; `BackupPage.tsx` implements it as a same-page scroll + passphrase-field autofocus.

**10. Toast blocking interactivity**

- Root cause confirmed on-device: Android Dialog-backed `Modal` windows intercept all touches
  regardless of `pointerEvents`. Fix: new `apps/mobile/src/lib/modalStack.ts` (open-modal counter);
  `ToastContext.tsx` now only wraps the toast in a real `<Modal>` when another modal is already
  open — otherwise it's a plain high-`zIndex` sibling `View` that lets taps pass through normally.

**19. Date missing in multi-select mode**

- `TransactionsTab.tsx`: hoisted the `dateLabel` header so it renders in the select-mode branch
  too, not just normal mode.

**27. Reorder Expenses top icon bar**

- `TransactionsSlice.tsx`: filter bar reordered to Budget → Month → Search → Filter → Select.

**25. Reorder Analytics sections**

- `AnalyticsTab.tsx`: `CashFlowTile` moved to the very end in all three views (Monthly/Annual/
  All-time); `DailyRoutineSection` now renders before `SetAsideSection`. Nothing else moved.

**18. Financial Health prefill**

- New `deriveRecentMonthlyIncome()` in `packages/core/src/core/health/scorer.ts` sums the most
  recently completed calendar month's `income`-type transactions, excluding the two IOU income
  categories (Borrowed Money, Collected Money — loan proceeds aren't real income). `useHealthScore.ts`
  persists the value via AsyncStorage; persisted value always wins, prefill only computed once.

**20. Bulk "remove tag"**

- `useExpenses.ts`: new `bulkRemoveHashtag` (symmetric to `bulkAddHashtag`, decrements
  `usageCount`). `BulkHashtagModal.tsx`: added an Add/Remove toggle; Remove mode only shows tags
  actually present across the current selection — no free-text entry.

Verification: `tsc -b` (both packages), scoped `eslint`, and the full `packages/core` vitest suite
(1112 tests) all pass. Full sweep (prettier, mobile-wide eslint, PII gate) still deferred to commit
time.

---

## Phase 2 — Moderate fixes (bounded, single-area, more design but not "big")

**21. Tag case normalization** _(do first in this phase — other items depend on clean tag data)_

- Manual entry, `BulkHashtagModal.tsx`, and `bulkAddHashtag` already lowercase on save. Gap: CSV/
  bank-import's `parseTags()` in `packages/core/src/core/import/importParsers.ts` doesn't
  lowercase — fix to match. Also fix Analytics' `buildHashtagSummary()` (groups by raw string
  today, no `.toLowerCase()`).
- One-time migration: iterate `hashtagsRepo`/`expensesRepo`, lowercase `Hashtag.name` and every
  `Expense.hashtags[]` entry, merge duplicates that collapse to the same lowercase form (combine
  `usageCount`). Follow the existing idempotent-repair pattern (`repairCategoryIcons()`/
  `reconcileDefaultCategories()` in `dedupeDemoCategories.ts`) — boot-time repair pass, not a
  versioned Dexie migration.

**26. Filter by tag**

- Add a "Tag" section to `FilterModal.tsx`, right after Account and before Category group. New
  `tagFilters: string[]` on `FilterState`; chips from `hashtagsRepo`, multi-select OR match.
  Reuses the existing chip-section pattern already in this modal.

**7. Duplicate person on repeat name entry** _(do before 12/11 — they depend on this fix)_

- Root cause: `getOrCreatePerson` is independently reimplemented in `useIou.ts`, `useExpenses.ts`,
  and `useBankImport.ts` (`resolvePerson`), each matching against its own stale in-memory
  `persons` copy. Consolidate into one `packages/core` function that always does a fresh
  `personsRepo.getAll()` match (mirroring `useBankImport.ts`'s already-correct pattern); point all
  three call sites at it.

**12. Person-name suggestions**

- Scope: personal IOU persons only (Groups is a separate, unreconciled data model — future item).
  `ExpenseForm.tsx`'s Lent/Borrowed panel uses a plain `TextInput` + suggestion chips off a
  possibly-stale prop. Align to the type-ahead pattern `PersonPicker.tsx` already uses in
  `EntryForm.tsx` — pills below the field as the user types, single-select, backed by item 7's fix.

**8. Delete/archive a person's IOU entry — corrected after user feedback**

- Verified: delete already exists, in more depth than first assumed. `useIou.ts`'s `removePerson`
  hard-deletes when a person has zero ledger entries, and silently auto-archives
  (`isArchived=true`, no user choice) when entries exist. `IouView.tsx`'s `purgePerson` (only
  reachable from the Archived section) hard-cascades: deletes `ledger_entries` **and their linked
  `Expense` rows**, then the `Person` — fully unguarded, no confirmation, no balance check; the
  only safety net today is an after-the-fact Undo toast.
- Real gaps against what was actually asked for:
  1. **Bug**: `purgePerson` deletes linked `Expense` rows — directly violates "transactions
     recorded should never be removed." Fix: it must delete only the `Person` + its
     `ledger_entries`; linked `Expense` rows stay (they keep their category, just lose the IOU
     person link).
  2. **Missing**: no confirmation popup exists anywhere (both paths are silent, Undo-only). Add:
     when a person with settled history (balance ~0) is removed, show a warning popup with an
     explicit **Archive** or **Delete permanently** choice, instead of today's silent auto-archive.
     Delete uses the fixed, non-cascading purge from (1).
  3. **Missing guard**: `purgePerson` has no balance check at all — an archived person with a real
     outstanding balance can be purged today with zero warning. Add a block (or at minimum a
     strong warning) preventing permanent delete while a balance is still outstanding.
  4. No-history case (never had entries) already works correctly as a direct hard delete — no
     change needed.

**11. Bulk-add existing transactions to a person's IOU ledger**

- Reuse the existing bulk-select pattern from `TransactionsSlice.tsx`. Flow: select transactions →
  pick one person (once, for the batch) → app auto-splits the selection by `type` (expense vs
  income) → for whichever direction(s) are present, ask one category choice for that direction
  (expense: Lending or Return Borrowed; income: Borrowed Money or Collected Money) → apply
  category + person + create matching `ledger_entries` (reusing `seedIouFromExpense`'s linking
  logic) per direction-group. No per-row picker.

**6. Switch transaction type after save**

- `ExpenseForm.tsx`: type `SegmentedControl` only renders on add. Enable in edit mode too, scoped
  to Expense ⟷ Income only (Transfer excluded — structurally needs two accounts). On switch, clear
  the category (type-scoped) and require a re-pick. Block the switch when the transaction has an
  IOU ledger link, is shared to a Group, or is linked to a Goal contribution.

**17 (partial) — cash-negative check in IOU forms**

- `ExpenseForm.tsx` already has a non-blocking `cashWarningBalance` check; `EntryForm.tsx`
  (lend/borrow) and `SettleUpModal.tsx` (settle-up) have no equivalent. Add the same
  `projectedBalance()`-based warning to both. Audit `seedDemoData.ts`'s simulated timeline for any
  point Cash goes negative and add a lightweight assertion so it can't silently regress.

**24. Set Aside not expanding**

- `DailyRoutineSection` and `SetAsideSection` are two differently-built components — only
  `DailyRoutineSection` has expand/collapse (lifted `expandedGroup` state) and nested categories;
  `SetAsideSection` taps straight to the transactions modal. Rebuild `SetAsideSection` to mirror
  `DailyRoutineSection`'s exact expand/collapse pattern.

**22/23. Subscriptions "seen N times" → transaction popup with count**

- `DetectedSubCard.tsx`'s "Seen N times" text isn't pressable at all — wrap in `Pressable`. No
  transaction-id list exists on the subscription object, only `merchantCategory`; on tap, filter
  `expenses` by `normalize(e.description) === candidate.merchantCategory` (reusing `detector.ts`'s
  `normalize()`) and open the existing `EntityTransactionsModal` (already used for Analytics'
  tag/category drill-down — no new modal).
- Count: put it in `subtitle` (e.g. "12 transactions") rather than fighting over the single
  `statLabel`/`statValue` slot some callers already use for something else (e.g. account balance).
  Update all current callers (Analytics' `viewGroup`/`viewCategory`/`viewTag`, plus the new
  Subscriptions caller) to pass it consistently.

Mockup: one file covering — simplified Privacy switcher (Phase 1 carry-over), edit-mode type
toggle, person-suggestion pills, the new delete/archive-person warning popup, bulk-add-to-IOU
flow, and the new Tag filter section. All reuse existing `SegmentedControl`, `ConfirmDialog`,
`Banner`, category picker, and the bulk-action-bar/chip-section patterns already in the app.

---

## Phase 3 — Groups (multi-party, Track E) redesign

One full track — these all touch `GroupDashboard.tsx` / `groupsService.ts` / `workers/groups`
membership logic and are easier to design coherently together than piecemeal.

- **Orphaned shared transactions (9)**: deleting a personal `Expense` never touches `group_events`
  even when shared. The event schema already supports `expense_delete` tombstones (folded out
  already) — no caller ever emits one. Wire `useExpenses.ts`'s delete path to emit one for every
  group the deleted transaction was shared to.
- **Remove/flag a transaction from a group (9)**: per-row action in `GroupDashboard.tsx`'s feed —
  the original recorder can delete/edit their own entry (`expense_edit`/`expense_delete`, both
  already supported by the fold engine); another member gets a lighter "flag as not needed" that
  notifies the recorder instead of unilaterally removing someone else's entry.
- **Admin-less group protection (9)**: no check today prevents the last admin/owner from leaving
  or being demoted. Add a server-side guard blocking a leave/role-change that would leave zero
  admins, unless it's the group's only remaining member (prompt them to close/delete instead).
- **Delete-when-empty for creator (9)**: only `closeGroup`/`reopenGroup` (status flip) exist today.
  Add a real delete, creator-only, allowed only when the group has zero non-deleted
  `shared_expense` events.
- **Write-off / "never coming back" marking (17)**: add a `written_off` settlement variant
  (distinct from a real repayment), both in personal IOU and Groups.
- **Personal ledger → Group promotion (17)**: no bridge exists (`GroupMember.linkedPersonId` is
  reserved/unused). Design a one-way "promote this person's ledger to a Group" action that creates
  a Group, invites that person, seeds it from ledger history, and archives (not deletes) the
  superseded personal ledger.
- **Static (non-app) members (17)**: add a lightweight "placeholder member" (name only, no
  account/invite) that participates in splits/balances but can't sync/confirm anything — closest
  precedent is the personal-IOU `Person`, reusable/extendable rather than a new entity.
- **Settled-group historical lock (17)**: once a group is fully settled/closed, lock its
  historical `group_events` from edit — build alongside the `expense_edit` feature above.
- **Per-person balance view (17)**: already implemented (`GroupDashboard.tsx`'s per-member "owes
  you"/"you owe" breakdown) — just confirm it stays visible once other Group changes land.

Mockup: one consolidated file (GroupDashboard feed row actions, delete-group flow, write-off
marking UI, promote-to-group flow, add-static-member UI) — reuse `ConfirmDialog`, `Banner`,
existing member-list rows.

---

## Phase 4 — Quick fixes, 4th batch (do first, same as Phases 1-2)

All either confirmed bugs with a clear fix, or already-decided formatting/behavior changes — no
mockup needed for anything in this phase (two items are straight ports of an already-shipped
pattern to a new location; the rest are behavior fixes).

**29. Discard-changes confirmation on closing the transaction popup**
- `ExpenseForm.tsx`: the X button, backdrop tap, and Android hardware back (`Modal.tsx`'s
  `onRequestClose`) all currently call `onClose` unconditionally — no comparison against the
  form's initial state. Add a dirty check (any field differs from its value when the form opened)
  and, if dirty, show a confirmation (reuse the existing `ConfirmDialog` — this app has no prior
  discard-confirmation pattern anywhere, so this is the first one, not a port) with **Discard**/
  **Cancel** before actually closing. Applies to all three close paths identically.

**30. Auto-scroll to a newly-added transaction**
- `TransactionsSlice.tsx`'s `handleSaveExpense` → `closeForm()` today only hides the modal, no
  scroll. `TransactionsTab.tsx` already holds a `FlashList` ref (`listRef`) and already has a
  working scroll-to-item precedent (the bank-import checkpoint-highlight flow,
  `listRef.current?.scrollToItem(...)`) — extend that same call to fire after a successful *new*
  transaction save (not edit). Confirm the list's actual sort order first so "scroll" actually
  lands on the transaction just added.

**32 + 36. Shared TextInput ref-forwarding fix (fixes two symptoms at once)**
- Root cause (confirmed, shared by both): the shared `ui/TextInput` wrapper doesn't forward a
  ref, so the app's own established fix for "autoFocus inside a native Modal doesn't reliably
  work" (`Modal`'s `onShow` prop + a ref → `.focus()`, already used by `ExpenseForm.tsx`'s
  description field) can't be applied anywhere that uses the wrapped component instead of a raw
  `RNTextInput`.
  - **32 — Open-mode PIN keypad doesn't auto-open**: `PrivacyModeSwitcher.tsx`'s PIN step uses the
    wrapped `TextInput` with `autoFocus` but the surrounding `Modal` has no `onShow` — even adding
    `onShow` wouldn't help without a ref to focus.
  - **36 — PersonTypeahead keyboard flicker + "full query not coming"**: `BulkAddToIouModal.tsx`'s
    usage of `PersonTypeahead` has the identical `autoFocus`-into-`Modal`-without-`onShow` shape.
    The "partial query" symptom is very likely a side effect of the same focus race interrupting
    typing mid-stream, not a separate filter bug — the query-filtering logic itself was checked
    and is clean (no debounce, no stale closure). `ExpenseForm.tsx`'s Lent/Borrowed usage of
    `PersonTypeahead` has no `autoFocus` so this specific race doesn't apply there, but it sits
    inside a `ScrollView` unlike the other usage — treat as a separate, unconfirmed lead, verify
    on-device separately rather than assuming it's the same bug.
- Fix: add ref-forwarding to the shared `ui/TextInput` (or an equivalent imperative-focus escape
  hatch), then apply the `onShow`+ref pattern to `PrivacyModeSwitcher.tsx`'s PIN field and
  `BulkAddToIouModal.tsx`'s `PersonTypeahead`. One architectural fix, not two one-off patches —
  this exact shape will keep recurring anywhere `autoFocus` meets a native `Modal`.

**33. App-wide 2-decimal-place currency formatting — now decided**
- Confirmed: whole-rupee rounding (`formatCurrency`, `toIndianGrouping`) is the current app-wide
  convention at 590 call sites; `formatCurrencyDecimal` exists but is used nowhere. Per explicit
  decision, this becomes the new app-wide standard everywhere, not just Transactions — change the
  single shared formatter (or swap all call sites to the decimal variant) rather than patching the
  Transactions row alone, so the whole app stays consistent.
- **Verify tight layouts still fit** with 2 extra characters (`.00`) before shipping — `CashFlowTile`
  (item 28 below) already needs `adjustsFontSizeToFit`/`minimumFontScale={0.7}` to avoid wrapping;
  check it (and any other narrow number-grid layout, e.g. `GlanceHeader`) doesn't break. Fold this
  check into item 28's mockup review rather than treating it as a separate design pass.

**34. Hardware back should exit select mode**
- `TransactionsTab.tsx`/`TransactionsSlice.tsx` have no `BackHandler` listener at all — back
  currently falls through to React Navigation's default (exiting the tab), stranding select-mode
  state. Add the same `BackHandler.addEventListener('hardwareBackPress', ...)` pattern already
  used in `ChangePinPage.tsx`/`ImportPage.tsx` — exit select mode and consume the event, don't
  navigate away, while `selectMode` is true.

**35. Long-press-to-select latency**
- The 350ms `delayLongPress` itself is already faster than RN's 500ms default — don't shorten it
  further (risks accidental selects during normal scrolling/tapping). The likely real cause:
  `TransactionsTab.tsx`'s `renderItem` lists `selectMode`/`selectedIds` in its dependency array, so
  entering select mode changes `renderItem`'s identity and forces `FlashList` to re-render every
  currently mounted/recycled row, not just the pressed one. Investigate scoping that re-render
  (e.g. read `selectMode`/`selectedIds` inside the row component via context/a stable ref instead
  of through `renderItem`'s closure) before touching the press-delay value.

**37. Tags missing from Manage Tags/Filter despite being used elsewhere — investigate further, then fix**
- Two real, confirmed-but-insufficient leads so far: (a) `saveExpenseWithHashtags` increments every
  tag's `usageCount` on every save with no comparison to the prior state (count only ever drifts
  high, doesn't explain a tag vanishing); (b) `notifyTagsChanged()` is never called from any of
  `useExpenses.ts`'s tag-mutating functions, so `ManageTagsPage.tsx` and the Expenses screen's own
  `hashtagsRepo` state can go stale relative to each other (a staleness gap, not a permanent
  disappearance). Neither fully explains the reported asymmetry (one tag invisible in Manage
  Tags/Filter, its sibling tag fine, both visible in Analytics). Leading hypothesis, not yet
  confirmed: Manage Tags/Filter read from the `Hashtag` table while Analytics reads tag strings
  directly off live `Expense.hashtags[]` — if the missing tag's `Hashtag` row was never created
  (or got removed) while the string still lives on real expenses, that would exactly produce this.
  **Trace whether every tag-adding code path actually upserts a `Hashtag` row** (including any CSV/
  bank-import path) before writing the fix — this is a real data-consistency bug, worth pinning
  down precisely rather than patching the two confirmed-but-insufficient leads and hoping.

**38. Category rename**
- `defaultCategories.ts`: `cat-legal-transport`'s `name` field, `'Legal Transport'` →
  `'Legal Transport & Hotels'`. Only other reference is prose in `docs/features/expenses.md`
  (update for consistency); the id (unaffected) is what tests actually reference.

**39. Notary Charges icon + category-icon audit**
- `cat-legal-notary`'s `icon` field is `'ti-stamp'`, which doesn't exist in the installed
  `@tabler/icons-react-native` package (only `IconRubberStamp`/`IconRubberStampOff`/
  `IconEmailStamp` do) — `Icon.tsx` silently renders nothing for any unmatched name, by design, so
  this has never surfaced as an error. Fix to a real icon name (e.g. `ti-rubber-stamp`). While in
  there: grep every `icon:` field in `defaultCategories.ts` against the actual installed icon
  exports, since the silent-failure behavior means other categories could have the same
  never-noticed gap — cheap to check now, not urgent on its own.

**40. CSV import: backport the 60-row "Show more" pattern**
- `TileRowList.tsx`'s `RENDER_CAP = 60` has no escape — rows past 60 are simply never reachable.
  `DuplicatesBucket.tsx` (same directory) already solved the identical complaint with a real "Show
  N more" button (`INITIAL_RENDER_CAP`/`LOAD_MORE_BATCH`, both 60). Port that exact pattern into
  `TileRowList.tsx` — no new design, just applying an already-shipped fix to its sibling.

**41 (tags only). CSV import: tag suggestions during categorization**
- `ImportCategorizeModal.tsx`'s tag field is a bare `TextInput` with zero suggestions — no
  `hashtags` prop even threaded in today. `BulkHashtagModal.tsx` (used elsewhere in the app) already
  has the exact wanted pattern: a "Frequent" row (top-5 by `usageCount`) plus live `startsWith`
  suggestions as the user types. Thread `hashtags` into `ImportCategorizeModal.tsx` and port that
  same pattern in — no new design, reusing what already exists.

**42 (default-month only). Transactions tab: default to current month**
- `useTransactionFilters.ts`'s `monthFilter` starts `null` ("All time") — every open of the
  Expenses tab loads, decrypts, filters, and groups the *entire* transaction history (confirmed:
  no pagination, a full `getAll()` + per-row AES-decrypt on every load). Default `monthFilter` to
  the current month instead of `null`. This is both a better default (you usually care about
  recent spend, not all-time) and a meaningful performance win at high transaction counts, cutting
  the per-load filter/group work from O(entire history) to O(one month) for the common case.

No mockup needed for this phase — 29/30/34/35/37/38/39/42 are behavior/bug fixes; 32+36 apply an
existing app pattern (`onShow`+ref) to two new places; 33 is a formatting-convention change (with
its one layout-fit check folded into item 28's mockup instead of a separate pass); 40/41(tags) port
already-shipped patterns verbatim into a new screen.

---

## Phase 5 — Mockup-gated UI/UX redesigns (4th batch) — ✅ Design approved (v5), ready to implement

Five iterations (`docs/mockups/proposals/fourth-batch-redesigns-v1.html` through `-v5.html`) to
land on the final approved design below. **31 (About Penny) is still held out pending a content
decision — see below — and gets its own, smaller mockup once that's settled; everything else in
this phase is approved and unblocked.**

**28. Analytics Cash Flow card — row layout — APPROVED**
- Final design: account icon stacked above a truncated account name in a narrow (~54px) left
  column, freeing the rest of the row for all 4 numbers (Initial/Income/Spend/Computed left) at
  real size in one row — solves "one row" via vertical stacking rather than cramming, so the
  numbers never need to shrink further than they already do. Decimals always show (item 33).

**44. Real per-bank icon/logo system — NEW, approved for real implementation, not just this card**
- No per-bank icon/logo system exists today — only 4 generic icons, one per `AccountType`. The
  user wants real per-bank logos added app-wide (every place `account.icon`/`account.color`
  render: `CashFlowTile`, `AccountsStrip.tsx`, `AccountChips.tsx` in `ExpenseForm.tsx`, and
  anywhere else), keyed off the already-existing-but-unused `Account.bankId` field.
- Sourcing (per explicit decision): check an open icon package first, fall back to official public
  sources for gaps. **Simple Icons** (CC0-licensed) covers exactly 3 of the 12 banks in
  `bankPresetLabels.ts` — HDFC Bank, ICICI Bank, Axis Bank — their real SVG paths are already
  pulled and verified in the v3+ mockups. The other 9 (SBI, IndusInd, HSBC, Bank of Baroda, Yes
  Bank, PNB, Canara, IDFC First, plus "custom") need sourcing from official public brand pages —
  **scope that as its own follow-up task**, not part of this implementation pass; ship the 3
  real logos + an honest generic-icon placeholder (not a fabricated logo) for the other 9 now.

**41 (flow). CSV import — Accounts & Categorization — APPROVED**
- Not re-litigating what `docs/plans/csv-expense-import-redesign.md` (shipped 2026-08-14) already
  decided (6-stage wizard split, in-memory-until-commit, CSV-import staying separate from
  bank-import, the bucket pattern).
- **Accounts stage**: drop "New account" as a per-row kind option entirely — add a **"+ Create
  Account"** button at the top of the stage screen instead, opening the real `AccountFormModal`
  (same modal used everywhere else); a newly-created account immediately becomes available as a
  match target. Each row keeps the real side-by-side paired-card visual (`DuplicatesBucket.tsx`
  language — CSV account on the left, matched account on the right) — the right side is a real
  dropdown/selector (bordered, chevron, showing the matched account's real logo per item 44),
  pre-filled with a smart best-guess, changeable by tapping. Below the card: explicit **Confirm**
  (left) / **Skip** (right) buttons while undecided; once confirmed, a green "✓ Confirmed" line
  **plus a subtle, low-key "Skip" text link next to it** (not a button — stays available even
  after confirming, so a confirmed row can still be skipped without reopening the dropdown).
  **Confirm is now a required explicit tap for every row, including a confident existing-account
  match** — this is a deliberate behavior change from today's app (which currently auto-readies an
  "existing" match with no confirm step; only "create new" has a confirm gate today). Apply this
  exact same paired-card shape to BOTH the Needs-Review and the already-matched Ready bucket rows
  — never a collapsed/lesser format for Ready. Keep the real `BucketCard` Needs-Review/Ready/
  Skipped count badges, unchanged.
- **Categorization — explicitly NOT redesigned**: keep today's real pattern as-is — a collapsible
  accordion tile per category (`CategoryTile.tsx`) with the existing "Categorize N selected ›"
  button opening the real `ImportCategorizeModal` (2×2 existing/create/transfer/skip grid). The
  one improvement: when the user picks "Create" inside that modal, it should open the real
  `CategoryEditorModal` (name/icon-grid/color-swatches/group) instead of today's bespoke inline
  name+group fields — that's the only change here, everything else about the tile/modal
  interaction stays exactly as it works today. (There is no real "+ Create Category" top-level
  button in the app to add here — confirmed via the mockup process, don't invent one.)

**43. Month-filter UX — persistent scrub bar — APPROVED**
- Final design: a persistent horizontal month-chip strip below the top filter bar, no visible
  scrollbar track (matches a real RN `ScrollView`'s default — `showsHorizontalScrollIndicator`
  off), scrolling all the way back to the user's actual earliest recorded transaction (no existing
  helper computes this — needs a one-time `Math.min` scan over `expensesRepo.getAll()`'s dates,
  cached). A chip shows just the month name when its year matches the real current calendar year,
  else "Mon YYYY". A pinned **"All"** chip sits outside the scrollable strip (always reachable,
  doesn't scroll away) so the classic unfiltered all-time view stays one tap away even though a
  month is now always active by default (item 42's default-to-current-month). A calendar-icon
  button at the strip's end opens the real `MonthPickerModal` for jumping further back than what's
  visible.

**31. About Penny screen — ✅ Done**
- Content signed off (no build number — none exists anywhere in `app.json`, version-only via
  `expo-constants`; mission statement reused verbatim from onboarding's `PrivacyPromiseScreen.tsx`;
  a link into Privacy Promise content; a hand-maintained "what's new" changelog per version, scope
  explicitly confirmed after initially being deferred). Mockup: `docs/mockups/proposals/
about-penny-v1.html`.
- New: `AboutPennyPage.tsx`, `whatsNew.ts` (the hand-maintained `{version, highlights}[]` array —
  update this at each release), `apps/mobile/src/lib/appVersion.ts` (shared `APP_VERSION`, factored
  out of `FeedbackPage.tsx`'s previously-local constant), `privacyPillars.ts` (mission/pillars
  factored out of `PrivacyPromiseScreen.tsx` so both screens can't drift), and a new
  `PrivacyPromisePage.tsx` — a real deviation from the original plan: the onboarding
  `PrivacyPromiseScreen` has no header/back button (built to be seen exactly once, pre-unlock), so
  linking an already-onboarded user there from Settings would strand them; this new screen is the
  same content with a proper back button instead. Routes (`AboutPenny`, `PrivacyPromise`) registered
  in `HomeStack.tsx`, not `MainNavigator.tsx` (the latter only holds `MainTabs`/`OnboardingFlow`;
  `SettingsPage.tsx`'s own comment pointing there was stale). Row added last in Settings' "Data &
  activity" card, after Discover Penny. Mobile-only — `apps/web-react` has no equivalent and is
  frozen; confirmed no parity gap (same precedent as `PennyLoader`/"Did You Know").

---

## Phase 6 — Performance: Home cold-start + redundant data loading

No mockup needed — behavior/performance-only, no new UI.

**42 (perf only). Home: dedupe redundant full-table scans + skeleton loading**
- Confirmed: `useHome`, `useHomeStats`, and `useHealthScore` each independently call
  `expensesRepo.getAll()` on every cold Home load — 3x redundant full-table AES-decrypt of the same
  transactions before anything paints. On top of that, `useHome.ts`'s `loadSummary` calls
  `computeBalance()` (an O(total transactions) `.reduce()`) once per account for `accountBalances`,
  again for `calcLiquidFunds`, and again for credit-card accounts — roughly 3×N full O(M) scans for
  N accounts and M≈10,000 transactions, instead of one grouped pass.
- Fix: share a single `expensesRepo.getAll()` result across the three Home hooks (a shared load, or
  a short-lived in-memory cache) instead of three independent calls; replace the repeated per-account
  `computeBalance()` scans with one grouped pass over the transaction list. 
- Separately: Home currently shows **nothing** (not a skeleton — the relevant sections are absent
  from the tree) while `summary`/stats are loading, which is what makes a slow load read as "blank."
  Add real skeleton states to `GlanceHeader`/`AccountsStrip`/`MoneyStatsCard`/`FinancialHealthCard`'s
  loading branches — this alone improves the *perceived* blank period independently of, and faster
  to ship than, the data-loading fix above.

---

## Phase 6b — 5th batch: found while testing Phases 4-5 on-device

**45. Manual-entry category suggestion never sees CSV-imported history — ✅ Done**
- Root cause (confirmed): two entirely separate "remembered category" systems exist.
  `ExpenseForm.tsx`'s live suggestions come from `merchantMemoryRepo` (a Dexie table, matched by
  normalized description substring, populated by a one-time backfill gated on
  `penny_merchant_memory_v2` that only ever runs once, plus an incremental update on every manual
  save). CSV import's own remembered-category logic is a totally different, AsyncStorage-backed
  mapping keyed on the CSV's *category-column label*, not the transaction description.
  `packages/core/src/core/import/importWriter.ts`'s actual commit path never touches
  `merchantMemoryRepo` at all — so CSV-imported expenses are structurally invisible to
  `ExpenseForm`'s suggestion engine, both going forward and retroactively.
- Fix: wire `importWriter.ts` (and bank-import's own commit path, if it has the same gap) to also
  call `buildMemory()`/upsert into `merchantMemoryRepo` for every committed row, matching what
  manual saves already do. Bump the backfill version flag (`penny_merchant_memory_v2` → `v3`) so
  the one-time backfill re-runs once more, retroactively indexing already-imported history too.

**46. Analytics: no Income card — ✅ Done**
- Confirmed: income has zero category-wise visibility anywhere in Analytics today —
  `buildGroupData`/`buildSetAsideData` both explicitly exclude `type !== 'expense'` before
  `classify()` ever runs, so income isn't misclassified into Set Aside, it's just silently
  dropped entirely. `CashFlowTile`'s per-account "Income" figure is raw balance-delta cash
  movement, not a category-tagged total. Add an Income card to Monthly/Annual/All-time Analytics,
  mirroring `SetAsideSection`'s exact expand/collapse pattern (no budget concept, matching
  `SetAsideSegment`'s shape) grouped over the 15 default income categories
  (`DEFAULT_INCOME_CATEGORIES`) — reusing an already-approved pattern verbatim, no new mockup
  needed. Slot it in the existing render order right after `SetAsideSection`, before
  `HashtagsSection`, in all three views. Share the same lifted `expandedGroup` state already used
  by `DailyRoutineSection`/`SetAsideSection` (safe — `income`'s intent-group key never collides
  with any expense group key).

**47. Filter icon looked too similar to the Select icon — ✅ Done**
- `TransactionsSlice.tsx`'s Filter button used `ti-adjustments-horizontal` (sliders), visually close
  to the Select button's `ti-list-check` at small size. Swapped to `ti-filter` (Tabler's real
  funnel-shaped icon, confirmed present in the installed package). Left the two other
  `ti-adjustments-horizontal` usages alone (`AccountsPage.tsx`'s "Merchant recognition settings",
  `BankImportOverridesPage.tsx`'s empty state) — genuine settings icons, unrelated to this
  confusion, not filter buttons.

**48. "Maximum call stack size exceeded" crash on a large (~9,000-row) CSV import commit — ✅ Done**
- Not specific to any import path or anything else from this batch of work — a pre-existing bug in
  the core encryption layer used by every encrypted write in the app. `packages/core/src/core/db/
repository.ts`'s `bufferToBase64()` built its output via `btoa(String.fromCharCode(...bytes))`,
  spreading the entire byte array as individual function arguments — blows the JS call stack once
  the buffer is large enough. A large import's activity-log entry (which encrypts something
  proportional to batch size) was big enough to hit it.
- Reproduced directly (a synthetic 9,000-row `writeImportBatch` call threw the identical error
  before the fix), fixed by building the base64 string in safe-sized (32KB) chunks instead of one
  spread, confirmed all existing encryption/repository tests still pass (identical output), and
  added a permanent regression test (`tests/db/repository.test.ts`, a large-payload round-trip)
  so this can't silently regress. Any sufficiently large batch write (CSV import, bank-import,
  or otherwise) could have hit this — not just this one file.

---

## Phase 6c — 6th batch: found while testing Phases 5-6b on-device (account cards, Analytics, backup/restore, CSV import)

**49. Account list redesign — ✅ Done**
- The gradient "mini card" pattern (documented in `docs/DESIGN_GUIDELINES.md`'s "Identity-colour
  gradient mini card" section) was reported as not following the theme, wasting space, and still
  not using real bank icons in several places despite item 44 shipping. 7 genuinely different
  mockup concepts explored (`docs/mockups/proposals/account-list-redesign-v1.html` through `-v3.html`,
  the last with a "✅ FINAL DIRECTION" section) before landing on: cards grouped by account type
  (Bank Accounts / Cash & Wallets / Credit Cards), a flat bordered list row (gradient dropped
  entirely — doesn't read well across light/dark), a vertical `ti-dots-vertical` kebab beside the
  balance that tap-reveals exactly 3 action icons below (Import XOR Reconcile + Edit + Delete —
  `RECONCILABLE`/`STATEMENT_IMPORTABLE` still partition all 4 account types with no overlap), and
  the real `includeInNetWorth` caption carried over unchanged. Whole-row tap still opens the
  transaction popup, unchanged. `AccountList.tsx` rewritten; `docs/DESIGN_GUIDELINES.md`'s gradient
  section is now stale (flagged for the docs pass).
- Real per-bank logos in this redesign: HDFC/ICICI/Axis/HSBC (see item 50); SBI/Kotak/IndusInd get
  their real official brand color tinting a generic fallback icon (SBI `#00B5EF`, Kotak `#ED1C24`,
  IndusInd `#98272A`) — never a fabricated logo mark.

**50. Real HSBC bank logo — ✅ Done**
- Item 44 asserted only 3 of 12 preset banks had a CC0-licensed mark available (Simple Icons) —
  wrong for HSBC specifically, which Simple Icons does carry (slug `hsbc`); never actually checked
  before that claim was written. Verified the real path/color (`#DB0011`) against two independent
  CDN mirrors and added it to `BankLogo.tsx` (now 4 of 12 presets have a real logo). Re-checked the
  remaining 8 (sbi/kotak/indusind/bob/yesbank/pnb/canara/idfcfirst) — confirmed genuinely
  unavailable under any clear license (Simple Icons doesn't carry them; the one place with real SVG
  marks, `github.com/praveenpuglia/indian-banks`, ships with no LICENSE file — not safe to
  redistribute) — sourcing real logos for those from each bank's own official brand page remains its
  own separate follow-up, unchanged from item 44's original scope note.

**51. Analytics: Income section mis-grouping + cross-contaminated drill-downs — ✅ Done**
- Root cause: `Loan EMI`/`Savings Transfer`/`Insurance Premium` are `applicableTo: 'expense'`
  categories, but some real income-type transactions carry them anyway (pre-existing data, from
  before the category picker enforced `applicableTo`). `buildIncomeData` grouped by the category's
  raw `groupKey()`, so those rows rendered under a "Financial" sub-group — the identical string
  `buildSetAsideData` uses for its own expense-side row — which both mislabeled the row and collided
  `expandedGroup` with the unrelated Set Aside row (expanding one expanded the other). Separately,
  the shared `viewGroup`/`viewCategory` drill-down callbacks had no `e.type` check at all, so "View
  all transactions in Financial" opened from *either* side could leak the *other* side's
  transactions into the popup.
- Fix: new `incomeGroupKey()` (`useExpenseAnalytics.ts`) — a category only ever gets its own row if
  it's itself `applicableTo: 'income'`; anything else folds into the fixed `'income'` bucket (still
  fully visible in `cats[]`, just never owns a top-level row/key). New `viewIncomeGroup`/
  `viewIncomeCategory` (`AnalyticsSlice.tsx`), explicitly `e.type === 'income'`-scoped and wired only
  to `IncomeSection`; `viewGroup`/`viewCategory` now explicitly require `e.type === 'expense'` too,
  closing the leak in both directions.

**52. Analytics: Income + Total Spent moved above the ring graph — ✅ Done**
- Per explicit request: in all three views (Monthly/Annual/All-time), `PulseCard` ("Total spent")
  now renders before `DailyLivingCard` (the ring), and `IncomeSection` now leads the whole view,
  ahead of even those two. Nothing else in the render order moved (Daily Routine ahead of Set Aside,
  Cash Flow at the very end, both pre-existing decisions, unchanged).

**53. Analytics Cash Flow card: numbers not centered on the account icon — ✅ Done**
- The per-account row's outer `flex-row` used `items-start`; the icon+name column is taller than
  the single-line number row, so the numbers sat above the icon's true vertical center instead of
  level with it. Changed to `items-center`.

**54. Month scrub bar: auto-scroll broken on RN-Web — ✅ Done**
- The previous fix (item 43 follow-up, `measureLayout` for a fresh same-tick read) resolved the
  original bug on-device but not on RN-Web — `measureLayout` is a native-bridge measurement call;
  react-native-web's shim for it doesn't reliably return scroll-aware coordinates the way native's
  does. Dropped `measureLayout` entirely for the plain `onLayout`-cached offset (identical on every
  platform), fixing the real underlying race (a state update landing before its own layout pass has
  run) by deferring the read two `requestAnimationFrame` ticks instead of racing it with a
  same-tick native measurement call.

**55. Backup/export: missing `await` on `File.write()` — ✅ Done**
- `expo-file-system`'s `File.write()` is async (`Promise<void>`); 6 places called it without
  `await`, immediately followed by something that reads/shares/deletes that same file — a real race
  that can hand a still-writing/truncated file to the next step. Found while investigating "can't
  restore any local backup." Fixed in: `AutoBackupCard.tsx` (manual "This device" export),
  `localBackup.native.ts` (the silent daily on-device snapshot), `exportCsv.native.ts` (both plain
  CSV and password-protected ZIP), `PlannerResults.tsx` and `RetirementCard.tsx` (XLSX export), and
  `UnparsedMessagesPage.tsx` (SMS export).

**56. Backup: `accounts` + 7 other real tables missing from `BACKUP_STORES` — ✅ Done**
- `BACKUP_STORES` (`backupManager.ts`) had silently drifted behind `schema.ts` — `accounts`,
  `activity_log`, `merchant_memory`, `transaction_templates`, `bank_cash_withdrawal_codes`,
  `sms_transactions`, `sms_account_mappings`, and `sms_excluded_senders` were never included in any
  backup. `accounts` is the severe one: every `Expense.accountId` references it, so restoring onto
  a wiped/new device brought back every transaction with zero accounts for them to belong to. All 8
  added; backward-compatible with older backup files (absent fields are just skipped on restore, as
  already handled by the existing `if (rows?.length)` guard).

**57. Backup: no override for the Drive foreign-blob state — ✅ Done**
- The `foreign_blob` banner (item 3) only ever offered "Restore with my passphrase" — no way to say
  "keep this device's current data and stop offering me that old backup." Traced in
  `backupEngine.ts`: while `foreign_blob` is active, `runNow()`'s cycle always attempts a pull
  first, which throws before a push ever gets a chance to run — so there was genuinely no path to a
  fresh push other than resolving the state via restore. New `overwriteRemoteWithLocal()`
  (`backupEngine.ts`) skips the pull entirely and force-pushes this device's current export,
  exposed through the native `SyncProvider`. New destructive, confirm-gated "Overwrite Drive with
  this device's data instead" button in `AutoBackupCard.tsx`'s banner (mockup:
  `docs/mockups/proposals/drive-foreign-blob-override-v1.html`).

**58. CSV import: tile-list render caps missing — ✅ Done**
- Item 40 capped the ROWS inside one category tile (`TileRowList.tsx`) but never capped the number
  of TILES itself — `TransactionsStage.tsx`'s `needsInputGroups`/`stagedGroups`/`skippedGroups` each
  rendered as a plain, fully-unbounded `.map()` of tiles. A CSV export that groups more granularly
  than a bank statement (many distinct source-name/category groups) could realistically exceed this.
  Added the same "Show N more" pattern to all three (cap 25, smaller than `TileRowList`'s 60 since
  each tile is a much heavier component). Also capped `CarryForwardExcluded.tsx`'s row list, which
  had no cap at all — MoneyView-specific and typically modest in practice, but a real gap against
  the project's own bulk-import render-cap rule regardless.

---

## Phase 7 — App-wide auto-refresh audit

- Current mechanism: hand-rolled pub/sub, `useTxnRefresh`/`notifyTxnChanged`
  (`packages/core/src/hooks/useTxnRefresh.ts`) — not React Query/live-query. There's precedent for
  this exact bug class already fixed once (`useExpenses.ts`'s `saveExpenseWithHashtags` was
  silently missing the broadcast until a 2026-08-10 fix).
- Audit every mutation path that writes a transaction, ledger entry, or group event — confirm it
  calls `notifyTxnChanged()` (or the Groups equivalent). `GroupDashboard.tsx` is fully decoupled
  from this bus today (own `bump()`/`useEffect` reload only) — the concrete cause of "IOU tab
  needs pull-to-refresh after categorizing elsewhere," and likely other Group/IOU staleness too.
  Wire Groups into the same bus (or a dedicated `useGroupRefresh` if warranted). Produce the
  specific list of gaps found before fixing, so nothing gets missed silently.

No mockup needed — behavior-only.

---

## Phase 8 — Mobile gesture survey (item 5)

Deliverable: a findings list for review, not a blanket implementation.

- **Swipe-to-switch-tabs**: not a drop-in — `MainTabs.tsx` uses `@react-navigation/bottom-tabs`,
  no built-in swipe support. Would need a custom pan-gesture layer or a navigator swap — biggest-
  effort item here; decide separately once the rest is seen.
- **Extend `SwipeableRow`** (only on Transactions-tab rows today) to IOU ledger rows and Group
  feed rows — small, reuses an existing component.
- **Swipe-down-to-dismiss** on modals (currently tap-outside/back-button only).
- Nothing else gesture-based exists today (`usePullToRefresh` is vertical-only; the retirement
  chart's drag-to-scrub is a single-purpose responder) — most other "mobile feel" work would be
  net-new, not extending something already there.

---

## Phase 9 — New-user / home experience (items 15, 16) — spec + mockup only

This round produces the design, not code.

- **Threshold recommendation (15)**: gate on 3 completed months of recorded expense history
  (existing `expenseMonthSpan()` helper, not calendar-time-since-signup). Below that bar, Home
  shows a progress state ("2/3 months tracked") instead of today's zero-value empty-state prompts.
  The emergency-fund _target_ (6–9 months saved) is a separate, already-correct number — don't
  conflate the two.
- **Item 16 spec**: the progressive leveling path — track expenses (+ tagging) → IOU →
  subscriptions → goals → investing → EPF → (≥3 months history) net worth/retirement/health score
  on Home. Cover what's visible at each level, which "Did You Know" nudges point to the next
  level, how bank-statement import is surfaced as the fast-start path, and whether a dedicated
  "learn about Penny" screen is needed beyond the existing Discover Penny hub.
- Output: one written spec + one consolidated mockup file, all states with in-page anchor nav.
  Implementation is a separate future plan once reviewed.

---

## Backlog (not this round)

- **Item 13, SMS tracking optimization** — flagged explicitly as "don't lose this"; logged here
  and in `docs/ROADMAP.md`'s backlog during the end-of-task doc pass, not acted on yet.

---

## Verification

No sweep until explicitly requested at commit time. When that point comes: `tsc -b` for
`packages/core`+`apps/mobile`, scoped `eslint`, `prettier --write`, full `vitest`, PII gate — not
run in between items/phases. Manual on-device verification covers UI/behavior checks; no
automated screenshot/visual verification per the project's working-style rule.
