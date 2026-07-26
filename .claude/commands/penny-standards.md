# Penny — Code Standards & Best Practices

Invoke this at the start of any implementation task on Penny. These rules apply without exception.

---

## Privacy non-negotiables

1. **`buildUserContext()` is the only path to Anthropic.** Never call the Anthropic SDK directly from feature code. Only `src/core/ai-safety/anthropicClient.ts` may import `@anthropic-ai/sdk`.

2. **Never log user data.** `console.log` is a `no-console` ESLint warning for a reason. Any log that could contain a name, amount, account number, or merchant name is a PII leak.

3. **The CI PII gate is non-negotiable.** `tests/pii-gate/piiGate.test.ts` must always pass. Never use `eslint-disable`, `// @ts-ignore`, or test skips to work around it.

4. **Permitted outbound domains.** The app may only contact these external domains — any other fetch is a bug:
   - `api.anthropic.com` — Chip AI (anonymised payload only)
   - `api.mfapi.in` — MF NAV data (scheme codes, no user data)
   - `query.yahoofinance.com` — Stock prices (tickers, no user data)
   - `webnodejs.investorgain.com` — IPO data (no user data)
   - `npsnav.in` — NPS NAV (no user data)
   - `vahandetails.com` — Vehicle RC (no user data)
   - `api.openweathermap.org` — Market data (no user data)

5. **IOU person names never leave the device.** In AI context, use "Person 1", "Person 2". The `buildUserContext()` function handles this substitution.

6. **`raw_report_encrypted` from `credit_profile` is never sent to AI.** Contains PAN and full tradelines.

7. **DOB is never sent as-is.** Always send as 5-year age band (e.g. "29–35"). `buildUserContext()` handles this.

---

## Encryption non-negotiables

1. **Never access Dexie tables directly** from feature code. Always use `EncryptedRepository<T>` from `src/core/db/repository.ts`.

2. **Never import or call `window.crypto.subtle` directly** from feature code. Only `src/core/crypto/engine.ts` and `src/core/crypto/securityManager.ts` may do this.

3. **The Data Master Key lives in memory only, non-extractable.** Never write it to IndexedDB. `keystore.ts` holds it — never extract it across module boundaries.

4. **All data written to IndexedDB must go through the encryption layer.** No raw plaintext in any encrypted store.

5. **Envelope encryption only (Track 2).** A random DMK encrypts data; it is wrapped independently by passphrase- and PIN-derived KEKs. **Never derive the data key directly from the passphrase**, and **never re-encrypt data on a passphrase/PIN change** — only re-wrap the DMK. Changing the passphrase must require the current passphrase.

6. **DOB never leaves raw to the AI.** Use `deriveAgeBand()` (5-year band) in any AI context — never the exact date or age. Gate would-be-paid features through the `entitlement` check rather than hardcoding access.

7. **PIN policy (Track 2).** The PIN is **mandatory** — never add a way to disable it. Every PIN entry point (unlock, Open-mode re-auth, change-PIN check) must route through the shared attempt counter so they share **one** 5-attempt exponential-backoff lockout — never add a PIN check that bypasses it. Reject trivial PINs with `isWeakPin()`. PIN changes are limited to once per 24h. Show "attempts remaining" on a failed entry. The opt-in "erase after N failed attempts" wipe is off by default.

8. **Group data is ciphertext-only on the server (Track E, Model B).** Anything a group relays — the group **name**, all shared-ledger **event bodies** — must be encrypted with the per-epoch **Group Key** via `src/core/groups/keys.ts` (`encryptForGroup`) **before** it leaves the device; the worker only ever stores/returns opaque blobs (`enc_name`, R2 ciphertext, wrapped key-grants). **Never send a plaintext group name, amount, description, or member name to `workers/groups/`.** Share the Group Key only by wrapping it to a member's ECDH key (`wrapGroupKeyFor` → a grant); never put a raw Group Key or the raw invite secret in a request body (invites send only `SHA-256(secret)`). All group calls go through `groupsClient.ts` / `signedFetch(…, GROUPS_BASE)` — never `fetch` the worker directly.

