# Penny — Code Standards

This file is loaded by Claude Code at the start of every session. These standards must be followed at all times, no exceptions.

---

## Privacy non-negotiables

1. **`buildUserContext()` is the only path to Anthropic.** Never call the Anthropic SDK directly from feature code. Only `src/core/ai-safety/anthropicClient.ts` may import `@anthropic-ai/sdk`.

2. **Never log user data.** `console.log` is a `no-console` ESLint warning for a reason. Any log that could contain a name, amount, account number, or merchant name is a PII leak.

3. **The CI PII gate is non-negotiable.** `tests/pii-gate/piiGate.test.ts` must always pass. Never use `eslint-disable`, `// @ts-ignore`, or test skips to work around it.

4. **Three domains only.** The app may only make outbound requests to `api.anthropic.com`, `api.mfapi.in`, and `query.yahoofinance.com`. Any other fetch is a bug.

5. **Person names from `personal_ious` never leave the device.** In AI context, use "IOU 1", "IOU 2" etc.

6. **`raw_report_encrypted` from `credit_profile` is never sent to AI.** It contains PAN and tradelines.

---

## Encryption non-negotiables

1. **Never access Dexie tables directly** from feature code. Always use `EncryptedRepository<T>` from `src/core/db/repository.ts`.

2. **Never import or call `window.crypto.subtle` directly** from feature code. Only `src/core/crypto/engine.ts` and `src/core/crypto/securityManager.ts` may do this.

3. **The Master Key lives in memory only.** It is never written to IndexedDB in plaintext. The `keystore.ts` module holds it — never extract it to any other variable across module boundaries.

4. **All data written to IndexedDB must go through the encryption layer.** No raw plaintext records in any encrypted store.

---

## TypeScript standards

1. **Strict mode is on.** Never use `any`, `@ts-ignore`, or non-null assertions (`!`) without a comment explaining why it's safe.

2. **`noUncheckedIndexedAccess` is on.** Always handle the case where an array index or record key returns `undefined`.

3. **`exactOptionalPropertyTypes` is on.** Do not pass `undefined` as an optional property — omit the property instead.

4. **No implicit returns** in functions that return a value. Every code path must explicitly return.

---

## Component conventions

1. **Use `usePrivacy()` hook** for all privacy-aware rendering. Never check `mode` directly in feature components — use `<PrivacyAwareText>` or `<MaskedValue>` from `src/components/privacy/`.

2. **Mobile-first Tailwind.** Default classes are for mobile (390px). Use `md:` and `lg:` breakpoints for larger screens. The app shell constrains width to `max-w-[430px]` on desktop.

3. **Currency formatting:** Always use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` from `src/lib/formatters.ts`. Never format rupee amounts inline.

4. **Date formatting:** Use `src/lib/formatters.ts` helpers. Never use `new Date().toLocaleDateString()` directly — locale must be `en-IN`.

5. **No inline styles.** Use Tailwind classes. For dynamic values (e.g. progress ring circumference), use CSS custom properties.

6. **Tabler icons only.** Use `<i class="ti ti-NAME">` — outline only. Never use filled variants (`ti-heart-filled` etc.) or draw custom SVG icon paths.

---

## Architecture conventions

1. **Feature modules are self-contained.** A feature in `src/features/expenses/` must not import from `src/features/portfolio/`. Both may import from `src/core/`, `src/components/`, `src/context/`, `src/lib/`.

2. **One commit per step or module.** Commit format: `feat(module): description`, `chore: description`, `test: description`, `fix(module): description`.

3. **No half-implemented features.** If a feature isn't complete, leave the stub as a placeholder rather than shipping broken UI.

4. **`mockChip.ts` for all Phase 1 development.** Never add a real Anthropic API call during Phase 1 Core development. The `CHIP_MODE` flag controls this.

---

## File naming

- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities: `camelCase.ts`
- Types: `camelCase.types.ts`
- Tests: `fileName.test.ts`
- Route pages: `ModulePage.tsx` (e.g. `ExpensesPage.tsx`)

---

## What Chip always shows

Every Chip insight must have all four fields populated before being shown:
1. **Reasoning** — the data points behind the recommendation
2. **"What if I do nothing?"** — consequence in rupees
3. **Module tag** — which area it relates to
4. **Confidence** — Chip's certainty (shown as a subtle indicator, not a percentage)

Never show a Chip insight without a populated `do_nothing_consequence`. It is the most important field.
