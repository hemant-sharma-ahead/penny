# Penny — Documentation Index

This is the navigation guide for all Penny documentation. Start here.

---

## Quick orientation

| If you want to…                                            | Read…                                             |
| ---------------------------------------------------------- | ------------------------------------------------- |
| Understand the project identity, rules, and current status | [`CLAUDE.md`](../CLAUDE.md)                       |
| Set up your development environment                        | [`CONTRIBUTING.md`](../CONTRIBUTING.md)           |
| Run the app on an Android emulator (from scratch)          | [`docs/ANDROID_EMULATOR.md`](ANDROID_EMULATOR.md) |
| Understand the full product vision and requirements        | [`docs/BRD.md`](BRD.md)                           |
| Understand the encryption and privacy architecture         | [`docs/TSD.md`](TSD.md)                           |
| Look up a specific Dexie store's fields                    | [`docs/SCHEMA.md`](SCHEMA.md)                     |
| Understand what PII is and how it's handled                | [`docs/PRIVACY.md`](PRIVACY.md)                   |
| Find a file or understand how the codebase is structured   | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)         |
| See every milestone and step ever shipped                  | [`docs/MILESTONES.md`](MILESTONES.md)             |
| Understand Phase 1.5/2/3 plans and architecture decisions  | [`docs/ROADMAP.md`](ROADMAP.md)                   |
| Understand a specific feature in depth                     | [`docs/features/`](features/)                     |
| See ideas for new features and future improvements         | [`docs/WHATS_NEXT.md`](WHATS_NEXT.md)             |

---

## All documentation files

### Core docs

| File                                              | What it covers                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`CLAUDE.md`](../CLAUDE.md)                       | Project identity, architecture rules, milestone status, key files — orientation for every session   |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md)           | Local setup, branching, commit conventions, pre-commit gates, PR rules                              |
| [`docs/BRD.md`](BRD.md)                           | Business requirements: vision, target users, competitive positioning, feature requirements by phase |
| [`docs/TSD.md`](TSD.md)                           | Technical specification: encryption model, Chip AI prompt architecture, PII pipeline                |
| [`docs/PRIVACY.md`](PRIVACY.md)                   | PII categories (v1.1+), anonymisation treatments, bureau data handling, privacy architecture        |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)         | Codebase map (every folder, component, hook, utility), external APIs, architectural decision log    |
| [`docs/SCHEMA.md`](SCHEMA.md)                     | All 19+ Dexie stores with every field, type, and description                                        |
| [`docs/MILESTONES.md`](MILESTONES.md)             | Full step-by-step history — M0 through Pre-Phase 1.5, all steps and statuses                        |
| [`docs/ROADMAP.md`](ROADMAP.md)                   | Phase 1.5/2/3 scope, backend design (Cloudflare Workers + D1 + KV), auth, encryption, decisions     |
| [`docs/WHATS_NEXT.md`](WHATS_NEXT.md)             | Future feature ideas: life events, AI categorisation, improvements across all modules               |
| [`docs/ANDROID_EMULATOR.md`](ANDROID_EMULATOR.md) | Step-by-step: wrap Penny with Capacitor and run it on an Android emulator via Android Studio        |

### Feature docs

Each feature file follows a standard template: **What it is → User-facing capabilities → How it works → Current limitations → Planned improvements → Ideas welcome**.