---

## Architecture non-negotiables

1. **Feature modules are self-contained.** `src/features/expenses/` must not import from `src/features/portfolio/`. Both may import from `src/core/`, `src/components/`, `src/context/`, `src/hooks/`, `src/lib/`.

2. **Use repositories, not raw Dexie.** All store access goes through the repository instances in `src/core/db/repositories.ts`.

3. **`mockChip.ts` for all Phase 1.** Never add a real Anthropic API call during Phase 1. The `CHIP_MODE` flag controls this.

4. **No half-implemented features.** Stub with a placeholder rather than shipping broken UI.

5. **Log user mutations to the Timeline at the hook layer.** Use `useLoggedRepository` (or `logActivity` for compound/bulk flows) for user-initiated create/update/delete; include a `snapshot` on deletes so Undo/restore works, and register the `entityType` in `src/core/db/entityRegistry.ts`. Never log inside the generic repository, and never log system/side-effect writes (seeding, migrations, price cache, hashtags).

6. **Never duplicate a literal or pure logic across a `.native.ts`/`.web.ts` pair.** A platform-suffixed file may only contain logic that's genuinely platform-different. Any literal (URL, storage key, event name, cache TTL) — or, if the whole function is identical across variants, the function itself — that's needed identically by multiple variants belongs in an unsuffixed sibling file (`*.constants.ts` for literals, a descriptively-named file like `exportCsv.shared.ts` for shared functions), imported by every variant. This is what an IPO API URL bug taught the hard way: it was hardcoded independently in `ipoClient.ts` and `ipoClient.native.ts`, and only one got fixed the first time. See `docs/ARCHITECTURE.md`'s platform-variance-minimization decision entry and `docs/EXTERNAL_APIS.md`.

---

## TypeScript standards

1. **Strict mode is on.** Never use `any`, `@ts-ignore`, or non-null assertions (`!`) without a comment explaining why it's safe.

2. **`noUncheckedIndexedAccess` is on.** Always handle the case where an array index or record key returns `undefined`.

3. **`exactOptionalPropertyTypes` is on.** Prefer omitting an optional property over passing `undefined`. When a prop/field is _legitimately_ assigned from a possibly-undefined computed value (e.g. `currentValue: parseFloat(x) || undefined`, or a UI prop like `hint`/`error`/`bg` that may be absent), declare it `prop?: T | undefined` at the definition rather than forcing every call site into a conditional spread. Conversely, in a component's own `Props` interface, an optional prop that callers may pass explicitly-undefined must be `?: T | undefined` or `tsc -b` (TS2375) fails.

4. **No implicit returns** in functions that return a value. Every code path must explicitly return.

---

## Component & UI standards

1. **Use shared primitives** from `src/components/ui/` (Card, Modal, Button, TextInput, etc.). Do not recreate these inline. For layout repetition specifically: every feature page starts with `<PageHeader>` (never hand-roll the `px-4 pt-4 pb-3 border-b` title block); group divided list rows in `<ListContainer>`; title sections between cards/lists with `<SectionLabel>`. For hairline dividers use `divide-[var(--color-border)]` — **never `divide-theme`** (not a defined utility; it silently falls back to `currentColor`).

2. **No Tailwind classNames in feature files for primitives.** Use semantic props: `variant="primary"`, not `className="py-3 rounded-xl bg-green-600"`.

3. **Always semantic tokens.** Never use hardcoded Tailwind colours (`bg-white`, `text-slate-900`, `border-slate-100`). Use: `bg-surface`, `text-primary`, `text-secondary`, `border-theme`, `surface`, `input-surface`.

4. **No bottom sheets.** All modals appear centred between header and bottom nav. Use the `Modal` component.

5. **Z-index ladder:** bottom nav `z-50` → app header `z-40` → modals `z-60` → nested modals/confirmation `z-70`.

