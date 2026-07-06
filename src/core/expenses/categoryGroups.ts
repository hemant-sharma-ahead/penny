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

/**
 * Intent groups that default to hidden in Safe Mode — income, money moved between your own
 * accounts, and categories people tend to keep private (family support, legal matters, sin
 * goods, investments) — everyday spending (groceries, dining, transport, ...) defaults visible.
 * Only applies when a category hasn't been explicitly toggled; see `isHiddenInSafeMode`.
 */
const DEFAULT_HIDDEN_INTENT_GROUPS = new Set([
  'income',
  'transfers',
  'family_giving',
  'legal',
  'sin_goods',
  'financial'
]);

/**
 * Resolves whether a category is hidden in Safe Mode: an explicit `hideInSafeMode` always wins;
 * otherwise falls back to the intent-group default (see `DEFAULT_HIDDEN_INTENT_GROUPS`). Custom
 * user-created categories/groups have no group default and stay visible until toggled.
 */
export function isHiddenInSafeMode(cat: Pick<ExpenseCategory, 'hideInSafeMode' | 'parentId' | 'intentGroup'>): boolean {
  if (cat.hideInSafeMode !== undefined) return cat.hideInSafeMode;
  return !cat.parentId && !!cat.intentGroup && DEFAULT_HIDDEN_INTENT_GROUPS.has(cat.intentGroup);
}
