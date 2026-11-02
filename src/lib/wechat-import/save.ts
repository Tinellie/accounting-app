import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '@/src/db';
import { accounts, categories, transactions, wechatImportBatches } from '../../db/schema';
import { createTransactionSchema, positiveIdSchema } from '../validations';
import { formatMinorUnits } from '../money';
import { previewEditSchema } from './preview';
import { transactionDataSchema } from '../transaction-data';

const saveRequestSchema = z.object({
  batchId: z.string().uuid(),
  accountId: positiveIdSchema.optional(),
  editedRows: z.array(previewEditSchema).min(1).max(300).optional(),
}).strict().refine((request) => request.editedRows
  ? request.accountId === undefined
  : request.accountId !== undefined, '请仅提交统一账户或逐行预览数据');

const rowSchema = z.object({
  id: z.number().int().negative(),
  type: z.enum(['expense', 'income']),
  amount: z.number().int().refine(Number.isSafeInteger).refine((value) => value !== 0),
  isRefund: z.boolean().optional(),
  occurredAt: z.iso.datetime(),
  categoryId: positiveIdSchema,
  notes: z.string().max(1000).nullable(),
  data: transactionDataSchema.default({}),
  currency: z.string(),
  importDebug: z.object({ errors: z.array(z.string()).max(0, '存在 OCR 识别错误') }),
  aiCategory: z.object({ status: z.enum(['success', 'warning']), errors: z.array(z.string()).max(0) }).optional(),
}).refine((row) => row.amount > 0
  ? !row.isRefund
  : row.type === 'expense' && row.isRefund === true, '退款必须是负金额的支出');
const batchSchema = z.object({
  batchId: z.string().uuid(),
  transactions: z.array(rowSchema).min(1).max(300),
}).refine((batch) => new Set(batch.transactions.map(({ id }) => id)).size === batch.transactions.length, '交易行编号重复');

export class ImportSaveError extends Error {}

export type SaveImportResult = {
  success: true;
  message: string;
  count: number;
  alreadySaved: boolean;
};

