# Contact / Support Email — Setup & Decision

How Penny's user-facing **Contact us** address (e.g. `support@<yourdomain>`) is hosted. The goal:

> Users email a branded address → it lands in our **real** inbox → we **reply as** the branded
> address (the user never sees our personal email).

Status: **decision pending** (no domain registered yet). The in-app Contact module is **M14**
(in progress, Pankhuri); the email address is just a **config value**, so this never blocks code.

---

## The one unavoidable cost: a domain

A **branded** address requires owning a domain (~₹900–1,100/yr). There is no reliable free branded
domain. The *forwarding/mailbox* on top can be free. A domain is wanted anyway for the production
PWA URL (vs `*.pages.dev`) — so it does double duty (app + email).

Free **non-branded** addresses (on a provider's domain) are possible with zero domain cost, but read
as untrustworthy for a finance app's Contact screen — acceptable only as a temporary placeholder.

---

## Options compared

| Path | Receive | Reply-as | Cost beyond domain | Effort | Notes |
|---|---|---|---|---|---|
| **C · Domain + Zoho Mail Free** ⭐ | ✅ | ✅ | ₹0 | Low | Real send+receive mailbox, ≤5 users/1 domain. Webmail + app only (no IMAP on free). |
| **A · Domain + Cloudflare Email Routing + Gmail "Send mail as"** | ✅ | ✅ | ₹0 | Medium | CF Routing forwards inbound (free); replying-as needs a **free SMTP relay** (Brevo ~300/day, Resend ~3k/mo) wired into Gmail's send-as + SPF/DKIM DNS. Keeps everything inside your Gmail. |
| **B · Domain + SimpleLogin Premium** | ✅ | ✅ | ~₹2,500/yr | Low | Cleanest UX, but custom domain is a paid tier on top of the domain. |
| **Placeholder · SimpleLogin Free** | ✅ | ✅ | ₹0 (no domain) | Low | Address is `…@simplelogin.com` (non-branded). Reply-from + unlimited bandwidth on free. Good only as a stop-gap. |
| ~~Addy.io Free~~ | ✅ | ❌ | — | — | "Reply/Send-from" is **paid only** and bandwidth is 10 MB/mo — disqualified for replies. |

**Recommendation:** **Path C (Domain + Zoho Mail Free)** — branded, send+receive, ₹0 beyond the
domain, one service. Use **Path A** instead if you specifically want it to live inside your existing
Gmail. Ship a **SimpleLogin free** alias as a placeholder if launching before the domain is sorted.

---

## Setup outline (Path C — recommended)

1. **Register a domain** (e.g. via Cloudflare Registrar, at cost) — pick an available brandable
   name (`penny.com` is taken; consider `trypenny.app`, `getpenny.in`, etc.).
2. **Add the domain to Cloudflare** (nameservers → Cloudflare; free).
3. **Sign up Zoho Mail (Forever Free plan)**, add the domain, verify it (TXT record), create the
   `support@<domain>` mailbox.
4. **Add Zoho's MX + SPF + DKIM records** in Cloudflare DNS (Zoho gives the exact values).
5. Access via Zoho webmail / mobile app. Send + receive as `support@<domain>` — done.

### Setup outline (Path A — Gmail-centric, all-free)

1–2. Domain on Cloudflare (as above).
3. **Cloudflare → Email Routing:** create `support@<domain>` → forward to your real inbox. (Receiving done.)
4. **Free SMTP relay** (e.g. Brevo): verify the domain, add its SPF/DKIM records in Cloudflare DNS.
5. **Gmail → Settings → Accounts → "Send mail as":** add `support@<domain>`, using the relay's SMTP
   host/credentials. Now replies go out as the branded address.

> Cloudflare Email Routing is **inbound only** — it cannot send. That's why Path A needs the relay
> for the outbound (reply) leg.

---

## App wiring (when M14 lands)

- Store the address as a single config/constant (or `VITE_SUPPORT_EMAIL`), not hardcoded across the UI.
- The Contact screen can `mailto:` the address, or POST to a lightweight form handler that emails it.
- Swapping the placeholder for the branded address later = change one value, no code churn.

---

## Cloudflare free-tier context (for reference)

- **Email Routing:** free, unlimited inbound forwarding (needs the domain on Cloudflare). Inbound only.
- Free tier is **perpetual** and resets daily; adding a domain/zone is free and doesn't consume any
  Workers/KV/D1 quota. See `workers/api-proxy/README.md` for the proxy worker's own limits.
