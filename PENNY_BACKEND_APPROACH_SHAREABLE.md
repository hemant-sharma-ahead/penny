# Penny — Backend & Scale Approach (Shareable Overview)

_A self-contained summary of how Penny's backend, backup, scaling, and infrastructure are designed,
for sharing and discussion. Snapshot as of 2026-06-27. (Internal canonical reference:
`docs/BACKEND_STRATEGY.md`.)_

---

## What Penny is

Penny is an **India-first personal-finance app** with a privacy-first promise: **local-first,
end-to-end encrypted, no trackers, and free**. All financial data lives **encrypted on the user's
device**. The backend is **additive and opt-in** — the app is fully usable with **no backend at all**.

Three non-negotiables shape every decision:

1. **The app must stay fully usable offline / with no backend.** Sync & sharing are an extra layer.
2. **Privacy-first:** the server should hold **as little as possible**, and **never** readable
   financial data.
3. **Free:** no per-user recurring cost that would break the "free" promise.

---

## Core principle: store as little as possible, and split global vs per-user

Every byte we don't store is cheaper and more private. Two rules drive the architecture:

- **Global data** (identical for everyone — market indices, gold/forex prices, mutual-fund NAVs, the
  merchant dictionary) is fetched **once** on a schedule and served as a **static file over a CDN**.
  10 million users cost the same as 100.
- **Per-user data** only ever exists as **encrypted blobs** the server can't read, and we push even
  that to the **user's own cloud** wherever possible (see backup model).

We deliberately **do not store** users' financial data, receipts, or backups on our servers by
default. The server's job is the minimum needed for multi-user **sharing**, nothing more.

---

## What we store, and where

| Data | Where it lives | Notes |
|---|---|---|
| The app itself | CDN (static) | Free, unlimited |
| Market indices / metals / forex | **CDN static file**, refreshed on a schedule | Global → never a per-user call |
| Mutual-fund / pension NAVs, stock prices | Cached proxy (shared) | Per-instrument, not per-user |
| Vehicle registration lookups | Permanent shared cache | Fetched once per vehicle, served to all forever |
| **Personal financial data + receipts** | **The user's own Google Drive** (encrypted) | **We store nothing** |
| Identity (a cryptographic key + a username) | Minimal server record | No phone number, no email, no PII |
| Group membership + shared-group data | Minimal server (encrypted) | Only for users who join a group |

