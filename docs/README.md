# Penny — Documentation Index

This is the navigation guide for all Penny documentation. Start here.

---

## Quick orientation

| If you want to…                                                      | Read…                                               |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| Understand the project identity, rules, and where to look for status | [`CLAUDE.md`](../CLAUDE.md)                         |
| Set up your development environment (mobile, workers)                | [`CONTRIBUTING.md`](../CONTRIBUTING.md)             |
| Understand the full product vision and requirements                  | [`docs/BRD.md`](BRD.md)                             |
| Understand the encryption and privacy architecture                   | [`docs/TSD.md`](TSD.md)                             |
| Look up a specific database store's fields                           | [`docs/SCHEMA.md`](SCHEMA.md)                       |
| Understand what PII is and how it's handled                          | [`docs/PRIVACY.md`](PRIVACY.md)                     |
| Find a file or understand how the codebase is structured             | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)           |
| See what's shipped, in progress, or a future idea                    | [`docs/ROADMAP.md`](ROADMAP.md)                     |
| Look up an external API Penny calls                                  | [`docs/EXTERNAL_APIS.md`](EXTERNAL_APIS.md)         |
| Design or adjust any screen (UI rules, patterns, tokens)             | [`docs/DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md) |
| Read a detailed phase/track plan (why/what/how)                      | [`docs/plans/`](plans/)                             |
| Understand a specific feature in depth                               | [`docs/features/`](features/)                       |

---

## All documentation files

### Core docs

| File                                                | What it covers                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [`CLAUDE.md`](../CLAUDE.md)                         | Project identity, non-negotiable rules, reference table — orientation for every session                                                       |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md)             | Local setup for `apps/mobile` + workers, branching, commit conventions, pre-commit gates, PR rules                                            |
| [`docs/BRD.md`](BRD.md)                             | Business requirements: vision, target users, competitive positioning, feature requirements by phase                                           |
| [`docs/TSD.md`](TSD.md)                             | Technical specification: encryption model, Chip AI prompt architecture, PII pipeline                                                          |
| [`docs/PRIVACY.md`](PRIVACY.md)                     | PII categories, anonymisation treatments, bureau data handling, privacy architecture                                                          |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)           | Codebase map (every folder, component, hook, utility), architectural decision log                                                             |
| [`docs/SCHEMA.md`](SCHEMA.md)                       | All database stores with every field, type, and description                                                                                   |
| [`docs/EXTERNAL_APIS.md`](EXTERNAL_APIS.md)         | Every external API Penny calls, canonical constants file, and Worker-proxy status                                                             |
| [`docs/ROADMAP.md`](ROADMAP.md)                     | Shipped milestone history, decided/in-progress phase scope + architecture decisions, and future feature ideas — all three merged into one doc |
| [`docs/DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md) | **Single source of truth for UI design** — ethos, layout/modal rules, patterns, themes, tokens, mockup workflow                               |
| [`docs/BACKEND_STRATEGY.md`](BACKEND_STRATEGY.md)   | Model B backend strategy: what the server stores (nothing personal), scale rules, backup/recovery, contact-email hosting decision             |
| [`docs/plans/`](plans/)                             | Detailed approved phase/track plans (why/what/how, step breakdowns) — see [`plans/README.md`](plans/README.md) for the index                  |

### Feature docs

Each feature file follows a standard template: **What it is → User-facing capabilities → How it works → Current limitations → Planned improvements → Ideas welcome**.

