// The single sanctioned path for putting IOU people into AI context.
import type { Person } from '@/core/db/types';

/**
 * Session-scoped map of `personId → "Person 1" | "Person 2" | …` for AI context.
 *
 * Person names and phone numbers are Category 1 PII and must NEVER reach AI raw. Any code that
 * builds AI context referencing IOU people must map ids to these ordinal labels first. Labels are
 * non-persistent and reassigned each call, so they don't enable long-term cross-session tracking
 * of which label is which person.
 */
export function assignOrdinalLabels(persons: Person[]): Map<string, string> {
  const map = new Map<string, string>();
  persons.forEach((p, i) => map.set(p.id, `Person ${i + 1}`));
  return map;
}