6. **Mobile-first Tailwind.** Default classes are for mobile (390px). Use `md:` and `lg:` for larger screens. App shell constrains to `max-w-[430px]`.

7. **Use `usePrivacy()` hook** for privacy-aware rendering. Never check the privacy mode directly in feature code — use `<MaskedValue>` or `<PrivacyAwareText>` from `src/components/privacy/`.

8. **Tabler icons only.** Use `<i className="ti ti-NAME" />` — outline variants only. Never filled icons or custom SVG paths.
9. **Never make users type an icon class.** When a user picks an icon (categories, parents, etc.), use the visual `IconGridPicker` (`src/features/expenses/categories/IconGridPicker.tsx`) — curated grid + searchable Tabler set — not a raw `ti-*` text input. The stored value is still a `ti-*` string.
10. **Category grouping goes through `groupKey`/`groupMeta`** (`src/core/expenses/categoryGroups.ts`). Don't read `cat.intentGroup` directly for display/filtering — a custom parent (`isGroup` + child `parentId`) overrides it.

---

## India-specific rules

1. **Currency:** Always use `formatCurrency()` from `src/lib/formatters.ts`. Never format ₹ amounts inline. Always `en-IN` locale.

2. **Number formatting:** Use `formatCompact()` for large numbers (lakhs/crores, not millions/billions). ₹1,00,000 = ₹1L. ₹1,00,00,000 = ₹1Cr.

3. **Financial year:** Indian FY runs April–March. FY 2026 = April 2025 to March 2026. Use `CURRENT_FY` from `src/core/ipo/ipoTypes.ts` for the current FY constant.

4. **Dates:** Use `src/lib/formatters.ts` helpers. Never use `new Date().toLocaleDateString()` directly — locale must be `en-IN`.

5. **Tax slabs:** Senior citizen = 60+, Super senior = 80+. These thresholds drive different calculations in the tax module.

---

## Pre-commit gates (all must pass)

```bash
npm run type-check  # tsc -b — REAL project type-check (see gotcha below)
npm run format      # Prettier
npm run lint        # ESLint — zero errors
npm test -- --run   # Vitest — all green including PII gate
```

Never skip. Never use `--no-verify`. Fix the root cause.

**Gotcha — `type-check` must be `tsc -b`, not `tsc --noEmit`.** This is a Vite project-references
setup: the root `tsconfig.json` has `"files": []` and only `references`, so `tsc --noEmit` against
it type-checks **nothing** (it silently passes). The app is only checked via `tsc -b` (which builds
`tsconfig.app.json` + `tsconfig.node.json`, both `noEmit`). A green `tsc --noEmit` is a false
negative — it will miss undefined references (e.g. a helper you forgot to move during an extraction),
which then crash at runtime. Always gate on `npm run type-check` (= `tsc -b`). Note Vite/esbuild
strips types without checking, so the dev server runs even with type errors — the gate is your only
safety net.

---

## Phase awareness

- **What's built:** See `docs/features/` for per-module documentation
- **What's deferred:** CAS PDF import, Watchlist, Export PDF, Chip real AI, Desktop layout, Chip chat UI — all Phase 2
- **What's planned:** Phase 1.5/2/3 architecture decisions in `docs/ROADMAP.md`
- **Don't re-implement** something that already exists — read the feature doc before starting
- **Don't re-ask architecture questions** already decided — check `docs/ROADMAP.md` first

---

## Feature architecture — the three-layer rule

Every feature module must have exactly three layers. **Never collapse them.**

```
Layer 1: src/core/{domain}/          — Pure logic. Zero JSX. Zero React. Zero browser APIs.
Layer 2: src/features/{name}/use{Name}.ts  — All state + data fetching. React hooks only.
Layer 3: src/features/{name}/{Name}Page.tsx — Thin UI. Calls hook. Calls shared components.
```

**Layer 1 — Core logic rules:**

