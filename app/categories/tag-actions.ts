'use server';

import { revalidatePath } from 'next/cache';
import { getUserDb } from '@/src/db/user';
import { deleteTag, saveTag, TagError } from '@/src/lib/tags';
import { positiveIdSchema } from '@/src/lib/validations';

export type TagActionState = { success: boolean; message: string };

export async function saveTagAction(_previous: TagActionState, form: FormData): Promise<TagActionState> {
  const db = await getUserDb();
  const rawId = form.get('id');
  const id = rawId === null ? undefined : positiveIdSchema.safeParse(rawId);
  if (id && !id.success) return { success: false, message: '标签编号无效' };
  try {
    saveTag(db, {
      code: form.get('code'), name: form.get('name'), parentId: form.get('parentId'), icon: form.get('icon'), color: form.get('color'),
    }, id?.data);
  } catch (error) {
    if (error instanceof TagError) return { success: false, message: error.message };
    console.error('[tags] Save failed', error);
    return { success: false, message: '保存标签失败，请稍后重试' };
  }
  revalidatePath('/categories');
  return { success: true, message: '标签已保存' };
}

export async function deleteTagAction(_previous: TagActionState, form: FormData): Promise<TagActionState> {
  const db = await getUserDb();
  try {
    deleteTag(db, form.get('id'));
  } catch (error) {
    if (error instanceof TagError) return { success: false, message: error.message };
    console.error('[tags] Delete failed', error);
    return { success: false, message: '删除标签失败，请稍后重试' };
  }
  revalidatePath('/categories');
  return { success: true, message: '标签已删除' };
}
