import { z } from 'zod';
import type { TransactionListItemData } from '../components/TransactionListItem';
import { toMinorUnits } from './money';

export type FilterTransaction = Pick<TransactionListItemData, 'id' | 'type' | 'amount' | 'currency' | 'notes' | 'accountId' | 'toAccountId' | 'occurredAt' | 'categoryId'>;
export type TransactionFilters = {
  description: string;
  types: FilterTransaction['type'][];
  accountIds: string[];
  categoryIds: string[];
  currency: string;
  convert: boolean;
  minimum: string;
  maximum: string;
  startDate: string;
  endDate: string;
};
export const initialTransactionFilters: TransactionFilters = {
  description: '', types: [], accountIds: [], categoryIds: [], currency: 'CNY', convert: true,
  minimum: '', maximum: '', startDate: '', endDate: '',
};

export const exchangeRateSchema = z.object({
  date: z.iso.date(), base: z.literal('CNY'),
  rates: z.record(z.string(), z.number().positive().finite()),
});
export type ExchangeRates = z.infer<typeof exchangeRateSchema>;

export function signedFilterAmount(row: FilterTransaction, currency: string, convert: boolean, rates: ExchangeRates | null) {
  const signed = row.type === 'expense' ? -row.amount : row.amount;
  if (row.currency === currency) return signed;
  if (!convert) return null;
  const source = row.currency === 'CNY' ? 1 : rates?.rates[row.currency];
  const target = currency === 'CNY' ? 1 : rates?.rates[currency];
  if (!source || !target) throw new Error(`缺少 ${row.currency} → ${currency} 汇率，请重试或关闭币值转换`);
  const amount = Math.sign(signed) * Math.round(Math.abs(signed) / source * target);
  if (!Number.isSafeInteger(amount)) throw new Error('换算金额超出安全范围');
  return amount;
}

function dayBoundary(value: string, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请选择有效日期');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('请选择有效日期');
  if (end) date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function filterTransactions<T extends FilterTransaction>(rows: T[], filters: TransactionFilters, rates: ExchangeRates | null) {
  const minimum = filters.minimum.trim() ? toMinorUnits(filters.minimum) : null;
  const maximum = filters.maximum.trim() ? toMinorUnits(filters.maximum) : null;
  if (minimum !== null && maximum !== null && minimum > maximum) throw new Error('最低金额不能大于最高金额');
  const start = filters.startDate ? dayBoundary(filters.startDate) : null;
  const end = filters.endDate ? dayBoundary(filters.endDate, true) : null;
  if (start !== null && end !== null && start >= end) throw new Error('开始日期不能晚于结束日期');
  const query = filters.description.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (query && !(row.notes ?? '').toLocaleLowerCase().includes(query)) return false;
    if (filters.types.length && !filters.types.includes(row.type)) return false;
    if (filters.categoryIds.length && (row.categoryId === null || !filters.categoryIds.includes(String(row.categoryId)))) return false;
    if (filters.accountIds.length && !filters.accountIds.includes(String(row.accountId))
      && !(row.type === 'transfer' && filters.accountIds.includes(String(row.toAccountId)))) return false;
    if (start !== null && row.occurredAt.getTime() < start) return false;
    if (end !== null && row.occurredAt.getTime() >= end) return false;
    if (!filters.convert && row.currency !== filters.currency) return false;
    if (minimum !== null || maximum !== null) {
      const amount = signedFilterAmount(row, filters.currency, filters.convert, rates);
      if (amount === null || (minimum !== null && amount < minimum) || (maximum !== null && amount > maximum)) return false;
    }
    return true;
  });
}

export function amountFilterExtent(rows: FilterTransaction[], filters: TransactionFilters, rates: ExchangeRates | null): [number, number] {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const row of rows) {
    const value = signedFilterAmount(row, filters.currency, filters.convert, rates);
    if (value === null) continue;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return Number.isFinite(minimum) ? [minimum, maximum] : [0, 0];
}
