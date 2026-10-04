import type { AccountActionState } from '@/app/accounts/actions';

export type AccountRecord = {
  id: number;
  name: string;
  icon: string | null;
  type: 'checking' | 'savings' | 'credit' | 'cash' | 'other';
  balance: number;
  currency: string;
  isArchived: boolean;
};

export type AccountManagerProps = {
  accounts: AccountRecord[];
  icons: string[];
};

export const initialActionState: AccountActionState = { success: false, message: '' };

export const accountTypes: { value: AccountRecord['type']; label: string }[] = [
  { value: 'checking', label: '借记账户' },
  { value: 'savings', label: '储蓄账户' },
  { value: 'credit', label: '信用账户' },
  { value: 'cash', label: '现金' },
  { value: 'other', label: '其他' },
];