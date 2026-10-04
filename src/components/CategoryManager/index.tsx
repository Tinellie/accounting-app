'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import CategoryForm from './CategoryForm';
import CategoryList from './CategoryList';
import type { CategoryManagerProps, CategoryRecord } from './types';

export default function CategoryManager({ categories }: CategoryManagerProps) {
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null | undefined>(undefined);
  const closeDialog = () => setEditingCategory(undefined);

  return (
    <Stack id="category-manager" spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button id="category-add" variant="contained" onClick={() => setEditingCategory(null)}>
          添加分类
        </Button>
      </Box>

      <CategoryList categories={categories} onEdit={setEditingCategory} />

      <Dialog open={editingCategory !== undefined} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingCategory ? '编辑分类' : '添加分类'}</DialogTitle>
        <DialogContent>
          {editingCategory !== undefined ? (
            <CategoryForm
              key={editingCategory?.id ?? 'new-category'}
              category={editingCategory}
              categories={categories}
              onCancel={closeDialog}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}