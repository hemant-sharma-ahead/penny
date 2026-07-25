import type { ActivityAction } from '@/core/db/types';
import type { ThemeTokens } from '@penny/core/theme/tokens';

/**
 * RN port of apps/web-legacy/src/features/activity/activityMeta.ts. Web's `ACTION_META` is a static
 * object built from `@/lib/statusColors`'s `STATUS` — literal CSS var strings with no RN equivalent.
 * Same fix pattern IOU already needed for its own status colors (see docs/plans/mobile-migration.md's
 * Track 4 progress log — "STATUS's colors are literal CSS var strings that silently failed"): this
 * becomes a function of the real theme tokens instead of a module-level constant, called from inside a
 * component with `useThemeColors()`.
 */
export function getActionMeta(theme: ThemeTokens): Record<ActivityAction, { icon: string; color: string }> {
  return {
    CREATE: { icon: 'ti-plus', color: theme.success },
    UPDATE: { icon: 'ti-pencil', color: theme.info },
    DELETE: { icon: 'ti-trash', color: theme.danger },
    BULK_DELETE: { icon: 'ti-trash', color: theme.danger },
    BULK_MOVE: { icon: 'ti-arrow-move-right', color: theme.info },
    BULK_UPDATE: { icon: 'ti-edit', color: theme.info },
    MERGE: { icon: 'ti-arrows-join', color: theme.info },
    IMPORT: { icon: 'ti-file-import', color: theme.info },
    RESTORE: { icon: 'ti-arrow-back-up', color: theme.success },
    CHECKPOINT: { icon: 'ti-flag', color: theme.neutral }
  };
}

/** 'categoryId' → 'category', 'limitAmount' → 'limit amount'. Pure string logic — unchanged from web. */
export function prettifyField(field: string): string {
  return field
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
