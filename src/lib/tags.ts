import { eq, ne, and, isNull, min } from 'drizzle-orm';
import type { db } from '../db';
import { tags, transactionTags } from '../db/schema';
import { createTagSchema, positiveIdSchema } from './validations';
import { chooseCategoryColor } from './category-colors';

export type TagRecord = typeof tags.$inferSelect;
export class TagError extends Error {}

export function saveTag(database: typeof db, input: unknown, id?: number) {
  const parsed = createTagSchema.safeParse(input);
  if (!parsed.success) throw new TagError(parsed.error.issues[0]?.message ?? '标签信息无效');
  if (id !== undefined && !positiveIdSchema.safeParse(id).success) throw new TagError('标签编号无效');
  return database.transaction((tx) => {
    const values = parsed.data;
    const current = id === undefined ? undefined : tx.select().from(tags).where(eq(tags.id, id)).get();
    if (id !== undefined && !current) throw new TagError('标签不存在');
    const duplicateCode = tx.select().from(tags).where(id === undefined
      ? eq(tags.code, values.code) : and(eq(tags.code, values.code), ne(tags.id, id))).get();
    if (duplicateCode) throw new TagError('标签代码已被使用');
    const duplicate = tx.select().from(tags).where(id === undefined
      ? eq(tags.name, values.name) : and(eq(tags.name, values.name), ne(tags.id, id))).get();
    if (duplicate) throw new TagError('标签名称已被使用');
    if (values.parentId !== null) {
      const parent = tx.select().from(tags).where(eq(tags.id, values.parentId)).get();
      if (!parent || parent.parentId !== null || parent.id === id) throw new TagError('子标签必须选择其他一级标签');
      if (id !== undefined && tx.select().from(tags).where(eq(tags.parentId, id)).get()) {
        throw new TagError('含有子标签的一级标签不能移入其他标签');
      }
    }
    const color = values.parentId === null && values.color === null
      ? current?.color ?? chooseCategoryColor(tx.select().from(tags).where(isNull(tags.parentId)).all().map((tag) => tag.color))
      : values.color;
    if (id !== undefined) {
      tx.update(tags).set({ ...values, color }).where(eq(tags.id, id)).run();
      return id;
    }
    const sibling = tx.select({ order: min(tags.sortOrder) }).from(tags).where(values.parentId === null
      ? isNull(tags.parentId) : eq(tags.parentId, values.parentId)).get();
    return tx.insert(tags).values({ ...values, color, sortOrder: (sibling?.order ?? 1) - 1 }).returning({ id: tags.id }).get().id;
  });
}

export function deleteTag(database: typeof db, input: unknown) {
  const parsed = positiveIdSchema.safeParse(input);
  if (!parsed.success) throw new TagError('标签编号无效');
  const id = parsed.data;
  database.transaction((tx) => {
    if (!tx.select().from(tags).where(eq(tags.id, id)).get()) throw new TagError('标签不存在');
    if (tx.select().from(tags).where(eq(tags.parentId, id)).get()) throw new TagError('请先删除或移走子标签');
    if (tx.select().from(transactionTags).where(eq(transactionTags.tagId, id)).get()) throw new TagError('已有流水使用此标签，不能删除');
    tx.delete(tags).where(eq(tags.id, id)).run();
  });
}
