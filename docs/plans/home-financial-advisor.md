# Home as a Financial-Health & Guidance Hub (concept / plan)

> **Status:** 🚧 In progress. **Steps 1–2 done.** Step 1: Home IA reshape + money stat card + greeting
> first-name + market auto-scroll/react-to-toggle + Cash Flow back button. Step 2: Health Score folded
> into Home (`FinancialHealthCard` — coloured segmented ring + top-3 quick wins + `HealthDetailModal`
> "See all"/ⓘ); standalone Health screen + `health` module/route removed (`useHealthScore` + ScoreGauge/
> ComponentCard/ScoringGuide reused). Step 3: guidance v1 — advisor core
> ([`src/core/advisor/guidance.ts`](../../src/core/advisor/guidance.ts)) maps a weak health component to
> a next step (Set-as-goal template / navigate / add-data); health-card quick wins now carry the action;
> "Set as goal" creates a **`source:'suggested'` Goal** shown with a ✨ badge on `GoalCard`. Step 4:
> opt-in **Life & household** profile fields (marital status · children birth years · home-owner · risk
> appetite — encrypted, with why/unlock copy in Edit Profile) + **life-stage goal templates**
> ([`lifeStageGoals.ts`](../../src/core/advisor/lifeStageGoals.ts): education corpus w/ inflation, home
> down-payment, marriage fund, retirement) surfaced as a deduped **"Suggested for you"** section on the
> Goals page (one-tap add → tagged goal). **Steps 1–4 done.** Step 5 (Chip "why" + richer capabilities)
> is future/backlog. (Cash Flow module removal still pending — page stays via Safe-to-spend.) Not yet
> committed; SCHEMA.md needs the new Profile/Goal fields at commit time.
> Reshapes the Home screen and folds in the (to-be-removed) Health Score screen; adds a privacy-first
> **guidance/advisory** layer and life-stage **goal templates**. Authoritative status once approved:
> [`docs/MILESTONES.md`](../MILESTONES.md) / [`docs/ROADMAP.md`](../ROADMAP.md).

---

## Why

Penny's motto is **not just track, but help** — use the data the user already tracks to guide them to
financial stability and a better life, in a **privacy-first, on-device, user-centred** way. Today the
Home screen is a flat stack of sections (market → greeting → stories → net worth → groups → accounts →
tools) with no hierarchy, and the most valuable "how am I doing / what should I do" content is buried in a
hidden **Health Score** screen. This plan makes **Home the coach**.

**North star:** _In ~3 seconds, Home tells you **where you stand** and **what to do next** to improve —
and lets you act on it (usually "Set as goal")._

---

## The model — two layers on Home

1. **Standing** (where you are): greeting · Net worth · Safe-to-spend · **Financial Health score** · accounts.
2. **Next best steps** (what to do): a prioritized, personalized **guidance feed** → each item is actionable
   (often "Set as goal").

Everything else (stories, groups, market, tools) orbits these two, in a **You → Your world → Explore**
priority gradient.

### Revised Home IA (content + order)

1. **Greeting + first name** (top).
2. **Money glance (hero)** — Net worth (→ breakdown) + Safe-to-spend (→ Cash Flow) + assets/liabilities bar.
3. **Stat card (one card, 3 columns, hairline-split — separate from the hero)** — **Spent** (·this month, living-expenses subtext) · **Insurance** (cover) · **Loans** (outstanding). No "This month" umbrella title (each column self-labels). Insurance & Loans are **glance stats, not a Tools grid** (Tools grid removed from Home). Each taps through to its screen. (Locked: mockup "Option A · two cards".)
4. **Financial Health** — score + coloured ring + **top-3 quick wins** (each actionable); "how it's scored" behind the ⓘ. Guidance is merged into these quick wins (with a "See all").
5. **Stories** — ambient/celebratory + entry points: Your week · Milestone · **Timeline story** · Insights. Tax is surfaced as a **quick-win action** (80C headroom), not a story/tile. Stories live **only** on Home.
6. **Groups** — balances.
7. **Accounts** — balances.
8. **Market strip** — tucked here (context, not your money); slim, auto-scrolling.

News/Calculators remain modules (off Home). Cash Flow & Health Score modules/screens **removed** (Cash Flow via Safe-to-spend; Health folded here).

---

## Folding the Health Score into Home

The standalone Health Score screen + its Settings/Tools module are **removed**; its value is **distributed**:

- **Headline score** (ring + label, e.g. "72 · Good") — the answer to "how am I doing".
- **Vitals** — the pillars as compact status chips/segments (**Protection · Emergency fund · Debt · Savings · Growth**), colour-coded good/attention.
- **"i" per factor** → opens the benchmark ("ideal = 6 months' expenses", "term cover ≈ 10× income"). The
  scoring/ratio detail lives **on-demand behind the "i"**, keeping Home concise (explicit user ask).
- **Weak vitals are actionable** → tap → a guidance card with **Set as goal / Fix now**.

