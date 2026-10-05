export type TransactionType = 'expense' | 'income' | 'transfer';

export type AccountOption = {
  id: number;
  code: string | null;
  name: string;
  currency: string;
  type: 'checking' | 'savings' | 'credit' | 'cash' | 'other';
  icon: string | null;
};

export type CategoryOption = {
  id: number;
  code: string | null;
  name: string;
  type: 'expense' | 'income';
  parentId: number | null;
  sortOrder: number;
  icon: string | null;
  color: string | null;
};