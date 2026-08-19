// Single source of truth for "resolve a typed name to a Person, creating one if needed" — the
// personal-IOU person picker's core/expense-form's Lent-Borrowed panel/bank-import's bulk-share flow
// all need this exact operation. Before 2026-08-18 it was independently reimplemented three times
// (apps/mobile/src/features/iou/useIou.ts, apps/mobile/src/features/expenses/useExpenses.ts, and
// apps/mobile/src/features/bank-import/useBankImport.ts's `resolvePerson`), each matching against its
// OWN hook instance's in-memory `persons` array — a snapshot from that hook's own mount/last reload.
// A person created via one screen (e.g. the expense form's Lent/Borrowed panel) was invisible to
// another screen's already-mounted hook (e.g. the IOU tab) until that hook happened to reload, so
// typing the same name on both created two separate `Person` rows instead of resolving to one. This
// function always re-reads `personsRepo` fresh, never a caller-supplied array, which is what actually
// fixes it — bank-import's own `resolvePerson` already did this correctly (a fresh `getAll()` before
// resolving), and is the reference this generalizes from.
import { personsRepo } from '@/core/db/repositories';
import type { Person } from '@/core/db/types';

export interface ResolvedPerson {
  person: Person;
  /** True only when no case-insensitive name match existed at all — a brand-new Person was created. */
  created: boolean;
  /** True when an existing soft-archived Person matched and was revived (isArchived reset to false)
   *  rather than a new Person being created alongside it. */
  revived: boolean;
}

/**
 * Resolve `name` to an existing Person (case-insensitive match on `name`) or create a new one.
 * Reads `personsRepo` fresh on every call — see the file header for why that matters. Revives a
 * soft-archived match instead of creating a duplicate active Person for the same name.
 *
 * Pure side effect: persists a create/revive via `personsRepo.put` when needed; does no logging and
 * no React-state reload — callers that keep their own `persons` list (via `useRepository`/
 * `useLoggedRepository`) are still responsible for reloading it, and for any activity-log entry they
 * want recorded, using `created`/`revived` to tell which happened.
 */
export async function getOrCreatePerson(name: string): Promise<ResolvedPerson> {
  const trimmed = name.trim();
  const persons = await personsRepo.getAll();
  const existing = persons.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const now = Date.now();

  if (existing && !existing.isArchived) {
    return { person: existing, created: false, revived: false };
  }

  if (existing) {
    const revived: Person = { ...existing, isArchived: false, updatedAt: now };
    await personsRepo.put(revived);
    return { person: revived, created: false, revived: true };
  }

  const person: Person = { id: crypto.randomUUID(), name: trimmed, createdAt: now, updatedAt: now };
  await personsRepo.put(person);
  return { person, created: true, revived: false };
}
