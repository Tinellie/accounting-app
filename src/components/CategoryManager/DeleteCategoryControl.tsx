'use client';

import { useActionState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { deleteCategoryAction } from '@/app/categories/actions';
import { initialActionState, type CategoryRecord } from './types';

type DeleteCategoryControlProps = {
  category: CategoryRecord;
  disabled: boolean;
};

export default function DeleteCategoryControl({ category, disabled }: DeleteCategoryControlProps) {
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