`useHealthScore` already computes the score + components — it powers the Home glance instead of a page.

---

## The Guidance / Advisory engine — "Next best steps"

A prioritized, **on-device** action feed. **Advice-only — no product/affiliate pushing** (trust differentiator).

- **Inputs:** account balances (idle cash, low buffer, high card balance, negative cash), health factors,
  coverage gaps, existing goals/IOU/groups, and **profile/life-stage** (see below).
- **Priority waterfall:** **Protect → Clear costly debt → Build buffer → Grow/invest → Optimize (tax) → Life goals.**
- **Card anatomy:** _what_ · _why_ (plain language) · _benchmark_ · **one primary action** (Set as goal / Add
  insurance / Move idle cash / Dismiss·Snooze).
- **Chip** supplies the "why" and answers follow-ups ("why 6 months?").
- **Examples:** emergency fund to 6 months · term cover ≈ 10× income · idle cash → liquid fund/SIP ·
  **Tax (done differently):** "₹40,000 still investable under 80C before 31 Mar → saves ~₹12,000" (a guidance
  card, not a Tools tile).

---

## Life-stage goals + goal templates

From profile/life-stage, generate **pre-filled goal templates** (India benchmarks + inflation), editable by
the user, created in one tap from a suggestion:

- **Single/early:** emergency fund · term cover · start retirement SIP.
- **Married:** joint buffer · spouse cover · home down-payment.
- **Kids:** **education corpus** (school→college timeline, inflation-adjusted) · child plan · higher term cover · nominee/will nudge.
- **Mid/late:** retirement / FIRE corpus · health top-up · debt payoff.

---

## Profile data — informed, opt-in, encrypted

New fields are collected **only in the Edit Profile screen**, each with a clear **why + what it unlocks**, so
the user opts in with an informed decision. All stored **encrypted at rest** (via `EncryptedRepository`, like
all profile data — only a coarse age _band_ ever reaches Chip; see PRIVACY rules).

- Candidate fields: **marital status**, **dependents** (kids + birth years), **home-owner**, **risk appetite**.
- Presentation: an optional **"Life & household"** section — e.g. "Add your household → unlocks personalized
  goals like a child's education corpus and the right insurance cover." Nothing required; guidance degrades
  gracefully without it.

---

## Decisions

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Stories vs. guidance | **Separate but same voice (Chip).** Stories stay light/ambient + entry points; "Next best steps" is the actionable feed. **Tax moves to guidance**; the "Tax story" is dropped. |
| 2 | Health presentation | **Locked (home-v2 mockup):** Option A layout — score + **top-3 quick wins** (each actionable) — with **Option B's coloured segmented ring**. |
| 3 | Guidance depth on Home | **Top 1–3 cards + "See all"** (a light list/sheet, not a new nav module). |
| 4 | Profile fields | **Opt-in only in Edit Profile, with why/unlock, encrypted.** ✅ (user) |
| 5 | Advice-only | **Yes — no product/affiliate suggestions.** Computed on-device. |
| 6 | Goal templates | **Yes** — suggestions create goals with estimated targets (India benchmarks + inflation), editable. ✅ (user) |

---

## Removals / migrations

- **Remove** `cashflow` + `health` from `ModuleVisibility`, the Settings module grid, and the Home Tools grid.
- **Cash Flow page** stays on its route, reached via **Safe-to-spend** (+ add back button).
- **Health Score page** removed; `useHealthScore` repurposed to power the Home Financial-Health glance +
  the "i" benchmark detail.
- **Timeline:** keep the Settings row; add a **Timeline story** on Home (opens the Timeline page).

---

## Also on this pass (bugs, not design)

- **Market strip:** auto-scroll, responsive (more than ~2 items), and **re-render immediately** on ticker toggle.
- **Greeting:** first name, at the top.
- **Safe-to-spend → Cash Flow:** add the missing back button.

---

## Additional capability ideas (backlog)

What-if simulator ("₹5k/mo → emergency fund in 8 months") · net-worth trajectory to retirement · coverage
checkup (HLV vs. dependents/income) · idle-cash & spending-leak nudges · windfall/bonus planner · goal
auto-allocation from safe-to-spend · streaks/milestones for positive reinforcement.

---

## Suggested build sequence

1. **Home IA reshape** (reorder + greeting/first-name + market fix + Cash Flow back button) — low-risk, immediate.
2. **Health fold** — Financial-Health glance on Home from `useHealthScore`; remove the screen/module; "i" benchmark detail.
3. **Guidance engine v1** — a small rules-based `advisor` core (account + health inputs) → top cards → "Set as goal".
4. **Profile fields (opt-in)** + **life-stage goal templates**.
5. **Chip integration** for the "why" + follow-ups; richer capabilities from the backlog.

---

## Open questions

- Health presentation variant (resolve from mockups).
- Guidance snooze/dismiss cadence + how it interacts with privacy modes (Safe/Private hide amounts).
- Where "See all guidance" lives (inline expand vs. a light dedicated view — not a settings module).
