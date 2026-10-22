import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '@/src/db';
import { accounts, categories, transactions, wechatImportBatches } from '../../db/schema';
import { createTransactionSchema, positiveIdSchema } from '../validations';
import { formatMinorUnits } from '../money';

const saveRequestSchema = z.object({
  batchId: z.string().uuid(),
  accountId: positiveIdSchema,
}).strict();

const rowSchema = z.object({
  id: z.number().int().negative(),
  type: z.enum(['expense', 'income']),
  amount: z.number().int().positive().refine(Number.isSafeInteger),
  occurredAt: z.iso.datetime(),
  categoryId: positiveIdSchema,
  notes: z.string().max(1000).nullable(),
  currency: z.literal('CNY'),
  importDebug: z.object({ errors: z.array(z.string()).max(0, '存在 OCR 识别错误') }),
  aiCategory: z.object({ status: z.enum(['success', 'warning']), errors: z.array(z.string()).max(0) }).optional(),
});
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
  const { batchId, accountId } = request.data;
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
  const parsed = batchSchema.safeParse(raw);
  if (!parsed.success || parsed.data.batchId !== batchId) {
    throw new ImportSaveError('批次中存在红色错误或无效金额、日期、分类，请重新识别后再保存');
  }
  const rows = parsed.data.transactions.map((row, index) => {
    const validated = createTransactionSchema.safeParse({
      type: row.type,
      amount: formatMinorUnits(row.amount),
      occurredAt: row.occurredAt,
      accountId,
      toAccountId: null,
      categoryId: row.categoryId,
      notes: row.notes ?? '',
    });
    if (!validated.success) throw new ImportSaveError(`第 ${index + 1} 笔交易无效：${validated.error.issues[0]?.message ?? '请重新识别'}`);
    return validated.data;
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
      if (previous.accountId !== accountId) throw new ImportSaveError('本批次已保存到其他账户，不能重复导入');
      return { success: true, count: previous.transactionCount, alreadySaved: true, message: `本批次 ${previous.transactionCount} 笔交易已保存，未重复入账` };
    }
    const account = tx.select().from(accounts).where(eq(accounts.id, accountId)).get();
    if (!account || account.isArchived) throw new ImportSaveError('所选账户不存在或已归档，请重新选择');
    if (account.currency !== 'CNY') throw new ImportSaveError('微信账单金额为 CNY，请选择人民币账户；暂不支持汇率转换');
    const categoryIds = [...new Set(rows.map((row) => row.categoryId).filter((id): id is number => id !== null))];
    const currentCategories = tx.select().from(categories).where(inArray(categories.id, categoryIds)).all();
    let delta = 0;
    for (const [index, row] of rows.entries()) {
      const category = currentCategories.find(({ id }) => id === row.categoryId);
      if (!category || category.type !== row.type) throw new ImportSaveError(`第 ${index + 1} 笔交易的分类不存在或收支类型已改变，请重新识别`);
      delta += row.type === 'income' ? row.amount : -row.amount;
      if (!Number.isSafeInteger(delta)) throw new ImportSaveError('交易合计金额超出安全范围');
    }
    const balance = account.balance + delta;
    if (!Number.isSafeInteger(balance)) throw new ImportSaveError('保存后的账户余额超出安全范围');
    tx.insert(wechatImportBatches).values({ batchId, accountId, transactionCount: rows.length }).run();
    for (const row of rows) {
      tx.insert(transactions).values({
        type: row.type,
        amount: row.amount,
        occurredAt: row.occurredAt,
        accountId,
        toAccountId: null,
        categoryId: row.categoryId,
        notes: row.notes || null,
      }).run();
    }
    tx.update(accounts).set({ balance }).where(eq(accounts.id, accountId)).run();
    return { success: true, count: rows.length, alreadySaved: false, message: `已保存 ${rows.length} 笔交易，并更新账户余额` };
  }, { behavior: 'immediate' });
}
