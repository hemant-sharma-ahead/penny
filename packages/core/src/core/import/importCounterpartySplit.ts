// Counterparty sub-splitting for the CSV-import Categories wizard stage (2026-08-14 redesign, §7 of
// docs/plans/csv-expense-import-redesign.md). A single source category label can conflate genuinely
// different real-world things — e.g. MoneyView's "A/c to A/c" covers self-account transfers, lending,
// and repayments all under one label, even after the direction-aware fix
// (`resolveCategoriesDirectional`, importCategoryResolution.ts) separates expense from income.
//
// For any category already flagged transfer- or IOU-suspect, this sub-splits its rows by a normalized
// version of the row's own description (MoneyView's Merchant/Receiver/Sender column, already mapped as
// `description` — see FORMAT_SYNONYMS.moneyview in importParsers.ts) into independently-resolvable
// groups, tiered by confidence: a normalized match against an existing Person record is high-confidence
// (pre-fill candidate); no match falls back to an editable low-confidence candidate grouped by the raw
// text; rows with no clear counterparty at all (blank, or a generic self-transfer term) land in a
// residual group.
//
// Deliberately a NEW, standalone function/file — NOT a shared import from
// core/bank-import/normalization.ts's `normalizeNarration()`, even though the approach is adapted from
// it conceptually (strip reference-number noise, uppercase). The two import modules must stay
// code-isolated (see bank-import/types.ts's and useBankImport.ts's own "zero shared code" principle) so
// a bug fixed in one can never regress the other.
import type { Person } from '@/core/db/types';
import type { ParsedRow } from './importParsers';
import type { CategoryAction } from './importCategoryResolution';
import type { DirectionalCategoryResolution } from './importCategoryResolution';

/** Group key sentinel for rows with no clear counterparty — blank descriptions, or a generic
 *  self-transfer term that carries no real name at all. */
export const RESIDUAL_COUNTERPARTY_GROUP_KEY = '__residual__';
export const RESIDUAL_COUNTERPARTY_LABEL = '(no clear person)';

/** Generic terms that describe a self-transfer with no actual counterparty name — as opposed to a
 *  reference-number-shaped narration (e.g. "XFR REF 88213"), which still carries SOME distinguishing
 *  text and therefore becomes its own low-confidence candidate group rather than auto-landing here (see
 *  this file's own doc comment below on `splitByCounterparty` for why that distinction is a deliberate,
 *  narrower reading of the redesign doc's "reference-code narrations... land in the residual group by
 *  default" language — flagged explicitly in this task's write-up as a judgment call, not silently
 *  assumed). */
const GENERIC_SELF_TRANSFER_TERMS = new Set(['self', 'self transfer', 'own account', 'na', 'n/a', 'none', '-', 'cash']);

/** Small connector/reference words stripped when normalizing a counterparty candidate — a NEW, narrower
 *  list than bank-import's `CONNECTOR_KEYWORDS` (see file header comment for why this can't just import
 *  that one). */
const COUNTERPARTY_NOISE_WORDS = new Set(['REF', 'NO', 'ID', 'TXN', 'TRANSACTION', 'NUMBER']);

/** Normalizes a raw counterparty candidate for GROUPING (equality) purposes only — strips digits/
 *  punctuation (reference-number noise) and small connector words, uppercases what's left. The group's
 *  DISPLAY label is a separate, representative raw-text sample (see `splitByCounterparty`), not this
 *  normalized key, so a real name is never shown mangled. Returns '' when nothing alphabetic remains
 *  (e.g. a purely numeric reference) — callers treat that as "no clear counterparty". */
export function normalizeCounterparty(raw: string): string {
  const tokens = raw
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !COUNTERPARTY_NOISE_WORDS.has(t.toUpperCase()));
  return tokens.map((t) => t.toUpperCase()).join(' ');
}

function isResidualCandidate(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return GENERIC_SELF_TRANSFER_TERMS.has(trimmed.toLowerCase());
}

