import type { ExpenseCategory } from '@/core/db/types';

/** Category management data + mutations, threaded from useExpenses to the picker. */
export interface CategoryManager {
  parentCategoryMap: Map<string, ExpenseCategory>;
  txnCountByCategory: Map<string, number>;
  saveCategory: (cat: ExpenseCategory) => Promise<void>;
  moveTransactions: (sourceIds: string[], targetId: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  saveParent: (parent: ExpenseCategory) => Promise<void>;
  deleteParent: (id: string) => Promise<void>;
  createParentWithChildren: (parent: ExpenseCategory, children: ExpenseCategory[]) => Promise<void>;
}
