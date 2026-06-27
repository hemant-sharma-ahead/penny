# Chip AI

## What it is

Chip is Penny's built-in AI financial advisor. Chip reads your financial data — always privately, always on your terms — and offers observations, explanations, and projections to help you make better decisions. In Phase 1, Chip uses a local simulation engine to generate insights without any network calls. In Phase 2, Chip connects to Claude claude-sonnet-4-6 via the Anthropic API for full conversational capability.

## User-facing capabilities

**Phase 1 (current):**

- See AI-generated insights on the Home dashboard — observations about your spending, savings, or portfolio
- Get a Chip insight on each individual goal: projected time to reach it at your current savings rate
- Insights are contextual to your actual data: amounts, categories, and trends drawn from your encrypted local records
- Each insight includes: what Chip observed, why it matters, what happens if you do nothing (quantified in rupees where possible), and a confidence level

**Phase 2 (planned):**

- Full conversational chat interface at `/app/chip` — ask Chip anything about your finances
- Contextual nudges while browsing modules — e.g. a suggestion while viewing your EPF balance that your growth is below benchmark
- Life event workflows — tell Chip "I just got a salary hike" and it walks you through updating your EPF contributions, SIP amounts, and tax planning in one guided flow
- Proactive alerts — Chip flags when something important changes (a goal falling behind, a subscription cost increase, a loan prepayment opportunity)

## How it works

**Privacy pipeline (applies to both phases):**
All data passes through `buildUserContext()` before Chip ever sees it. This function:

1. Reads your financial records from the encrypted Dexie stores
2. Strips all Category 1 PII (person names, account numbers, policy numbers)
3. Bands or generalises sensitive values (exact salary → income band; specific age → age range)
4. Assembles a sanitised context object safe to reason over

Raw financial data **never reaches** the Anthropic API. See `docs/PRIVACY.md` for the full PII treatment rules.

**Phase 1 — simulation engine:**
`mockChip.ts` contains a set of rule-based heuristics that examine the sanitised context and generate insights. It produces the same structured insight format that Phase 2 will use (observation, reasoning, doNothingConsequence, module tag, confidence), so the UI does not need to change when Phase 2 is enabled.

**Phase 2 — real API:**
When `CHIP_MODE` is set to `real`, `buildUserContext()` constructs the prompt, `anthropicClient.ts` makes the call to Claude claude-sonnet-4-6, and the response is parsed into the insight schema. `piiScanner.ts` runs a final check on the response before it is displayed to catch any accidental PII reflection.

The `CHIP_MODE` constant is the single switch between simulation and real mode — no other code changes are needed to enable Phase 2.

Every AI call is logged to the encrypted `ai_call_log` store (timestamp, model, token count, module tag) and every insight is cached in the encrypted `chip_insights` store.

**Insight requirements — every Chip insight must have:**

- `observation` — what Chip noticed
- `reasoning` — why it matters and how Chip reached this conclusion
- `doNothingConsequence` — the cost of inaction, expressed in rupees where possible
- `moduleTag` — which module the insight relates to
- `confidenceLevel` — how confident Chip is (high / medium / low)

Key files:

- `src/features/chip/ChipPage.tsx` — Chip chat interface (stub in Phase 1)
- `src/core/ai-safety/mockChip.ts` — Phase 1 rule-based insight generator
- `src/core/ai-safety/buildUserContext.ts` — PII-safe context builder; the only path to the Anthropic API
- `src/core/ai-safety/piiScanner.ts` — PII scan on outbound context and inbound responses
- `src/core/ai-safety/anthropicClient.ts` — the only file permitted to import `@anthropic-ai/sdk`

## Current limitations

- Phase 1 insights are rule-based, not generative — they follow pre-written patterns and cannot answer follow-up questions
- No conversational interface in Phase 1 — insights are surfaced in-context on each module, not in a chat
- Chip cannot currently explain its reasoning interactively ("why did you say that?")
- The PII pipeline generalises data for privacy, which means Chip's advice is directional rather than precise ("you should invest more" rather than "invest exactly ₹4,320 more per month")

## Planned improvements

- Phase 2: Full conversational chat at `/app/chip` powered by Claude claude-sonnet-4-6
- Phase 2: Module-contextual nudges surfaced while browsing (not just on Home)
- Phase 2: Life event workflows (salary hike, home purchase, having a child, retirement planning)
- Phase 2: Proactive alert engine — Chip monitors for threshold crossings and sends in-app alerts
- Phase 3: Regional language support — Chip in Hindi and other Indian languages

## Ideas welcome

- What financial questions do you most want to be able to ask Chip?
- How much detail do you want in Chip's reasoning — a short summary or a full explanation?
- Should Chip's insights be dismissible (and never shown again) or always re-computed?