- Must be pure TypeScript functions with no side effects
- No `useState`, no `useEffect`, no JSX, no `className`
- No browser APIs (`window`, `document`, `fetch`, `localStorage`)
- Must be independently testable without mounting a component
- If it does a calculation or data transformation → it belongs here

**Layer 2 — Feature hook rules:**

- One domain hook per feature: `useAccounts`, `useExpenses`, `useGoals`, etc.
- Complex features use multiple focused hooks — one per domain (e.g. `useExpenses`, `useSubscriptions`, `useIou`, `useBudgets` — all called from `ExpensesPage`)
- Imports from `src/core/` for calculations — never recalculates inline
- Wraps mutations in `useCallback` (stable references, no unnecessary re-renders)
- Wraps derived data in `useMemo` with accurate dependency arrays
- No JSX ever — if you're writing `return <div>`, you're in the wrong file

**Layer 2 — What belongs in the hook:**

- All `useEffect` for data loading (repo calls)
- All `useCallback` mutations (create/update/delete) — async, repo-dependent
- All `useMemo` derived values that depend on fetched data (totals, filtered lists, aggregations)
- Loading and saving flags (paired with the async work they describe)

**Layer 2 — What stays in the page (NOT the hook):**

- Form field state (`const [form, setForm] = useState(DEFAULT_FORM)`) — it's local UI state
- Modal open/close state (`showForm`, `deletingId`, `expandedId`) — UI interaction
- Which item is being edited/selected — selection is a UI concern
- `useNavigate()` — routing is not business logic
- `usePrivacy()` / `masked` — display concern
- Bridge functions that read UI state then call a hook mutation (e.g. `handleSave` reads form fields then calls `saveAccount(form, editing)`) — they need both worlds

**Layer 3 — Thin page rules:**

- Calls domain hook(s) for all data and mutations
- Manages its own UI state (forms, modals, selections) — see above
- Calls shared components (`<Card>`, `<Modal>`, `<Button>`) for all UI primitives
- Maximum 400 lines for a page, 200 lines for a form
- No calculations, no repo calls — delegate to Layer 1 and Layer 2

**Layer 3 — Feature decomposition rules (within the feature folder):**

When a page grows beyond ~400 lines, decompose it. The decomposition lives _inside the feature folder_ — these sub-components are not generic enough for `src/components/shared/`.

Split out in this order of priority:

1. **Modals** → their own files (`ExpenseExportModal.tsx`, `BudgetModal.tsx`, `FilterModal.tsx`, `EventsModal.tsx`). Each modal owns its internal state. Parent only holds the show/hide boolean and passes the minimum data the modal needs to do its job.

2. **Tab content** → their own files (`TransactionsTab.tsx`, `BudgetsTab.tsx`, `AnalyticsTab.tsx`). Each tab receives only the data it renders — it should not receive state that belongs to sibling tabs.

3. **Row components** → their own files when repeated in a list (`TransactionRow.tsx`). Any item rendered inside a `.map()` that is more than ~10 lines is a candidate.

4. **Pure helpers** → `src/lib/` (not the feature folder). Date utilities, formatters, calculators — anything with zero React belongs in `lib/` so it's importable anywhere and testable in isolation.

A well-decomposed page's `return` block should look like:

```tsx
return (
  <div>
    <PageHeader ... />
    <TabStrip ... />
    {activeTab === 'transactions' && <TransactionsTab ... />}
    {activeTab === 'analytics'    && <AnalyticsTab ... />}
    {showExport  && <ExportModal  onClose={...} expenses={expenses} />}
    {showFilter  && <FilterModal  initial={filters} onApply={...} />}
    <ExpenseForm ... />
  </div>
);
```

**Layer 3 — Vertical slices for multi-domain pages:**

When a page hosts several **independent domains** (e.g. Portfolio = 6 asset categories + IPO), do
not decompose only by modal/tab — decompose by **domain into self-contained vertical slices**. The
reference implementation is `src/features/portfolio/`:

