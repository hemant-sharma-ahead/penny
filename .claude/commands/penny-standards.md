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

3. **The Master Key lives in memory only.** Never write it to IndexedDB. `keystore.ts` holds it — never extract it across module boundaries.

4. **All data written to IndexedDB must go through the encryption layer.** No raw plaintext in any encrypted store.

---

## Architecture non-negotiables

1. **Feature modules are self-contained.** `src/features/expenses/` must not import from `src/features/portfolio/`. Both may import from `src/core/`, `src/components/`, `src/context/`, `src/hooks/`, `src/lib/`.

2. **Use repositories, not raw Dexie.** All store access goes through the repository instances in `src/core/db/repositories.ts`.

3. **`mockChip.ts` for all Phase 1.** Never add a real Anthropic API call during Phase 1. The `CHIP_MODE` flag controls this.

4. **No half-implemented features.** Stub with a placeholder rather than shipping broken UI.

---

## TypeScript standards

1. **Strict mode is on.** Never use `any`, `@ts-ignore`, or non-null assertions (`!`) without a comment explaining why it's safe.

2. **`noUncheckedIndexedAccess` is on.** Always handle the case where an array index or record key returns `undefined`.

3. **`exactOptionalPropertyTypes` is on.** Omit optional properties instead of passing `undefined`.

4. **No implicit returns** in functions that return a value. Every code path must explicitly return.

---

## Component & UI standards

1. **Use shared primitives** from `src/components/ui/` (Card, Modal, Button, TextInput, etc.). Do not recreate these inline.

2. **No Tailwind classNames in feature files for primitives.** Use semantic props: `variant="primary"`, not `className="py-3 rounded-xl bg-green-600"`.

3. **Always semantic tokens.** Never use hardcoded Tailwind colours (`bg-white`, `text-slate-900`, `border-slate-100`). Use: `bg-surface`, `text-primary`, `text-secondary`, `border-theme`, `surface`, `input-surface`.

4. **No bottom sheets.** All modals appear centred between header and bottom nav. Use the `Modal` component.

5. **Z-index ladder:** bottom nav `z-50` → app header `z-40` → modals `z-60` → nested modals/confirmation `z-70`.

6. **Mobile-first Tailwind.** Default classes are for mobile (390px). Use `md:` and `lg:` for larger screens. App shell constrains to `max-w-[430px]`.

7. **Use `usePrivacy()` hook** for privacy-aware rendering. Never check the privacy mode directly in feature code — use `<MaskedValue>` or `<PrivacyAwareText>` from `src/components/privacy/`.

8. **Tabler icons only.** Use `<i className="ti ti-NAME" />` — outline variants only. Never filled icons or custom SVG paths. (Note: Pre-Phase 1.5 track 3 replaces category icons with an SVG sprite — for categories only, use the new icon system.)

---

## India-specific rules

1. **Currency:** Always use `formatCurrency()` from `src/lib/formatters.ts`. Never format ₹ amounts inline. Always `en-IN` locale.

2. **Number formatting:** Use `formatCompact()` for large numbers (lakhs/crores, not millions/billions). ₹1,00,000 = ₹1L. ₹1,00,00,000 = ₹1Cr.

3. **Financial year:** Indian FY runs April–March. FY 2026 = April 2025 to March 2026. Use `CURRENT_FY` from `src/core/ipo/ipoTypes.ts` for the current FY constant.

4. **Dates:** Use `src/lib/formatters.ts` helpers. Never use `new Date().toLocaleDateString()` directly — locale must be `en-IN`.

5. **Tax slabs:** Senior citizen = 60+, Super senior = 80+. These thresholds drive different calculations in the tax module.

---

## Pre-commit gates (all three must pass)

```bash
npm run format      # Prettier
npm run lint        # ESLint — zero errors
npm test -- --run   # Vitest — all green including PII gate
```

Never skip. Never use `--no-verify`. Fix the root cause.

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

**The RN portability test:**
- Layer 1: zero changes for RN — pure TypeScript
- Layer 2: zero changes for RN — React hooks work identically
- Layer 3: swap `Modal.tsx` → `Modal.native.tsx` — feature page itself unchanged

---

## Anti-patterns — never do these

**Anti-pattern 1: Logic in component files**
```tsx
// WRONG — calculation inside component
const totalSpend = useMemo(() =>
  expenses.reduce((sum, e) => e.type === 'expense' ? sum + e.amount : sum, 0), [expenses]);

// RIGHT — import from core
import { totalExpenseAmount } from '@/core/expenses/filterAndAggregate';
const totalSpend = useMemo(() => totalExpenseAmount(expenses), [expenses]);
```

**Anti-pattern 2: Data fetching in page components**
```tsx
// WRONG — repo call in page
const [expenses, setExpenses] = useState<Expense[]>([]);
useEffect(() => { expensesRepo.getAll().then(setExpenses); }, []);

// RIGHT — in feature hook
// useExpenses.ts exports { expenses, isLoading, createExpense, ... }
const { expenses, isLoading } = useExpenses();
```

**Anti-pattern 3: Duplicate utility functions across files**
```tsx
// WRONG — same function in 4 files
function epochToDateInput(ms: number) { return new Date(ms).toISOString().slice(0, 10); }

// RIGHT — one place
import { epochToDateInput } from '@/lib/formatters';
```

**Anti-pattern 4: Monolithic feature files**
A file over 400 lines that contains both UI and logic is a code smell. Split it.

---

## File naming conventions

- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities / clients: `camelCase.ts`
- Types: colocated in `src/core/db/types/index.ts` or feature-local `types.ts`
- Tests: `fileName.test.ts`
- Route pages: `ModulePage.tsx` (e.g. `ExpensesPage.tsx`)

---

## What Chip always shows

Every Chip insight must have all four fields populated:
1. **Reasoning** — data points behind the recommendation
2. **"What if I do nothing?"** — consequence in rupees (most important field)
3. **Module tag** — which area it relates to
4. **Confidence** — shown as a subtle indicator

Never show a Chip insight without a populated `do_nothing_consequence`.
