export type TransactionType = 'expense' | 'income' | 'transfer';

export type AccountOption = {
  id: number;
  name: string;
  currency: string;
};

export type CategoryOption = {
  id: number;
  name: string;
  type: 'expense' | 'income';
};