function mostFrequent(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/** True when a `DirectionalCategoryResolution` should be sub-split by counterparty at all — scoped,
 *  not universal (redesign doc §7): only transfer- or IOU-suspect categories, never a plain spend
 *  category like groceries. Investment-movement (§9.d) is deliberately EXCLUDED here — those rows don't
 *  have a real counterparty to split by in the same sense (it's a category-level flag, not a person). */
export function shouldSplitByCounterparty(
  resolution: Pick<DirectionalCategoryResolution, 'isTransferSuspect' | 'isIouSuspect'>
): boolean {
  return resolution.isTransferSuspect || resolution.isIouSuspect;
}

export interface CounterpartyGroup {
  /** The parent `DirectionalCategoryResolution.key` this group splits. */
  parentKey: string;
  /** Stable identity for this group within its parent — combine with `parentKey` for a full Categories-
   *  stage row key, e.g. `` `${parentKey}::${groupKey}` ``. */
  groupKey: string;
  /** What to show as this row's own label: the matched Person's name, a representative raw sample of
   *  the group's own text, or the residual label. */
  displayLabel: string;
  rowIndices: number[];
  count: number;
  confidence: 'high' | 'low' | 'residual';
  /** Set only for a 'high'-confidence match against an existing Person record. */
  personMatch?: { personId: string; personName: string };
  /** Starting suggestion for this row — inherited from the parent resolution's own suggestion
   *  (typically `kind: 'transfer'`). Chunk B's Categories-stage UI/IOU panel is expected to refine this
   *  per-group (e.g. defaulting a high-confidence match to Lending/Borrowed) — deliberately left as a
   *  plain inherited value here rather than this chunk guessing at IOU category/direction nuance that's
   *  explicitly out of this chunk's scope. */
  suggestion: CategoryAction;
}

/** Splits one `DirectionalCategoryResolution`'s rows into independently-resolvable counterparty groups
 *  (redesign doc §7) — surfaced as separate top-level rows directly in the Categories stage, per the
 *  doc's explicit decision, not deferred to the Transactions stage. Returns one group per distinct
 *  normalized counterparty candidate, plus (when present) one residual group for rows with no clear
 *  counterparty at all. Callers should gate on `shouldSplitByCounterparty` first — this function itself
 *  doesn't check `isTransferSuspect`/`isIouSuspect`, so it can be unit-tested against an arbitrary
 *  resolution shape.
 *
 *  @param candidateIndices Optional (2026-08-14, code-review perf fix) — when the caller already knows
 *    which indices belong to `parent` (e.g. from a single-pass `${sourceName}::${type}` grouping map
 *    built once for every resolution, rather than re-scanning the full `rows` array once PER
 *    resolution — see `useImport.ts`'s `categoryRowGroups`, whose non-split branch had the identical
 *    O(rows × resolutions) shape and was fixed the same way), pass just those indices instead of
 *    scanning every row in `rows` again here. Omit to fall back to the original full-scan behavior
 *    (still correct, just O(rows) per call instead of O(candidateIndices.length)) — existing callers
 *    that don't have a pre-built index are unaffected. */
export function splitByCounterparty(
  rows: ParsedRow[],
  parent: Pick<DirectionalCategoryResolution, 'key' | 'sourceName' | 'type' | 'suggestion'>,
  persons: Person[],
  candidateIndices?: number[]
): CounterpartyGroup[] {
  const groups = new Map<string, { rawSamples: string[]; rowIndices: number[] }>();

  const scanIndices = candidateIndices ?? rows.map((_, i) => i);
  scanIndices.forEach((index) => {
    const row = rows[index];
    if (!row) return;
    const sourceName = row.categoryName.trim() || 'Other';
    if (sourceName !== parent.sourceName || row.type !== parent.type) return;

    const raw = (row.description ?? '').trim();
    const residual = isResidualCandidate(raw);
    const normalized = residual ? '' : normalizeCounterparty(raw);
    const groupKey = residual || !normalized ? RESIDUAL_COUNTERPARTY_GROUP_KEY : normalized;

    const bucket = groups.get(groupKey) ?? { rawSamples: [], rowIndices: [] };
    bucket.rawSamples.push(raw);
    bucket.rowIndices.push(index);
    groups.set(groupKey, bucket);
  });

  const normalizedPersons = persons
    .filter((p) => !p.isArchived)
    .map((p) => ({ person: p, normalized: normalizeCounterparty(p.name) }));

  return Array.from(groups.entries())
    .map(([groupKey, { rawSamples, rowIndices }]) => {
      const isResidual = groupKey === RESIDUAL_COUNTERPARTY_GROUP_KEY;
      const representativeRaw = mostFrequent(rawSamples) ?? rawSamples[0] ?? '';
      const personMatch = isResidual
        ? undefined
        : normalizedPersons.find((p) => p.normalized === groupKey && p.normalized !== '');
      const confidence: CounterpartyGroup['confidence'] = isResidual ? 'residual' : personMatch ? 'high' : 'low';

      return {
        parentKey: parent.key,
        groupKey,
        displayLabel: isResidual
          ? RESIDUAL_COUNTERPARTY_LABEL
          : (personMatch?.person.name ?? (representativeRaw || RESIDUAL_COUNTERPARTY_LABEL)),
        rowIndices,
        count: rowIndices.length,
        confidence,
        ...(personMatch && { personMatch: { personId: personMatch.person.id, personName: personMatch.person.name } }),
        suggestion: parent.suggestion
      };
    })
    .sort((a, b) => b.count - a.count);
}