```
features/portfolio/
  PortfolioPage.tsx        ← thin housing (~170 lines): header + top tabs → <XSection> | <IpoTab>
  holdings/
    <category>/            ← ONE folder per domain (fixed-income, retirement, equity, …)
                             owns: its view cards, <XSection>, <XModal>(s), its <XFields>,
                             its class-only hooks + helpers — everything co-located
    shared/                ← ONLY what 2+ categories use (form primitives, registry, nowMs)
  ipo/                     ← same self-contained pattern for the other top-level tab
```

Rules:

- **Each category folder is a complete slice.** Cards + section + modal(s) + field-groups + class
  hooks + class-only helpers live together. The page just routes to the active `<XSection>`.
- **`<XSection holdings mode onSave onRemove>` owns its own add/edit** modal state and "+" button —
  there is no central form or chooser. Multi-class categories show their class options inline.
- **`<XModal editing onSave onClose onDelete>` is standalone** (owns its `Modal` chrome + state).
  It composes the shared field primitives + its own `<XFields>`, and on save calls a **pure mapper**.
- **Save/validate logic is pure** and lives in `core/{domain}/` (e.g. `buildBaseHolding` +
  `applyXFields`/`isHoldingValid`), unit-tested without React. Network calls live in
  `core/{domain}/*Client.ts` — never inline in a component or hook.
- **`shared/` means ≥2 consumers.** A file used by exactly one category is NOT shared — it belongs
  in that category's folder. (Don't bulk-dump per-class fields/hooks into `shared/`.) Verify by
  grepping importers before placing a file.

**The RN portability test:**

- Layer 1: zero changes for RN — pure TypeScript
- Layer 2: zero changes for RN — React hooks work identically
- Layer 3: swap `Modal.tsx` → `Modal.native.tsx` — feature page itself unchanged

---

## Anti-patterns — never do these

**Anti-pattern 1: Logic in component files**

```tsx
// WRONG — calculation inside component
const totalSpend = useMemo(
  () => expenses.reduce((sum, e) => (e.type === 'expense' ? sum + e.amount : sum), 0),
  [expenses]
);

// RIGHT — import from core
import { totalExpenseAmount } from '@/core/expenses/filterAndAggregate';
const totalSpend = useMemo(() => totalExpenseAmount(expenses), [expenses]);
```

**Anti-pattern 2: Data fetching in page components**

```tsx
// WRONG — repo call in page
const [expenses, setExpenses] = useState<Expense[]>([]);
useEffect(() => {
  expensesRepo.getAll().then(setExpenses);
}, []);

// RIGHT — in feature hook
// useExpenses.ts exports { expenses, isLoading, createExpense, ... }
const { expenses, isLoading } = useExpenses();
```

**Anti-pattern 3: Duplicate utility functions across files**

```tsx
// WRONG — same function in 4 files
function epochToDateInput(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

// RIGHT — one place
import { epochToDateInput } from '@/lib/formatters';
```

**Anti-pattern 4: Monolithic feature files**
A file over 400 lines that contains both UI and logic is a code smell. Split it.

**Anti-pattern 5: Parent holding modal state**

```tsx
// WRONG — parent owns the modal's internal form state
const [exportRange, setExportRange] = useState('this_month');
const [exportPassword, setExportPassword] = useState('');
const [exporting, setExporting] = useState(false);
{showExportSheet && <ExportModal range={exportRange} setRange={setExportRange} ... />}

// RIGHT — modal owns its own state, parent just holds the boolean
{showExportSheet && <ExportModal expenses={expenses} onClose={() => setShowExportSheet(false)} />}
```

**Anti-pattern 6: Prop-drilling instead of direct hook consumption**

```tsx
// WRONG — parent fetches events and threads them down as props
const { events, pastEvents, addEvent, stopEvent } = useEventMode();
<EventsModal events={events} pastEvents={pastEvents} addEvent={addEvent} stopEvent={stopEvent} ... />

// RIGHT — modal calls the hook directly
// EventsModal.tsx
const { events, pastEvents, addEvent, stopEvent } = useEventMode();
// Parent just passes the minimum it uniquely owns
<EventsModal linkedCountByEventHashtag={linkedCount} onRequestEditSave={handleEditSave} onClose={...} />
```