export async function saveImportedBatch(
  database: typeof db,
  input: unknown,
  debugRoot: string,
): Promise<SaveImportResult> {
  const request = saveRequestSchema.safeParse(input);
  if (!request.success) throw new ImportSaveError('请选择有效账户并提交有效的导入批次');
  const { batchId, accountId, editedRows } = request.data;
  let contents: string;
  try {
    contents = await readFile(path.join(debugRoot, batchId, 'result.json'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new ImportSaveError('导入批次不存在或调试文件已被清理，请重新识别');
    }
    throw error;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch (error) {
    if (error instanceof SyntaxError) throw new ImportSaveError('导入批次数据损坏，请重新识别');
    throw error;
  }
  const identity = z.object({ source: z.enum(['wechat', 'alipay', 'alipay-hk', 'cmb', 'hangseng', 'hangseng-bank']).optional() }).safeParse(raw);
  const accountCurrency = identity.success && (identity.data.source === 'hangseng' || identity.data.source === 'hangseng-bank');
  const expectedCurrency = identity.success && identity.data.source === 'alipay-hk' ? 'HKD' : 'CNY';
  if (editedRows) {
    const source = z.object({
      batchId: z.string().uuid(),
      transactions: z.array(z.object({
        id: z.number().int().negative(),
        importDebug: z.object({ errors: z.array(z.string()) }),
        aiCategory: z.object({
          status: z.enum(['success', 'warning', 'error']), errors: z.array(z.string()),
        }).optional(),
      })).min(1).max(300),
    }).safeParse(raw);
    if (!source.success || source.data.batchId !== batchId
      || new Set(source.data.transactions.map((row) => row.id)).size !== source.data.transactions.length
      || new Set(editedRows.map((row) => row.id)).size !== editedRows.length) {
      throw new ImportSaveError('原始批次或预览编号无效，请重新识别');
    }
    raw = {
      batchId,
      transactions: editedRows.map((edit) => {
        const original = source.data.transactions.find((row) => row.id === edit.id);
        if (!original) throw new ImportSaveError('预览包含不属于本批次的交易编号');
        return {
          ...edit,
          currency: expectedCurrency,
          isRefund: edit.type === 'expense' && edit.amount < 0,
          importDebug: { errors: edit.manualReview.fields ? [] : original.importDebug.errors },
          aiCategory: edit.manualReview.category ? undefined : original.aiCategory,
        };
      }),
    };
  }
  const parsed = batchSchema.safeParse(raw);
  if (!parsed.success || parsed.data.batchId !== batchId
    || (!accountCurrency && parsed.data.transactions.some((row) => row.currency !== expectedCurrency))) {
    throw new ImportSaveError('批次中存在红色错误或无效金额、日期、分类，请重新识别后再保存');
  }
  const rows = parsed.data.transactions.map((row, index) => {
    const targetAccountId = editedRows?.find((edit) => edit.id === row.id)?.accountId ?? accountId;
    const validated = createTransactionSchema.safeParse({
      type: row.type,
      amount: formatMinorUnits(row.amount),
      occurredAt: row.occurredAt,
      accountId: targetAccountId,
      toAccountId: null,
      categoryId: row.categoryId,
      notes: row.notes ?? '',
    });
    if (!validated.success) throw new ImportSaveError(`第 ${index + 1} 笔交易无效：${validated.error.issues[0]?.message ?? '请重新识别'}`);
    return { ...validated.data, data: row.data };
  });

  return database.transaction((tx) => {
    // This additive table also supports existing installations without a schema push.
    tx.run(sql`CREATE TABLE IF NOT EXISTS wechat_import_batches (
      batch_id TEXT PRIMARY KEY NOT NULL,
      account_id INTEGER NOT NULL,
      transaction_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    const previous = tx.select().from(wechatImportBatches).where(eq(wechatImportBatches.batchId, batchId)).get();
    if (previous) {
      if (previous.accountId !== (accountId ?? rows[0].accountId)) throw new ImportSaveError('本批次已保存到其他账户，不能重复导入');
      return { success: true, count: previous.transactionCount, alreadySaved: true, message: `本批次 ${previous.transactionCount} 笔交易已保存，未重复入账` };
    }
    const accountIds = [...new Set(rows.map((row) => row.accountId))];
    const currentAccounts = tx.select().from(accounts).where(inArray(accounts.id, accountIds)).all();
    if (currentAccounts.length !== accountIds.length || currentAccounts.some((account) => account.isArchived)) {
      throw new ImportSaveError('所选账户不存在或已归档，请重新选择');
    }
    if (!accountCurrency && currentAccounts.some((account) => account.currency !== expectedCurrency)) {
      throw new ImportSaveError(expectedCurrency === 'HKD' ? '支付宝(HK)账单金额为 HKD，请选择港币账户；暂不支持汇率转换'
        : '截图账单金额为 CNY，请选择人民币账户；暂不支持汇率转换');
    }
    const categoryIds = [...new Set(rows.map((row) => row.categoryId).filter((id): id is number => id !== null))];
    const currentCategories = tx.select().from(categories).where(inArray(categories.id, categoryIds)).all();
    const deltas = new Map<number, number>();
    for (const [index, row] of rows.entries()) {
      const category = currentCategories.find(({ id }) => id === row.categoryId);
      if (!category || category.type !== row.type) throw new ImportSaveError(`第 ${index + 1} 笔交易的分类不存在或收支类型已改变，请重新识别`);
      const delta = (deltas.get(row.accountId) ?? 0) + (row.type === 'income' ? row.amount : -row.amount);
      if (!Number.isSafeInteger(delta)) throw new ImportSaveError('交易合计金额超出安全范围');
      deltas.set(row.accountId, delta);
    }
    const balances = currentAccounts.map((account) => {
      const balance = account.balance + (deltas.get(account.id) ?? 0);
      if (!Number.isSafeInteger(balance)) throw new ImportSaveError('保存后的账户余额超出安全范围');
      return { id: account.id, balance };
    });
    tx.insert(wechatImportBatches).values({ batchId, accountId: rows[0].accountId, transactionCount: rows.length }).run();
    for (const row of rows) {
      tx.insert(transactions).values({
        type: row.type,
        amount: row.amount,
        occurredAt: row.occurredAt,
        accountId: row.accountId,
        toAccountId: null,
        categoryId: row.categoryId,
        notes: row.notes || null,
        data: row.data,
      }).run();
    }
    for (const account of balances) {
      tx.update(accounts).set({ balance: account.balance }).where(eq(accounts.id, account.id)).run();
    }
    return { success: true, count: rows.length, alreadySaved: false, message: `已保存 ${rows.length} 笔交易，并更新账户余额` };
  }, { behavior: 'immediate' });
}
