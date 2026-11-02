import { z } from 'zod';
import type { AccountOption, CategoryOption } from '@/src/components/TransactionEntryForm/types';
import type { CreateTransactionInput } from '../validations';
import type { PreviewTransaction } from './types';
import { transactionDataSchema } from '../transaction-data';

export const previewEditSchema = z.object({
  id: z.number().int().negative(),
  type: z.enum(['expense', 'income']),
  amount: z.number().int().refine(Number.isSafeInteger).refine((value) => value !== 0),
  occurredAt: z.iso.datetime(),
  accountId: z.number().int().positive().refine(Number.isSafeInteger),
  categoryId: z.number().int().positive().refine(Number.isSafeInteger),
  notes: z.string().max(1000).nullable(),
  data: transactionDataSchema.default({}),
  manualReview: z.object({ fields: z.boolean(), category: z.boolean() }).strict(),
}).strict().refine((row) => row.type === 'expense' || row.amount > 0, '收入金额必须为正数');

export type PreviewEdit = z.infer<typeof previewEditSchema>;

export function updateRowSelection(current: Set<number>, id: number, selected: boolean, exclusive = false) {
  if (exclusive) return new Set([id]);
  const next = new Set(current);
  if (selected) next.add(id);
  else next.delete(id);
  return next;
}

export function activeOcrErrors(row: PreviewTransaction) {
  return row.manualReview?.fields ? [] : row.importDebug.errors;
}

export function hasActiveAiError(row: PreviewTransaction) {
  return !row.manualReview?.category && row.aiCategory?.status === 'error';
}

export function hasActiveAiWarning(row: PreviewTransaction) {
  return !row.manualReview?.category && row.aiCategory?.status === 'warning';
}

export function assignPreviewCategory(row: PreviewTransaction, category: CategoryOption, categories: CategoryOption[]): PreviewTransaction {
  if (category.type !== row.type) throw new Error('分类与交易收支类型不一致');
  return {
    ...row,
    categoryId: category.id, categoryName: category.name,
    categoryIcon: category.icon, categoryColor: category.color,
    categoryParentId: category.parentId,
    categoryParentColor: categories.find((parent) => parent.id === category.parentId)?.color ?? null,
    manualReview: { fields: row.manualReview?.fields ?? false, category: true },
  };
}

export function assignPreviewAccount(row: PreviewTransaction, account: AccountOption): PreviewTransaction {
  if (row.currencyMode !== 'account' && account.currency !== (row.currencyMode === 'HKD' ? 'HKD' : 'CNY')) {
    throw new Error(row.currencyMode === 'HKD' ? '支付宝(HK)账单只支持港币账户，不能转换币种' : '截图账单只支持人民币账户，不能转换币种');
  }
  return { ...row, accountId: account.id, accountName: account.name, currency: account.currency };
}

export function editPreviewRow(row: PreviewTransaction, input: CreateTransactionInput, accounts: AccountOption[], categories: CategoryOption[]) {
  if (input.type === 'transfer') throw new Error('截图导入不支持转账，请选择支出或收入');
  const account = accounts.find((item) => item.id === input.accountId);
  const category = categories.find((item) => item.id === input.categoryId);
  if (!account || !category) throw new Error('请选择有效的账户和分类');
  const updated = assignPreviewAccount(assignPreviewCategory({
    ...row, type: input.type, amount: input.amount, occurredAt: input.occurredAt,
    notes: input.notes || null, isRefund: input.type === 'expense' && input.amount < 0,
  }, category, categories), account);
  return { ...updated, manualReview: { fields: true, category: true } };
}

export function serializePreviewRows(rows: PreviewTransaction[]): PreviewEdit[] {
  return rows.map((row) => previewEditSchema.parse({
    id: row.id, type: row.type, amount: row.amount,
    occurredAt: row.occurredAt?.toISOString(), accountId: row.accountId,
    categoryId: row.categoryId, notes: row.notes, data: row.data,
    manualReview: { fields: row.manualReview?.fields ?? false, category: row.manualReview?.category ?? false },
  }));
}
