---
name: documentation-maintenance
description: Determine exactly which Penny docs need updating after an implementation change, and draft those updates. Use at the end of any non-trivial implementation task, or when asked to "update the docs" / "make sure documentation is current."
---

# Documentation Maintenance

Formalizes `CLAUDE.md`'s "Documentation discipline" checklist into an actual procedure,
instead of a bullet list nobody's forced to run. Penny's docs have drifted before this was
written (a `CONTRIBUTING.md` that described a pre-monorepo repo layout for months; a
`docs/plans/mobile-migration.md` that grew to 2,500+ lines of undifferentiated narrative
before being restructured) — this exists so that doesn't happen again, one small change at
a time instead of one big overdue cleanup.

## Step 1. Identify what actually changed

Run `git diff` / `git status` (or review the specific files you just touched) to get the
real, concrete change — not a summary of intent. Categorize it:

- New feature / capability in an existing module → likely `docs/features/<module>.md`
- New Dexie store or field → `docs/SCHEMA.md`
- New file/directory/component/hook, or an architectural decision (why X over Y) →
  `docs/ARCHITECTURE.md`
- New UI pattern, rule, theme, or color token → `docs/DESIGN_GUIDELINES.md`
- A mobile-vs-web parity gap found or fixed → `docs/MOBILE_PARITY.md`
- A phase/track status change, or a new architectural decision affecting the roadmap →
  `docs/ROADMAP.md`
- A new non-negotiable rule (something that should block a future PR if violated) →
  `CLAUDE.md`'s own Non-negotiable rules if broad, or `CONTRIBUTING.md` if it's a
  build/architecture/TypeScript standard specifically
- Scope or approach change to an in-progress initiative → the relevant file under
  `docs/plans/`
- A new or changed external API call → `docs/EXTERNAL_APIS.md`
- A brand-new feature module with no doc yet → check `docs/README.md`'s feature-docs table
  for the "not yet documented" list before assuming one exists; create one using the
  template at the bottom of `docs/README.md` if it doesn't

A single change often touches 2-3 of these, not just one — don't stop at the first match.

## Step 2. Check before writing — don't duplicate

Before adding new content to any doc, grep for whether it's already covered somewhere
else. Two docs quietly saying almost-the-same-thing (and drifting apart over time) is
worse than one doc saying it once with a cross-link from the other. This is exactly what
happened before this skill existed: `docs/ROADMAP.md` had duplicated content from
`docs/ARCHITECTURE.md`'s "External APIs" section until one was slimmed to a pointer.

## Step 3. Match the existing doc's structure

Each doc type has an established shape — follow it, don't improvise a new one:

- `docs/features/*.md`: **What it is → User-facing capabilities → How it works → Current
  limitations → Planned improvements → Ideas welcome**, plus a **Mobile (`apps/mobile`)**
  section for platform-specific behavior/deviations (not a separate mobile-only doc).
- `docs/MOBILE_PARITY.md`: one row per module — Status/Last audited/Known gaps/Priority.
- `docs/ROADMAP.md`: three parts (Shipped / Decided-in-progress / Future ideas) — put new
  content in the right part, don't append to the end regardless of which part it belongs in.
- `docs/ARCHITECTURE.md`'s decision log: `### Decision: <short name>` followed by a
  `**Rationale (<context>):**` paragraph — matches the existing entries.

## Step 4. Write the updates

Keep additions proportional to what changed — a one-line bug fix might need one sentence
in a feature doc's "Current limitations" section, not a new subsection. A new architectural
decision deserves a real `### Decision:` entry with rationale, not just a status flip.

## Step 5. Verify no dangling references

If you removed or renamed a doc, grep the rest of the repo for links to it
(`grep -rln "old-doc-name.md" --include="*.md"`) before finishing — a broken cross-link is
its own small drift, same as stale content.
