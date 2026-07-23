# Penny — UI Design Guidelines

**The single source of truth for UI design in Penny** — principles, patterns, interaction rules, themes, colours, and the proposal workflow. **Read this before designing or adjusting any screen.** Keep it current: whenever a new UI pattern or rule emerges, add it here (don't scatter design rules across CLAUDE.md / ARCHITECTURE.md).

**Visual reference:** static prototypes live in [`docs/mockups/`](mockups/) (design-of-record) and [`docs/mockups/proposals/`](mockups/proposals/) (work-in-progress proposals).

**Last updated:** July 2026.

---

## 1. Design ethos (the intent)

The product direction is: _appealing, minimalistic, modern, inviting, user-friendly — and above all **uncluttered**._ These concrete principles make those adjectives enforceable, and apply to **every screen** across the app.

- **Uncluttered first.** Every screen has one primary job — show that, defer the rest. Prefer whitespace and a short list over dense grids; if a surface feels busy, remove or collapse before adding. One clear primary action per screen; secondary actions are quiet (ghost/icon), not competing.
- **Progressive disclosure = the real minimalism.** Smart defaults that just work (e.g. "Equal split by default, power on demand"); advanced controls stay hidden until asked for. **Reuse patterns the user already knows** rather than inventing new ones.
- **Colour is wayfinding, not decoration.** Context/identity is signalled by colour (e.g. a group's colour tints the context bar + centre FAB; a selected option fills with `--color-primary`), so "where am I / what's selected?" is answered before reading. Semantic tokens only.
- **Calm, glanceable hierarchy.** One big number + a small plain-language sub-label (`₹3,200 · you're owed`). Plain language over jargon. Soft `color-mix` tints instead of hard borders.
- **Spatial stability builds trust.** Nav never changes; header + nav always visible; modals centred. Predictability is a feature — especially for a money app.
- **Positive zero/empty states.** `₹0` reads as "settled up" (a win), not an empty void.
- **Trust cues woven in.** Privacy shield, opt-in "record to account", "you owe / you're owed" — for finance, _inviting_ also means _trustworthy_.
- **Honest & accurate.** Copy must match the real implementation (e.g. describe the actual envelope encryption, not a simplification that's wrong). Previews/mockups must reflect the **real** screen, never an invented layout.
- **Locale-native by default.** `en-IN` lakh formatting (₹18.4L, ₹2,14,900); ₹ everywhere. It should feel built _for_ an Indian user.

---

## 2. Navigation & layout rules

- **Full-screen, single-scroll over hidden navigation.** Prefer a single scrolling page with grouped sections over **tabs / sub-screens / drawers that bury content or add clicks**. (Settings is a full-screen single-scroll page for exactly this reason.)
- **Every sub-page has a `PageHeader` with a back button** (`leading` = ghost `ti-arrow-left` → `navigate(-1)`). No page should strand the user.
- **App chrome is fixed:** bottom nav (Home · Portfolio · Chip FAB · Expenses · Goals) never changes; header + context bar always visible.
- **Isolate destructive actions** in a red-tinted "Danger zone" group at the bottom, with a tap-again / confirm step.

### Modal principles

- **No bottom sheets.** All modals appear **centred** between the app header and bottom nav.
- **Always-visible header + nav** — use `paddingTop: 56, paddingBottom: 72` on fixed overlays.
- **Horizontal margin** — `px-4` on the overlay, `max-w-[430px]` on the card.
- **Scrollable body** — long content scrolls inside the card (`overflow-y-auto flex-1`).
- **Z-index ladder:** bottom nav `z-50` → app header `z-40` → modals `z-60` → nested modals `z-70` → third-tier modals `z-80` (e.g. category/parent editors opened from the category picker). `Modal` / `ConfirmDialog` accept `level={1|2|3}`.

---

## 3. Reusable UI patterns (the building blocks)

Use these shared building blocks so a new screen feels familiar. Cohesion across screens is a feature.

> **Keep shared controls in sync.** When you introduce or change a control that appears in more than one place (icon, colour, label, behaviour), update **every** instance — or flag it. Example: the privacy-mode iconography (eye-off = Safe · shield = Private · eye = Open, on `--color-safe/privacy/open`) lives in both the header switcher and the Settings "default mode" control; they must match.

- **Identity hero** — avatar (photo → initials fallback, with a camera affordance) + name + `@handle · Plan` + a status pill (e.g. "✓ Claimed" / "Not claimed yet"). Used on Settings and Edit Profile.
- **Grouped cards + section labels** — an uppercase tertiary section label, then a `bg-surface` rounded card of **hairline-separated rows** (icon + label + trailing control/chevron).
- **In-field labels** — a small label _inside_ the field with the value beneath; contextual actions (Change / Claim / an age-band chip) sit on the label row. This is the concise default for forms — avoids a separate label line.
- **Icon-tile selector** — a rounded icon **container** with the label **below / outside** it (never a caption crammed under a tiny icon). Two variants: (1) **toggle tiles** (Settings modules, Employment) — off state is outlined/muted, selected = filled with `--color-primary`; (2) **identity-colour tiles** (expense categories, accounts, payment modes) — always filled with the item's own colour (domain data, like intent-group colours — the documented exception to semantic-tokens-only), since many are visible at once and the colour itself carries meaning; "selected" is shown as a ring around the tile, not a fill change. A horizontally-scrollable row of these tiles (`QuickPickRow` in `CategoryPickerModal.tsx`) is the pattern for a **quick-pick shortcut** above a longer grouped list — used for "Frequent" (usage-ranked) and context-driven picks like "Travel picks" during an active Vacation event.
- **Live, visual controls** — show the effect, don't just name it: theme **swatches rendering the real palette**, an **"Aa" scale** at actual sizes, live "you're owed ₹X" math, an availability check while typing a handle.
- **State-aware sections** — render the right state inline (claimed / unclaimed / editing) with inline edit + live validation, rather than routing to a separate screen.

---

## 4. Themes

Four visual themes, set via `data-theme` on `<body>` (managed by `SettingsContext`, see `src/index.css`):
**Light** · **Penny Blue** (navy `#1F3864` brand palette — `data-theme=blue`) · **Dark** (neutral slate/black) · **System** (resolves the OS preference to Light or true Dark — never Penny Blue, which is a deliberate manual pick). The legacy `dark` setting (the navy palette) auto-migrates to `blue` once on load. **Design for all four** — never hardcode colours that break a theme.

---

## 5. Design tokens

```css
--color-primary: #00a86b; /* Penny green */
--color-safe: #f59e0b; /* Amber — Safe mode */
--color-privacy: #7c3aed; /* Violet — Privacy mode */
--color-open: #dc2626; /* Red — Open mode */
```

### Semantic theme utilities (never use hardcoded Tailwind colours)

| Class            | What it does                                       |
| ---------------- | -------------------------------------------------- |
| `bg-surface`     | Card / panel background                            |
| `bg-surface-2`   | Slightly deeper background                         |
| `bg-surface-3`   | Body / page background                             |
| `text-primary`   | Primary text                                       |
| `text-secondary` | Secondary / label text                             |
| `text-tertiary`  | Muted / placeholder text                           |
| `border-theme`   | Standard border color                              |
| `surface`        | Shorthand: `bg-surface` + `1px solid border-theme` |
| `input-surface`  | Input bg + text + border-color                     |

### Status colors (never hardcode `#10b981`/`#ef4444`/`#f59e0b`/`#3b82f6`)

Semantic status tokens: `--color-success` / `--color-danger` / `--color-warning` / `--color-info` / `--color-neutral`.

- **Classes:** `text-success|danger|warning|info` and `bg-{success|danger|warning|info}-subtle` (theme-aware via `color-mix`).
- **Props / inline styles:** `STATUS` map + `tint()` (subtle bg) + `ink()` (readable on-tint text) from [`src/lib/statusColors.ts`](../src/lib/statusColors.ts).
- **Pills → `<Badge color={STATUS.x}>`. Alert callouts → `<Banner variant="warning">`.** Domain/brand colours (category / asset / type accents) stay as data in `core/*/meta.ts` — these are the one allowed exception to "no hardcoded colours".

---

## 6. Design proposal workflow

When a screen's layout/design can be improved:

1. Build the improved layout as a **new static HTML mockup** in [`docs/mockups/proposals/`](mockups/proposals/) (e.g. `<screen>-vN.html`), in the style of the existing mockups.
2. **Ground it in the REAL screen** — read the actual source first; reflect its true structure/components, never an invented layout.
3. **Never edit an existing design-of-record mockup** (in `docs/mockups/`) without asking.
4. **No app-code changes from a proposal until the user approves it.** Flow: verify screen → propose mockup → user approves → implement.
5. Offer **multiple options** when exploring direction; refine the chosen one before building.

---

## 7. Extending these guidelines

This doc grows as the product does. When a new pattern, rule, or token emerges (or an old one changes), **update this file** — it's part of the documentation discipline. Keep design guidance here and nowhere else; other docs should link here rather than restate.