| File                                                                       | Feature covered                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`features/home.md`](features/home.md)                                     | Home dashboard: net worth card, accounts strip, market data strip, module tiles                                   |
| [`features/expenses.md`](features/expenses.md)                             | Expenses: categories, transactions, analytics, import/export, budgets, recurring                                  |
| [`features/bank-import.md`](features/bank-import.md)                       | Bank Statement Import: two-tier matching, checkpoints/balance sync, Full Ledger reconciliation                    |
| [`features/sms-tracking.md`](features/sms-tracking.md)                     | SMS-Based Transaction Tracking (Android only): parsing, account matching, native capture layer                    |
| [`features/portfolio/overview.md`](features/portfolio/overview.md)         | Portfolio structure, asset classes, net worth calculation                                                         |
| [`features/portfolio/stocks-mf.md`](features/portfolio/stocks-mf.md)       | Stocks + MF: search, live prices, grouping, lot breakdown, weighted average                                       |
| [`features/portfolio/retirement.md`](features/portfolio/retirement.md)     | NPS, PPF, EPF: data models, projections, ledger, employer history                                                 |
| [`features/portfolio/ipo.md`](features/portfolio/ipo.md)                   | IPO tracker: lifecycle tabs, GMP, subscription data, FY picker                                                    |
| [`features/portfolio/real-assets.md`](features/portfolio/real-assets.md)   | Vehicles (RC fetch, IRDA depreciation, challans), property                                                        |
| [`features/portfolio/fixed-income.md`](features/portfolio/fixed-income.md) | FD + RD: maturity calculations, compound interest, projections                                                    |
| [`features/portfolio/metals.md`](features/portfolio/metals.md)             | Gold + silver: live NAV-based pricing, karat adjustment                                                           |
| [`features/goals.md`](features/goals.md)                                   | Goals: progress rings, SIP calculator, contributions                                                              |
| [`features/insurance.md`](features/insurance.md)                           | Insurance policies: renewal tracking, coverage tracking                                                           |
| [`features/loans.md`](features/loans.md)                                   | Loans: amortization, payoff planner, XLSX download                                                                |
| [`features/accounts.md`](features/accounts.md)                             | Accounts: income entries, transfers, live balances                                                                |
| [`features/iou.md`](features/iou.md)                                       | IOU tracker: lent/borrowed, ageing alerts                                                                         |
| [`features/groups.md`](features/groups.md)                                 | Groups (Household OS): N-party shared expenses, splits, settle-up/write-off, static members                       |
| [`features/subscriptions.md`](features/subscriptions.md)                   | Subscription detection: 3-pass algorithm                                                                          |
| [`features/calculators.md`](features/calculators.md)                       | 10 financial calculators: FIRE, tax regime, HRA, SIP/SWP, FD/RD, lumpsum, capital gains, gratuity, SSY, inflation |
| [`features/chip.md`](features/chip.md)                                     | Chip AI: mock vs real, insights, prompt architecture, PII pipeline                                                |
| [`features/onboarding.md`](features/onboarding.md)                         | Onboarding flow, privacy promise, demo data, profile fields                                                       |
| [`features/health-score.md`](features/health-score.md)                     | Financial health score: 6 components, scoring logic                                                               |
| [`features/tax-awareness.md`](features/tax-awareness.md)                   | Tax: 80C/80D/24B, LTCG/STCG, FY tracker                                                                           |
| [`features/cash-flow.md`](features/cash-flow.md)                           | Cash flow: forecast engine, recurring detection, week/month view                                                  |
| [`features/events.md`](features/events.md)                                 | Events system, recurring transactions, vacation guard                                                             |
| [`features/backup.md`](features/backup.md)                                 | Backup, restore, erase, and passphrase-based account recovery (Model B)                                           |
| [`features/timeline.md`](features/timeline.md)                             | Activity timeline: story vs log tabs, recently-deleted, undo/restore                                              |
| [`features/news.md`](features/news.md)                                     | Finance news: RSS sources, the CORS/proxy problem and decision                                                    |
| [`features/news-sentiment.md`](features/news-sentiment.md)                 | On-device, no-AI news sentiment: headline tone chips + "news mood" gauge                                          |
| [`features/feedback.md`](features/feedback.md)                             | Contact/Feedback: `mailto:` deep-link                                                                             |

Not yet documented here (a known gap, not yet closed): Import, Profile, Security,
Settings — functional but without a dedicated `docs/features/` file yet.

### Claude Code tooling

| File                                                                                                | When it's used                                                              |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Code standards/best-practices, feature-module structure, the component library, and                 |
| external-API integration used to each have their own `.claude/commands/penny-*.md` file —           |
| retired 2026-08-13 (they weren't reliably loaded each session the way `CLAUDE.md` is, and           |
| had drifted stale/duplicative against the docs below). Their live content now lives in:             |
| `CLAUDE.md`'s Non-negotiable rules + `CONTRIBUTING.md` (standards, architecture rules,              |
| TypeScript standards, pre-commit gates), `docs/ARCHITECTURE.md` (feature module structure,          |
| component inventory, anti-patterns, refactor signals, India-specific conventions),                  |
| `docs/DESIGN_GUIDELINES.md` (component/UI conventions), `docs/EXTERNAL_APIS.md` (adding a           |
| new API client), `docs/PRIVACY.md`/`docs/TSD.md` (privacy/encryption detail), and                   |
| `docs/ROADMAP.md` (phase context — always the current status, never a separate snapshot).           |
| [`.claude/skills/documentation-maintenance/`](../.claude/skills/documentation-maintenance/SKILL.md) | Determining which docs need updating after a change                         |
| [`.claude/skills/ui-design-check/`](../.claude/skills/ui-design-check/SKILL.md)                     | Reviewing/proposing UI against design guidelines                            |
| [`.claude/agents/mobile-developer.md`](../.claude/agents/mobile-developer.md)                       | Implementing `apps/mobile` features and fixes                               |
| [`.claude/agents/code-reviewer.md`](../.claude/agents/code-reviewer.md)                             | Reviewing a diff before commit through React Native/design/standards lenses |
| [`.claude/agents/test-writer.md`](../.claude/agents/test-writer.md)                                 | Writing/maintaining Vitest tests                                            |
| [`.claude/agents/ui-designer.md`](../.claude/agents/ui-designer.md)                                 | Designing/refactoring UI, producing mockup proposals                        |

---

## For users and contributors

Penny is a privacy-first personal wealth management app for India. Here's how to
understand what's built and what's coming:

- **Feature exploration:** Read any file in `docs/features/` to understand a module fully
- **Suggest improvements:** Every feature doc has an "Ideas welcome" section — open an
  issue with your suggestion
- **Feature requests:** Open a GitHub issue referencing the relevant `docs/features/` file
  for context
- **Roadmap:** See [`docs/ROADMAP.md`](ROADMAP.md) for what's shipped, in progress, and
  planned across every phase

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

Every feature doc describes `apps/mobile` directly — there's no other app to carve out a
separate section against. Feature docs written before `apps/web-react`'s 2026-08-29
retirement may still carry a legacy **Mobile (`apps/mobile`)** subsection distinguishing
mobile-only behavior from a web baseline that no longer exists; fold that content into the
main sections the next time that doc is touched, rather than leaving the split in place
indefinitely.
