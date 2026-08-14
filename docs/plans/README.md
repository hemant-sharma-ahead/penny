# Phase & Track Plans

Detailed, approved implementation plans for upcoming phases, tracks, or multi-step features.
Each plan captures the **why / what / how**, locked decisions, alternatives considered, the
track/step breakdown, and a verification section.

**Workflow:**

- One file per phase (or large track), kebab-cased: `phase-1.5-groups-household-os.md`.
- Each plan opens with a **Status** line (Planned / In progress / Complete) and links back to
  [`docs/MILESTONES.md`](../MILESTONES.md) and [`docs/ROADMAP.md`](../ROADMAP.md), which hold
  the authoritative per-track status.
- When a track's status changes, update **both** the plan's Status line **and** the matching
  row in `MILESTONES.md` / `ROADMAP.md` (see the documentation-discipline rule in `CLAUDE.md`).

## Index

| Plan                                                                     | Phase     | Status                                                           |
| ------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------- |
| [Phase 1.5 — Groups & Household OS](phase-1.5-groups-household-os.md)    | Phase 1.5 | 🚧 In progress (Tracks 1 ✅, A ✅, B ✅, C ✅, D ✅, E ✅ deployed; Track F 🚧 F1–F3 ✅). Remaining: Track E live verify + F4 + Stage F |
| [Phase 1.5 Track A — API Proxy Worker](phase-1.5-track-A-api-proxy.md)   | Phase 1.5 | ✅ Complete (deployed 2026-07-01)                                |
| [Phase 1.5 Track E — Groups & Household OS](phase-1.5-track-E-groups.md) | Phase 1.5 | 🚧 E1–E5 + tail ✅, deployed; **end-to-end live verification + Stage F pending** (see "▶ Resume here") |
| [Home as a Financial-Health & Guidance Hub](home-financial-advisor.md)   | TBD       | 🚧 In progress — Steps 1–4 done; Step 5 (Chip) future |
| [Account Lifecycle & Recovery](account-lifecycle-recovery.md)            | Phase 1.5 | 🚧 Deregister-on-erase + inactivity GC done. **Recovery now delivered under Track F** — this doc is the recovery-worker mechanics reference |
| [Phase 1.5 Track F — Multi-Device, Sync & Recovery](phase-1.5-track-F-multi-device-recovery.md) | Phase 1.5 | 🚧 F1 phantom-claim ✅, F2 recovery hardening + restore-on-reinstall ✅, F3 passphrase reclaim (Ed25519) ✅; F4 device pairing/QR next (living doc) |
| [Mobile Migration — React Native (Expo)](mobile-migration.md)           | Mobile    | 🚧 Track 0 + 1 + 2 ✅ committed. Track 3 (UI component library) ✅ verified (bundle inspection, tests, lint), on-device visual check owed. Track 4 (feature-by-feature, pilot: Subscriptions) next (living doc) |
| [CSV / Manual Expense Import — Redesign](csv-expense-import-redesign.md) | TBD       | ✅ Shipped (2026-08-14) — 3-stage wizard, direction/counterparty-aware categories, IOU integration, Import Progress screen |
