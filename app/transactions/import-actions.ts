'use server';

import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { getUserDb, getUserDirectory } from '@/src/db/user';
import { ImportSaveError, saveImportedBatch } from '@/src/lib/wechat-import/save';
import type { SaveImportResult } from '@/src/lib/wechat-import/save';
import type { PreviewEdit } from '@/src/lib/wechat-import/preview';

export async function saveWechatImportAction(input: {
  batchId: string;
  accountId?: number;
  editedRows?: PreviewEdit[];
}): Promise<SaveImportResult | { success: false; message: string }> {
  const db = await getUserDb();
  const directory = path.join(await getUserDirectory(), 'import-vx-debug');
  let result: SaveImportResult;
  try {
    result = await saveImportedBatch(db, input, directory);
  } catch (error) {
    console.error('[wechat-import-save]', error);
    return {
      success: false,
      message: error instanceof ImportSaveError ? error.message : '保存失败，请稍后重试；同一批次重试不会重复入账',
    };
  }
  revalidatePath('/transactions');
  revalidatePath('/');
  revalidatePath('/accounts');
  return result;
}
