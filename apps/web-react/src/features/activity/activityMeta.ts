import { STATUS } from '@/lib/statusColors';
import type { ActivityAction } from '@/core/db/types';

export const ACTION_META: Record<ActivityAction, { icon: string; color: string }> = {
  CREATE: { icon: 'ti-plus', color: STATUS.success },
  UPDATE: { icon: 'ti-pencil', color: STATUS.info },
  DELETE: { icon: 'ti-trash', color: STATUS.danger },
  BULK_DELETE: { icon: 'ti-trash', color: STATUS.danger },
  BULK_MOVE: { icon: 'ti-arrow-move-right', color: STATUS.info },
  BULK_UPDATE: { icon: 'ti-edit', color: STATUS.info },
  MERGE: { icon: 'ti-arrows-join', color: STATUS.info },
  IMPORT: { icon: 'ti-file-import', color: STATUS.info },
  RESTORE: { icon: 'ti-arrow-back-up', color: STATUS.success },
  CHECKPOINT: { icon: 'ti-flag', color: STATUS.neutral }
};

/** 'categoryId' → 'category', 'limitAmount' → 'limit amount'. */
export function prettifyField(field: string): string {
  return field
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
