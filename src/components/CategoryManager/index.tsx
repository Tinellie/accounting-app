'use client';

import { useState } from 'react';
import { Box, Button, Dialog, DialogContent, DialogTitle, Stack } from '@mui/material';
import CategoryForm from './CategoryForm';
import CategoryList from './CategoryList';
import type { CategoryManagerProps, CategoryRecord } from './types';

/**
 * 组件：分类管理
 * 功能：汇总展示分类，并提供新增和编辑入口。
 * 用户可以维护分类层级、图标、颜色和排序。
 */
export default function CategoryManager({ categories, iconNames }: CategoryManagerProps) {
  // undefined 表示关闭窗口，null 表示新增，有值表示编辑该分类。
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
              iconNames={iconNames}
              onCancel={closeDialog}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}