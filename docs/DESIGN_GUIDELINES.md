# Penny — UI Design Guidelines

**The single source of truth for UI design in Penny** — principles, patterns, interaction rules, themes, colours, and the proposal workflow. **Read this before designing or adjusting any screen.** Keep it current: whenever a new UI pattern or rule emerges, add it here (don't scatter design rules across CLAUDE.md / ARCHITECTURE.md).

**Visual reference:** static prototypes live in [`docs/mockups/`](mockups/) (design-of-record) and [`docs/mockups/proposals/`](mockups/proposals/) (work-in-progress proposals).

**Last updated:** July 2026.

---

## 1. Design ethos (the intent)

The product direction is: _appealing, minimalistic, modern, inviting, user-friendly — and above all **uncluttered**._ These concrete principles make those adjectives enforceable, and apply to **every screen** across the app.

**The guiding question for every redesign: why do people fall back to some apps again and again?** Most finance apps look and feel the same — that sameness is the thing to design against. Answer that question for the screen in front of you before proposing a layout.

- **Privacy is the product, not a feature.** It's a lifestyle, not a checkbox — never something the user has to opt into or choose; it's the default, always. The user is always in control of their data and how it's used/shared, and privacy never comes at the cost of transparency — if something is masked, encrypted, or shared, the UI should make it legible _why_ and _how_, not just _that_.
- **Uncluttered first.** Every screen has one primary job — show that, defer the rest. Prefer whitespace and a short list over dense grids; if a surface feels busy, remove or collapse before adding. One clear primary action per screen; secondary actions are quiet (ghost/icon), not competing.
- **One capability, one control.** If the same action (e.g. "back up to Google Drive") is reachable from two separate cards/buttons on the same screen, that's clutter and a maintenance trap, not redundancy for convenience — consolidate into a single control (e.g. one destination-picker whose action button behaves per destination) rather than fixing bugs in both copies independently. Found the hard way on the Backup & Restore screen (2026-07-27): a dedicated "Back up to Google Drive" card duplicated what an Automatic Backup destination tab already did; several small bugs there were symptoms of the duplication itself, not independent issues. When a bug-fix pass on one screen turns up several small issues that all trace back to this same pattern, don't patch each location independently (a toast here, a disabled state there) — that cements the duplication. Stop and propose the consolidated design first.
- **No redundant information display.** If a stat is already shown in an always-visible header (e.g. an accordion's "67 ready · 0 attention · 2 duplicate" subheading), don't also render a separate summary card repeating the same numbers in the body — enrich the header instead of duplicating a card. Default to zero information duplication between a header and its own body; the same fact appearing twice on screen is a redesign signal, not two independent design choices. (Distinct from "one capability, one control" above — this is about duplicated _information display_, not a duplicated _action_.)
- **Progressive disclosure = the real minimalism.** Smart defaults that just work (e.g. "Equal split by default, power on demand"); advanced controls stay hidden until asked for. **Reuse patterns the user already knows** rather than inventing new ones.
- **Colour is wayfinding, not decoration.** Context/identity is signalled by colour (e.g. a group's color tints the context bar + centre FAB; a selected option fills with `--color-primary`), so "where am I / what's selected?" is answered before reading. Semantic tokens only.
- **Calm, glanceable hierarchy.** One big number + a small plain-language sub-label (`₹3,200 · you're owed`). Plain language over jargon. Soft `color-mix` tints instead of hard borders.
- **Spatial stability builds trust.** Nav never changes; header + nav always visible; modals centred. Predictability is a feature — especially for a money app.
- **Positive zero/empty states.** `₹0` reads as "settled up" (a win), not an empty void.
- **Trust cues woven in.** Privacy shield, opt-in "record to account", "you owe / you're owed" — for finance, _inviting_ also means _trustworthy_.
- **Honest & accurate.** Copy must match the real implementation (e.g. describe the actual envelope encryption, not a simplification that's wrong). Previews/mockups must reflect the **real** screen, never an invented layout.
- **Locale-native by default.** `en-IN` lakh formatting (₹18.4L, ₹2,14,900); ₹ everywhere. It should feel built _for_ an Indian user.
- **Research real reference apps before proposing a visual language — don't invent a generic palette from training-data intuition.** Use `WebSearch`/`WebFetch` against named, current, well-regarded apps in the category (for fintech: INDmoney, HDFC Bank's app, Brex, Mercury) before committing to colours/typography — an invented light "SaaS dashboard" palette (white/cream cards, pastel icon badges, indigo/violet accents) is the exact failure mode real fintech products avoid: distinctive apps commit hard to one specific, bold choice instead of a diluted palette of soft accents. **Dark mode is the default expectation for this category now, not just an option to offer** — a forced-light UI reads as low-quality/outdated to users of modern fintech apps.
- **First impression is the only impression.** The faster a new user reaches something real (the demo, their own data), the more likely they stick around — a long gauntlet of onboarding screens before any payoff is a bigger risk than skipping a step. Prefer fewer screens with smart defaults over a complete-but-slow setup wizard.
- **Show what the user needs most, first — and make the numbers motivate, not alarm.** For a money app this is survival: the most important number(s) go above the fold, unmissable, before anything else. Frame progress and shortfalls as something to _improve toward_ (see "Positive zero/empty states" above), never as a source of anxiety.
- **Space is earned, not wasted.** Prefer inline, concise fields over stacked label+input pairs — see "In-field labels" (§3) for the standard shape. Placeholder text should show a realistic example value, not just a generic hint, so the user knows the expected format at a glance.
- **Every colour must work in every theme.** A colour chosen against one theme's background (e.g. light yellow that's fine on dark but unreadable on light) is a bug, not a style choice — check contrast in both Light and Dark before shipping a new colour use (see §4).
- **Minimal clicks to anything.** Functionality is the second-most-important thing after the core promise above — a feature that exists but takes 4 taps to reach might as well not exist. When adding a feature, deliberately decide where it's discoverable from and keep that path short.

---

## 2. Navigation & layout rules

- **Full-screen, single-scroll over hidden navigation.** Prefer a single scrolling page with grouped sections over **tabs / sub-screens / drawers that bury content or add clicks**. (Settings is a full-screen single-scroll page for exactly this reason.)
- **Every sub-page has a back button and a title.** On `apps/web-react` (frozen) this is still each page's own `PageHeader` with `leading` = ghost `ti-arrow-left` → `navigate(-1)`. On `apps/mobile`, as of the 2026-08-01 chrome consolidation, this is no longer per-screen — every pushed screen's back-chevron and title live in the one global header (`MainTabs`' `HeaderLeft`/`HeaderCenter`); `PageHeader` on mobile now only renders what's genuinely screen-specific (a subtitle line, right-aligned actions, or free-form content) and renders nothing at all if a screen has none of those. No page should strand the user.
- **App chrome is fixed:** bottom nav (Home · Portfolio · Chip FAB · Expenses · Goals) never changes. On mobile, the persistent header shows avatar (tab roots) or a back-chevron (pushed screens) on the left, Privacy mode + Reminders on the right (always, regardless of depth), and a center slot that shows either the current screen's title, or — Home only — the "Personal ▾" context/group switcher (every other screen is always personal-scoped, so it never shows there). The header's background matches the screen's own body background exactly (no border/seam) so it reads as part of the screen, not a bar drawn on top of it.
- **Isolate destructive actions** in a red-tinted "Danger zone" group at the bottom, with a tap-again / confirm step.

### Modal principles

- **No bottom sheets.** All modals appear **centred** between the app header and bottom nav.
- **Always-visible header + nav** — use `paddingTop: 56, paddingBottom: 72` on fixed overlays.
- **Horizontal margin** — `px-4` on the overlay, `max-w-[430px]` on the card.
- **Scrollable body** — long content scrolls inside the card (`overflow-y-auto flex-1`).
- **Z-index ladder:** bottom nav `z-50` → app header `z-40` → modals `z-60` → nested modals `z-70` → third-tier modals `z-80` (e.g. category/parent editors opened from the category picker). `Modal` / `ConfirmDialog` accept `level={1|2|3}`.
- **Every popup/modal's close icon is always on the right.** Keep enforcing this — it's an established convention, not a per-modal choice.

**On `apps/mobile` (React Native, since Track 3 of the mobile migration):** the same "centred, never a bottom sheet" rule is implemented with RN's own `Modal` component (transparent + fade animation) plus a full-screen dim `Pressable` backdrop and a centred card — not a portal library (there's no DOM to portal into) and not a third-party bottom-sheet package. The `paddingTop: 56, paddingBottom: 72` gap and `level`/z-index ladder aren't needed on RN: `Modal` is already a separate native layer above everything, and multiple open modals stack in mount order automatically, so `apps/mobile/src/components/ui/Modal.tsx` dropped the `level`/`nested` props entirely. `SelectInput`'s dropdown (a DOM-positioned portal panel on web, measuring the trigger's bounding rect) is reimplemented as the same centred `Modal` with an option list on RN, for the same reason — there's no equivalent anchored-popover primitive, and reaching for one would violate "no bottom sheets" in spirit anyway.

---

## 3. Reusable UI patterns (the building blocks)

Use these shared building blocks so a new screen feels familiar. Cohesion across screens is a feature.

> **Keep shared controls in sync.** When you introduce or change a control that appears in more than one place (icon, colour, label, behaviour), update **every** instance — or flag it. Example: the privacy-mode iconography (eye-off = Safe · eye = Open, on `--color-safe`/`--color-open` — a third "shield = Private" mode was removed 2026-08-18, see §4) lives in the header `PrivacyModeSwitcher`; there's no separate Settings "default mode" control anymore either (removed alongside Private mode — Safe is always the fixed starting mode now).

- **Identity hero** — avatar (photo → initials fallback, with a camera affordance) + name + `@handle · Plan` + a status pill (e.g. "✓ Claimed" / "Not claimed yet"). Used on Settings and Edit Profile.
- **Grouped cards + section labels** — an uppercase tertiary section label, then a `bg-surface` rounded card of **hairline-separated rows** (icon + label + trailing control/chevron); the first row in a card skips its own top divider so it doesn't double up with the card's outer border. `apps/mobile`'s Settings (redesigned 2026-08-01) is the reference implementation — one accent colour per **section**, not per row (`theme.warning`/`privacy`/`info`/`neutral`/`danger` for Frequent/Security/Appearance/Data/Danger), since these rows don't carry distinct app-wide meaning the way, say, income/expense colours do — see "Colour is wayfinding, not decoration" in §1.
- **Display-only status pills** — a small glanceable chip (icon + label + current value, e.g. "Theme · Dark") with **no press action at all**. Used for an at-a-glance summary strip (Settings' Privacy/Theme/PIN row) where the real control is a short scroll below — deliberately not a shortcut/popup trigger, so it can't be mistaken for hidden navigation. If a screen needs the pill to _also_ be a shortcut, that's a different, more committed pattern (needs its own review) — don't casually add `onPress` to what's meant to read as a passive summary.
- **In-field labels** — a small label _inside_ the field with the value beneath; contextual actions (Change / Claim / an age-band chip) sit on the label row. This is the concise default for forms — avoids a separate label line.
- **Icon-tile selector** — a rounded icon **container** with the label **below / outside** it (never a caption crammed under a tiny icon). Two variants: (1) **toggle tiles** (Employment) — off state is outlined/muted, selected = filled with `--color-primary`; (2) **identity-colour tiles** (expense categories, accounts, payment modes) — always filled with the item's own colour (domain data, like intent-group colours — the documented exception to semantic-tokens-only), since many are visible at once and the colour itself carries meaning; "selected" is shown as a ring around the tile, not a fill change. A horizontally-scrollable row of these tiles (`QuickPickRow` in `CategoryPickerModal.tsx`) is the pattern for a **quick-pick shortcut** above a longer grouped list — used for "Frequent" (usage-ranked) and context-driven picks like "Travel picks" during an active Vacation event.
- **Live, visual controls** — show the effect, don't just name it: theme **swatches rendering the real palette**, an **"Aa" scale** at actual sizes, live "you're owed ₹X" math, an availability check while typing a handle. **Exception, made deliberately:** `apps/mobile`'s Settings Theme/Text Size (2026-08-01 follow-up) traded this away on purpose — a live-palette swatch grid and a real-size "Aa" grid were both mocked up and rejected as too busy for that card, replaced with a compact `Row` + icon-only/short-label `CompactSegmentedControl`. Don't treat that as license to drop live previews elsewhere; it was a considered tradeoff for one specific card, not a new default.
- **Compact segmented control** — a small fixed-width segmented control (icon-only or short-label segments, filled `theme.primary` on the active one) that lives in a `Row`'s trailing slot instead of its own multi-line block — `apps/mobile`'s Settings Theme/Text Size rows. Use when a control's options are well-known/few enough that a live preview isn't pulling its weight (contrast with the "Live, visual controls" bullet above, which is still the default elsewhere).
- **State-aware sections** — render the right state inline (claimed / unclaimed / editing) with inline edit + live validation, rather than routing to a separate screen.
- **Fused borderless hero with full-bleed chart** — two logically distinct pieces of information (e.g. Home's Net worth + Retirement Corpus) merged into **one** visual unit instead of two stacked cards: no card background/border on either piece; the smaller/label piece's text sits directly over the chart's own naturally-empty corner (e.g. before the curve rises into view) rather than above it in its own row. The chart itself is **full-bleed** (`-mx-4` to cancel the screen's own horizontal padding, edge to edge) — not boxed. Corner glow blooms + a diagonal light-sheen streak (rotated, low-opacity `expo-linear-gradient` band) give it depth without a literal card background — the same layered-sheen technique a colour-identity mini-card would use for its own background (reach for that fuller card-background treatment instead of this borderless one when the item has a strong per-item identity colour and deserves its own card weight, e.g. a list of colour-coded accounts; reach for _this_ pattern when two aggregate figures belong together as one glanceable unit and neither should visually dominate as "the card"). Tapping the overlaid text opens its own action (e.g. a breakdown modal) via a **nested `Pressable`** — RN's touch-responder system gives the innermost `Pressable` the touch, so no explicit stopPropagation call is needed; tapping anywhere else on the unit opens a different action (e.g. a drill-down). Reference implementation: `apps/mobile/src/features/home/GlanceHeader.tsx` + `RetirementCorpusChart.tsx` (2026-08-03) — see `docs/mockups/proposals/home-networth-projection-v4.html` for the approved mockup and `docs/features/home.md`'s "Retirement Corpus" section for the full writeup.
- **"Did You Know" tips — three tiers, never more than one at a time** (2026-08-16) — Penny's first
  user-education pattern (no coach-mark/tooltip convention existed before this). **Contextual nudge**: a
  small dismissible `Banner variant="info"` (`ti-bulb` icon), rendered exactly where a real, already-true
  condition makes it relevant (e.g. 3+ transactions selected) — fires once, ever, per fact; dismissed or
  acted upon both permanently suppress it. **Rotating/daily card**: same visual language (bulb icon,
  "Did you know?" eyebrow, tap-to-cycle), placed in a low-stakes ambient spot (Analytics' bottom, Tax's
  own screen) or, on Home specifically, a once-a-day sequential reveal at the very top of the screen
  (Home is the most-visited screen, so the daily habit earns its prominent placement there — a
  deliberate exception to "don't put ambient content above primary info"). **"Discover Penny" hub**: a
  full, always-browsable, searchable catalogue (Settings sub-page) — the one place every tip lives
  regardless of whether the other two tiers have shown it yet. Never stack more than one of these three
  on screen at once. Reference implementation: `apps/mobile/src/components/shared/TipNudgeBanner.tsx` /
  `DidYouKnowCard.tsx` / `DailyTipCard.tsx`, `apps/mobile/src/features/settings/DiscoverTipsPage.tsx` —
  see `docs/features/did-you-know-tips.md` for the full design and `docs/mockups/proposals/did-you-know-tips-v1.html`
  for the approved mockup.
- **Branded busy/loading indicator** — Penny's coin medallion (the same circular gold-gradient element `PennyWordmark` uses, not the full square `PennyLogo` icon with its horizon/sky background, which reads oddly mid-rotation) instead of a generic platform spinner. `apps/mobile/src/components/ui/PennyLoader.tsx`: `size="sm"` (20px) rotates continuously — wired into `Button.tsx`'s `loading` prop at this fixed size regardless of the button's own `size`; `size="lg"` (72px) pulses/breathes in place, for a standalone full-area busy state (initial sync, PDF/CSV parsing, a Chip request). `size` doubles as the animation-style selector on purpose — no separate `variant` prop until a screen makes a real case for a third treatment (a partial-ring sweep was proposed and explicitly deferred; see `docs/mockups/proposals/branded-busy-indicator-v1.html`). Mobile-only — `apps/web-react` is frozen and keeps its existing generic spinner un-mirrored.
- **~~Identity-colour gradient mini card~~ — superseded 2026-08-19, kept below for history only.**
  Was: a compact full-bleed card whose entire background was a dark gradient, with fixed
  white/translucent-white text and icon chips on top regardless of theme, plus "real card" sheen
  layers (corner glow, diagonal light streak, inset top highlight). `apps/mobile`'s Accounts list was
  the reference implementation through **v2** (2026-08-03, `docs/mockups/proposals/accounts-list-v1.html`'s
  "Direction D — Mini Cards v2": per-account gradient/glow drawn from a curated jewel-tone/green
  palette via `accountCardPalette(id, isCashLike)`, a deterministic hash of the account's `id`, with
  `cash`/`wallet` hard-clamped to the green subset). Reported on real devices as not following the
  theme, wasting space, and still not showing real bank icons everywhere — replaced (7 mockup concepts
  explored, `docs/mockups/proposals/account-list-redesign-v1.html` through `-v3.html`'s "✅ FINAL
  DIRECTION") by the current pattern below. `accountCardPalette`/`JEWEL_PALETTE`/`GREEN_PALETTE` in
  `~/lib/color.ts` and the gradient/sheen rendering in `AccountList.tsx` no longer exist — don't reuse
  them as a reference for new code.
- **Grouped flat list + tap-to-reveal actions** (current, 2026-08-19) — replaces the gradient mini card
  above for the same Accounts list. Accounts are grouped into fixed sections (Bank Accounts / Cash &
  Wallets / Credit Cards, a group skipped entirely if empty, never shown empty) inside one
  `bg-surface border border-theme rounded-2xl` container per group, each account a plain divided row
  (`border-t border-theme` between rows) — no gradient, no per-item hash-assigned colour, so it reads
  correctly in both light and dark without any "on-gradient" fixed-color text exception. Each row's
  balance carries a small `ti-dots-vertical` kebab that **tap-reveals** exactly the row's action icons
  (Import XOR Reconcile + Edit + Delete) below it, independently per row — nothing is ever shown
  pre-expanded, and revealing one row never collapses another. Whole-row tap (outside the kebab) still
  opens the transactions-for-this-account modal, unchanged from before. Real per-bank logos (`BankLogo.tsx`
  — HDFC/ICICI/Axis/HSBC so far, Simple Icons CC0 marks, never a fabricated lookalike) render inside the
  existing icon badge in place of the generic type icon when `account.bankId` matches; every other bank
  preset still falls back to the generic `Icon`/`account.color` combination. Reach for this
  grouped-flat-list + tap-to-reveal pattern for any list whose rows carry 3+ possible actions that don't
  all need to be visible at once — it keeps the resting row calm and dense without permanently hiding
  the actions behind a second screen.

---

## 4. Themes

Three visual themes on `apps/mobile` (`~/theme/ThemeProvider.tsx`): **Light** · **Dark** (neutral
slate/black) · **System** (resolves the OS preference to Light or Dark). **Design for all three** —
never hardcode colours that break a theme.

**Penny Blue removed 2026-07-31** (navy `#1F3864` brand palette) — it was one of the "overkill
features already implemented" flagged in that round's product-strategy review; anyone with it
persisted is migrated to Dark on next launch (`ThemeProvider.tsx`'s `loadThemePreference()`). The
`pennyBlue` palette data still exists in `packages/core/src/theme/tokens.ts` (kept for backward
compatibility, not selectable in the UI) — don't resurrect it as an option without checking that
decision first.

**Privacy Mode no longer changes theme colours** (also 2026-07-31) — Safe/Private/Open used to each
tint the header/background differently (amber/violet/red); that ambient tinting was removed by
deliberate decision so the app reads as one consistent Light/Dark palette regardless of mode. The
mode itself is unchanged (masking, the PIN-gated Open mode, `PrivacyModeSwitcher`'s icon) — it just no
longer repaints the screen. See `packages/core/src/theme/privacyModeColors.ts`'s
`getPrivacyModeColors()`.

**Privacy Mode collapsed from three states to two** (2026-08-18) — real-device testing found the
three-mode picker (Safe/Private/Open) plus Open mode's fixed-duration countdown badge overkill for
what people actually used. `apps/mobile`'s `PrivacyModeSwitcher` is now a plain Safe/Open toggle with
no countdown; `packages/core/src/theme/privacyModeColors.ts`'s 3-mode type is left untouched since
`apps/web-react` (frozen) still legitimately constructs `'privacy'`.

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

1. Build the improved layout as a **new static HTML mockup** in [`docs/mockups/proposals/`](mockups/proposals/) (e.g. `<screen>-vN.html`), in the style of the existing mockups. **Open it in the default browser immediately after writing it** (`open "<path>"`) — don't wait to be asked.
2. **Ground it in the REAL screen** — read the actual source first; reflect its true structure/components, never an invented layout. **On a first pass at a given screen, always include a "Current (today)" frame** in the same gallery, built to accurately match the real current screen (not just described — actually rendered), so there's something to visually compare the new options against. Once a "current" frame has served its purpose earlier in the same iteration thread, don't keep re-adding it every subsequent round.
3. **Never edit an existing design-of-record mockup** (in `docs/mockups/`) without asking.
4. **No app-code changes from a proposal until the user approves it.** Flow: verify screen → propose mockup → user approves → implement.
5. **Offer multiple, genuinely distinct options on a first pass** — different interaction models or visual languages, not placement variants of one idea (e.g. moving the same icon around a bar isn't 3 options, it's 1 option shown 3 ways). Once a _structure_ is approved and the user says something like "be intuitive" or pushes back on _feel_ rather than structure, stop presenting galleries — commit confidently to one refined, well-considered direction instead. If the same structural pattern gets rejected twice even after restyling, reconsider whether the pattern itself is the wrong assumption (e.g. the whole "top bar" paradigm), not just its styling.
6. **Reason through the user's own stated constraint to its conclusion, don't wait to be told the obvious follow-on.** If the user states a rule (e.g. "the rest of the app is always personal-scoped"), work out its downstream implications yourself in the next proposal — don't apply it narrowly and make them catch the gap you could have already closed.
7. **When the user shares a real screenshot of the actual running app, match its real colours/spacing/style — not an approximated generic palette.** A mockup that doesn't visually resemble the real app reads as generic regardless of how clever its structure is; pull real values from an actual screenshot or render whenever one is available.
8. When delegating a mockup iteration to the `ui-designer` agent, don't spawn a **fresh** agent instance to re-verify against source code that's already been read earlier in the same conversation — either do the next round directly, or resume the _same_ prior agent (preserves its context) rather than paying to re-read the same files again. Reserve a new `Agent` call for genuinely new scope.

---

## 7. Extending these guidelines

This doc grows as the product does. When a new pattern, rule, or token emerges (or an old one changes), **update this file** — it's part of the documentation discipline. Keep design guidance here and nowhere else; other docs should link here rather than restate.

---

## 8. Component & icon implementation notes

- **Use shared layout primitives, don't hand-roll them.** Every feature page starts with
  `<PageHeader>` (never hand-roll the title block); group divided list rows in
  `<ListContainer>`; title sections between cards/lists with `<SectionLabel>`.
- **For hairline dividers use `divide-[var(--color-border)]` — never `divide-theme`.**
  `divide-theme` is not a defined utility class; it silently falls back to `currentColor`
  instead of erroring, so the divider still renders (just as the wrong colour) and the bug
  is easy to miss in review.
- **No Tailwind classNames on primitives in feature files** — use semantic props
  (`variant="primary"`), not `className="py-3 rounded-xl bg-green-600"`.
- **One consistent font and one consistent icon style app-wide** — Tabler icons only
  (outline variants), one type family everywhere. Keep enforcing both; don't introduce a
  second icon set or typeface for a "just this once" case.
- **Tabler icons only** — `<Icon name="ti-name" />` (outline variants), never a filled
  icon or a custom SVG path.
- **Never make a user type an icon class.** Wherever a user picks an icon (categories,
  parents, etc.), use the visual `IconGridPicker` (curated grid + searchable Tabler set) —
  not a raw `ti-*` text input. The stored value is still a `ti-*` string underneath.
- **Category grouping goes through `groupKey`/`groupMeta`**
  (`packages/core/src/core/expenses/categoryGroups.ts`) — don't read a category's
  `intentGroup` field directly for display/filtering; a custom parent (`isGroup` + child
  `parentId`) overrides it.
