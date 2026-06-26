import type { ExpenseCategory } from '@/core/db/types';
import { INTENT_GROUP_META } from '@/core/db/defaultCategories';

export interface GroupMeta {
  label: string;
  color: string;
}

const FALLBACK: GroupMeta = { label: 'Other', color: '#6b7280' };

/**
 * The grouping key for a category in the picker / analytics / filters.
 * Custom categories sit under a user-created parent (parentId); default
 * categories fall back to their fixed intent group.
 */
export function groupKey(cat: ExpenseCategory): string {
  return cat.parentId ?? cat.intentGroup ?? 'other';
}

/**
 * Resolve a group key to its header label + color. A custom parent category
 * supplies its own name/color; otherwise the fixed INTENT_GROUP_META applies.
 */
export function groupMeta(key: string, parentCategoryMap: Map<string, ExpenseCategory>): GroupMeta {
  const parent = parentCategoryMap.get(key);
  if (parent) return { label: parent.name, color: parent.color };
  const fixed = INTENT_GROUP_META[key];
  if (fixed) return { label: fixed.label, color: fixed.color };
  return FALLBACK;
}

/** Map of id → category for categories flagged as parents (isGroup). */
export function buildParentCategoryMap(categories: ExpenseCategory[]): Map<string, ExpenseCategory> {
  return new Map(categories.filter((c) => c.isGroup).map((c) => [c.id, c]));
}
