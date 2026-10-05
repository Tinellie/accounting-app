import type { CategoryActionState } from '@/app/categories/actions';

export type CategoryRecord = {
  id: number;
  code: string | null;
  name: string;
  type: 'expense' | 'income';
  parentId: number | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
};

export type CategoryManagerProps = {
  categories: CategoryRecord[];
  iconNames: string[];
};

export const initialActionState: CategoryActionState = { success: false, message: '' };

export const categoryTypes: { value: CategoryRecord['type']; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
];