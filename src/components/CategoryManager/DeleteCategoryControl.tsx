'use client';

import { useActionState } from 'react';
import { Alert, Box, Button } from '@mui/material';
import { deleteCategoryAction } from '@/app/categories/actions';
import { initialActionState, type CategoryRecord } from './types';

/**
 * 组件：分类删除控件
 * 功能：让用户删除可移除的分类，并在操作失败时显示提示。
 */
type DeleteCategoryControlProps = {
  category: CategoryRecord;
  disabled: boolean;
};

export default function DeleteCategoryControl({ category, disabled }: DeleteCategoryControlProps) {
  // 保存删除结果、提交函数和当前是否正在删除。
  const [state, formAction, isPending] = useActionState(deleteCategoryAction, initialActionState);

  return (
    <Box>
      <form action={formAction}>
        <input type="hidden" name="id" value={category.id} />
        <Button size="small" type="submit" color="error" disabled={disabled || isPending}>
          删除
        </Button>
      </form>
      {state.message && !state.success ? (
        <Alert severity="error" role="status" sx={{ mt: 1 }}>{state.message}</Alert>
      ) : null}
    </Box>
  );
}