| File                                                                       | Feature covered                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`features/home.md`](features/home.md)                                     | Home dashboard: net worth card, accounts strip, market data strip, module tiles  |
| [`features/expenses.md`](features/expenses.md)                             | Expenses: categories, transactions, analytics, import/export, budgets, recurring |
| [`features/portfolio/overview.md`](features/portfolio/overview.md)         | Portfolio structure, asset classes, net worth calculation                        |
| [`features/portfolio/stocks-mf.md`](features/portfolio/stocks-mf.md)       | Stocks + MF: search, live prices, grouping, lot breakdown, weighted average      |
| [`features/portfolio/retirement.md`](features/portfolio/retirement.md)     | NPS, PPF, EPF: data models, projections, ledger, employer history                |
| [`features/portfolio/ipo.md`](features/portfolio/ipo.md)                   | IPO tracker: lifecycle tabs, GMP, subscription data, FY picker                   |
| [`features/portfolio/real-assets.md`](features/portfolio/real-assets.md)   | Vehicles (RC fetch, IRDA depreciation, challans), property                       |
| [`features/portfolio/fixed-income.md`](features/portfolio/fixed-income.md) | FD + RD: maturity calculations, compound interest, projections                   |
| [`features/portfolio/metals.md`](features/portfolio/metals.md)             | Gold + silver: live NAV-based pricing, karat adjustment                          |
| [`features/goals.md`](features/goals.md)                                   | Goals: progress rings, SIP calculator, contributions                             |
| [`features/insurance.md`](features/insurance.md)                           | Insurance policies: renewal tracking, coverage tracking                          |
| [`features/loans.md`](features/loans.md)                                   | Loans: amortization, payoff planner, XLSX download                               |
| [`features/accounts.md`](features/accounts.md)                             | Accounts: income entries, transfers, live balances                               |
| [`features/iou.md`](features/iou.md)                                       | IOU tracker: lent/borrowed, ageing alerts                                        |
| [`features/subscriptions.md`](features/subscriptions.md)                   | Subscription detection: 3-pass algorithm                                         |
| [`features/chip.md`](features/chip.md)                                     | Chip AI: mock vs real, insights, prompt architecture, PII pipeline               |
| [`features/onboarding.md`](features/onboarding.md)                         | Onboarding flow, privacy promise, demo data, profile fields                      |
| [`features/health-score.md`](features/health-score.md)                     | Financial health score: 6 components, scoring logic                              |
| [`features/tax-awareness.md`](features/tax-awareness.md)                   | Tax: 80C/80D/24B, LTCG/STCG, FY tracker                                          |
| [`features/cash-flow.md`](features/cash-flow.md)                           | Cash flow: forecast engine, recurring detection, week/month view                 |
| [`features/events.md`](features/events.md)                                 | Events system, recurring transactions, vacation guard                            |
| [`features/news-sentiment.md`](features/news-sentiment.md)                 | On-device, no-AI news sentiment: headline tone chips + "news mood" gauge         |

### Skill files (Claude sessions)

These files in `.claude/commands/` are loaded automatically when tasks match their description.

| File                                                                                        | When it's used                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`.claude/commands/penny-standards.md`](../.claude/commands/penny-standards.md)             | Any implementation task — privacy/encryption/architecture non-negotiables |
| [`.claude/commands/penny-feature-module.md`](../.claude/commands/penny-feature-module.md)   | Adding a new feature module from scratch                                  |
| [`.claude/commands/penny-components.md`](../.claude/commands/penny-components.md)           | Working with the shared component library                                 |
| [`.claude/commands/penny-api-client.md`](../.claude/commands/penny-api-client.md)           | Adding a new external API integration                                     |
| [`.claude/commands/penny-roadmap-context.md`](../.claude/commands/penny-roadmap-context.md) | Phase context — what's decided, don't re-derive                           |

---

## For users and contributors

Penny is a privacy-first personal wealth management app for India. Here's how to understand what's built and what's coming:

- **Feature exploration:** Read any file in `docs/features/` to understand a module fully
- **Suggest improvements:** Every feature doc has an "Ideas welcome" section — open an issue with your suggestion
- **Feature requests:** Open a GitHub issue referencing the relevant `docs/features/` file for context
- **Phase roadmap:** See `docs/ROADMAP.md` for what Phase 1.5, 2, and 3 will add
- **Future features:** See `docs/WHATS_NEXT.md` for ideas under consideration

---

## Documentation standards

All feature docs follow this template:

```markdown
# Feature Name

## What it is

Plain language description for anyone to understand.

## User-facing capabilities

What users can do. Written for non-developers.

## How it works

Technical: data model, key files, external APIs, notable algorithms.

## Current limitations

Known gaps and intentional deferrals.

## Planned improvements

What's coming, in which phase.

## Ideas welcome

Open questions where feedback helps.
```
