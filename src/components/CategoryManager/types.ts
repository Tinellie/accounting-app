import type { CategoryActionState } from '@/app/categories/actions';

export type CategoryRecord = {
  id: number;
  name: string;
  type: 'expense' | 'income';
  parentId: number | null;
  color: string | null;
  sortOrder: number;
};

export type CategoryManagerProps = {
  categories: CategoryRecord[];
};

export const initialActionState: CategoryActionState = { success: false, message: '' };

export const categoryTypes: { value: CategoryRecord['type']; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
];