Two things **never** touch our servers: **global data** (it's on the CDN) and **personal
data/receipts** (they're in the user's own Drive).

---

## Identity, backup & recovery (the "WhatsApp model", but more private)

### No phone numbers, no OTP

Identity is an **on-device cryptographic keypair + a self-chosen username** — not a phone number.
This avoids SMS costs and avoids collecting personal data. The username is just a public handle for
sharing; it can never decrypt anything.

### Backup = the user's own Google Drive (mandatory, like WhatsApp)

The user's encrypted data (everything, including receipt photos) is backed up to **their own Google
Drive**, automatically — encouraged/auto-enabled from day one, the way WhatsApp does it. **We never
see or store it.** Google Drive is used on **both Android and iOS** (one integration).

### How recovery works — and why groups survive a reinstall

This mirrors WhatsApp exactly, split by **type** of data:

- **Groups/sharing structure** comes back from **our server** (it tracks "you're in groups X, Y").
- **Personal history** comes back from the **user's own Drive** (the encrypted blob).

> **WhatsApp does the same thing:** its servers hold your account + group membership; Google Drive
> holds only your chat history. On reinstall, phone verification restores your groups *from the
> server*, then Drive restores your messages. Penny is the same split — but more private (data is
> always end-to-end encrypted; identity is a key, not a phone number) and cheaper (we store no
> personal content).

Recovery flow: reinstall → restore the encrypted blob from the user's Drive → enter passphrase →
identity keys + group keys + all data are restored → the server confirms which groups you're in. If
the user is on a second device, a **QR device-pairing** flow works without any cloud.

**Trade-off we accept:** recovery depends on the user having Drive backup on — so we make it
near-mandatory in onboarding. (Our existing stance is already "lose your passphrase = data
unrecoverable"; this is consistent.) A server-stored encrypted backup remains available as an
**optional** convenience for users who don't want to use Drive.

### Backup vs. live multi-device sync (two different things)

These are often lumped together but are separate problems:

1. **Backup / new-device / recovery** — a periodic encrypted snapshot you restore on a new phone or
   after reinstall. One-way, infrequent. → Fully handled by **Google Drive**; storing nothing on our
   servers doesn't affect it.
2. **Live multi-device sync** — actively using two devices at once, where a change on one appears on
   the other (including merging offline edits). → A *future* capability; most users are single-device.

Crucially, "we store no backup on our servers" does **not** mean "no clean multi-device sync." When we
build live sync, devices exchange **small encrypted deltas through the same group relay** (a "personal
group of one") — the server passes along unreadable ciphertext, never the full dataset — plus
**device-to-device pairing** (e.g. QR) for copying from an old phone. That gives proper
conflict-handling without us storing your data. **Google Drive is used only for backup/recovery, never
as the live-sync channel.**

---

## Groups (the only thing that truly needs a server)

People in a group aren't online at the same time, so shared, encrypted updates must land somewhere
both can reach. That relay is the **one** genuinely server-side piece:

- Each group has its own encryption key, shared only between members via their public keys.
- Shared expenses/updates are stored as **encrypted events** the server can't read.
- Leaving a group rotates the key so departed members can't read new data.

Everything else (your personal finances) never needs the server.

---

## Scale & cost (10 million users)

Infrastructure is **Cloudflare** (edge platform: static hosting, Workers, KV, D1, R2 storage). The
free tier is generous and **perpetual** (resets daily; no trial expiry).

- **The naïve design** (route every user's market-data + sync through a server function) would cost
  **~$2,000/month at 10M users** and blow past the free tier — because every user invokes a server
  function even on a cache hit.
- **Our design** (global data on the CDN; only genuinely per-user sharing on the server; personal
  data on the user's own Drive) stays **free to roughly 100–300K users**, and is **~tens of
  dollars/month at 10M users**.
- Costs are **usage-based, linear, and cheap** — no re-platforming as we grow.
- The real cost at large scale is **AI features** (Phase 2, paid per token), not infrastructure —
  mitigated by doing ~80–90% of categorization **on-device** with no AI.

---

## Deployment & native apps (Capacitor)

The app is built once as a web app and wrapped into **native Android/iOS apps** (via Capacitor).
Key points:

- The **backend is infrastructure at a URL**; the app (web or native) is just a client. We deploy
  the backend **once** and update it only when backend logic changes — **never per app release**.
- The backend's address is delivered via a small **remote config** the app reads at startup, so we
  can move/upgrade the backend **without forcing an app-store update**.
- The backend API is **versioned** so old installed apps keep working.

---

## Contact / support email & domain

- A branded `support@<domain>` requires **owning a domain** (~₹1,000/year); the email
  forwarding/mailbox on top is free (e.g. Zoho Mail free, or Cloudflare Email Routing + Gmail).
- We're **deferring the domain** until the in-app "Contact us" email is actually needed; until then,
  **Play Store / App Store reviews** are the feedback channel. The backend runs fine on free
  Cloudflare subdomains in the meantime.

---

## Open questions we'd value input on

1. Is **"store nothing personal; user owns their Drive backup"** the right privacy/cost trade-off,
   versus also keeping a server-side encrypted backup for guaranteed recovery?
2. Is **Google Drive on both platforms** acceptable (vs. iCloud on iOS), for simplicity?
3. Making **Drive backup near-mandatory** at onboarding — acceptable UX, or too forceful?
4. Anything in the **groups / sharing** model that feels risky or missing?

---

_This is a discussion snapshot. The living, detailed design lives in the project docs
(`docs/BACKEND_STRATEGY.md`, `docs/ROADMAP.md`, and the Phase 1.5 plans)._
