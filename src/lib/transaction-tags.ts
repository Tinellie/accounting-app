import { and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db';
import { tags, transactions, transactionTags } from '../db/schema';
import { positiveIdSchema, transactionIdsSchema } from './validations';

const bulkTagsSchema = z.object({
  transactionIds: transactionIdsSchema,
  tagIds: z.array(positiveIdSchema).min(1, '请先选择标签').max(500, '一次最多处理 500 个标签')
    .refine((ids) => new Set(ids).size === ids.length, '标签编号不能重复'),
  operation: z.enum(['add', 'remove']),
});

export class TransactionTagError extends Error {}

export function updateTransactionTags(database: typeof db, input: unknown) {
  const parsed = bulkTagsSchema.safeParse(input);
  if (!parsed.success) throw new TransactionTagError(parsed.error.issues[0]?.message ?? '标签操作无效');
  const { transactionIds, tagIds, operation } = parsed.data;
  database.transaction((tx) => {
    if (tx.select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, transactionIds)).all().length !== transactionIds.length) {
      throw new TransactionTagError('部分交易已不存在，请刷新后重试');
    }
    if (tx.select({ id: tags.id }).from(tags).where(inArray(tags.id, tagIds)).all().length !== tagIds.length) {
      throw new TransactionTagError('部分标签已不存在，请刷新后重试');
    }
    if (operation === 'add') {
      for (const transactionId of transactionIds) {
        tx.insert(transactionTags).values(tagIds.map((tagId) => ({ transactionId, tagId })))
          .onConflictDoNothing({ target: [transactionTags.transactionId, transactionTags.tagId] }).run();
      }
    } else {
      tx.delete(transactionTags).where(and(
        inArray(transactionTags.transactionId, transactionIds), inArray(transactionTags.tagId, tagIds),
      )).run();
    }
  });
  return parsed.data;
}