**Anti-pattern 7: Live-threaded filter setters**

```tsx
// WRONG — 6 setter props for a buffered filter modal
<FilterModal
  typeFilter={txnTypeFilter} setTypeFilter={setTxnTypeFilter}
  accountFilters={txnAccountFilters} setAccountFilters={setTxnAccountFilters}
  // ... 4 more setter pairs
/>

// RIGHT — buffered approach: modal owns local state, applies on Done
<FilterModal initial={currentFilterState} onApply={handleApplyFilters} onClose={...} />
```

**Anti-pattern 8: A `shared/` folder that isn't actually shared**

```
// WRONG — every per-class field/hook dumped into one shared/ bucket
holdings/shared/fields/{Mf,Fd,Nps,…}Fields.tsx   ← each used by exactly ONE category
holdings/shared/hooks/useFdPreview.ts            ← used only by fixed-income

// RIGHT — co-locate single-consumer code with its consumer; shared/ = ≥2 consumers only
holdings/fixed-income/FdFields.tsx  holdings/fixed-income/useFdPreview.ts
holdings/shared/SharedHoldingFields.tsx          ← genuinely used by all categories
```

Before placing a file in `shared/`, grep its importers. One importing folder → it lives there.

---

## File naming conventions

- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities / clients: `camelCase.ts`
- Types: colocated in `src/core/db/types/index.ts` or feature-local `types.ts`
- Tests: `fileName.test.ts`
- Route pages: `ModulePage.tsx` (e.g. `ExpensesPage.tsx`)

---

## When to refactor a component

Refactor when you observe any of these signals. They are not suggestions — they indicate the code has already crossed a line.

**Signal 1: The file exceeds 400 lines of JSX/logic**
Anything over 400 lines in a page or 200 lines in a form is carrying too much. Count _only_ what's in the file — if the file is large because it duplicates logic that should be in `core/` or `lib/`, extract that first.

**Signal 2: A modal has 5+ state variables in the parent**
If `showExportSheet`, `exportRange`, `exportFrom`, `exportTo`, `exportPassword`, `exporting` all live in the _parent_, the modal is not self-contained. State that only exists while a modal is open belongs inside the modal.

**Signal 3: You are passing 4+ props that are only used inside one child**
When you find yourself writing `<Child a={a} setA={setA} b={b} setB={setB} c={c} setC={setC}`, that child should own that state instead. Pass the initial value and an `onApply` callback.

**Signal 4: The same inline HTML block appears in 3+ places**
Three or more instances of the same JSX pattern (e.g. a card with icon + label + value) means a shared component is overdue. Extract it with semantic props.

**Signal 5: A tab or section's JSX is longer than the page's own logic**
If the analytics tab content is 600 lines and the page's own state/handlers are 300 lines, the tab has become the dominant concern. Extract it into `AnalyticsTab.tsx`.

**Signal 6: A utility function is copy-pasted across 2+ files**
`epochToDateInput`, `toDateKey`, `monthLabel` — if you see these appearing in more than one place, they belong in `src/lib/`. The second copy is the signal, not the first.

**When NOT to refactor:**

- A component is 250 lines but reads clearly — leave it. Line count is a proxy, not the goal.
- You are in the middle of a feature delivery — refactor before or after, not during.
- The component is stable and has no active development — the cost of refactoring with no feature value is usually not worth it.
- You'd be extracting a component that is only ever used once and has no reuse potential — keep it inline.

---

## What Chip always shows

Every Chip insight must have all four fields populated:

1. **Reasoning** — data points behind the recommendation
2. **"What if I do nothing?"** — consequence in rupees (most important field)
3. **Module tag** — which area it relates to
4. **Confidence** — shown as a subtle indicator

Never show a Chip insight without a populated `do_nothing_consequence`.
