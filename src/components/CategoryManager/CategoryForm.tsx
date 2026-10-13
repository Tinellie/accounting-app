'use client';

import { useActionState, useEffect, useState } from 'react';
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import CategoryColorPicker from '@/src/components/CategoryColorPicker';
import CategoryIconPicker from '@/src/components/CategoryIconPicker';
import { createCategoryAction, updateCategoryAction } from '@/app/categories/actions';
import { fallbackCategoryColor } from '@/src/lib/category-colors';
import { normalizeCategoryIconName } from '@/src/components/CategoryIcon';
import { categoryTypes, initialActionState, type CategoryRecord } from './types';

/**
 * 组件：分类表单
 * 功能：供用户新增或修改分类名称、代码、收支类型、上级分类、图标和颜色。
 */
type CategoryFormProps = {
  category: CategoryRecord | null;
  categories: CategoryRecord[];
  iconNames: string[];
  onCancel: () => void;
};

export default function CategoryForm({ category, categories, iconNames, onCancel }: CategoryFormProps) {
  // 根据是否已有分类选择新增或更新操作。
  const action = category ? updateCategoryAction : createCategoryAction;
  // 服务端保存结果、提交函数和当前是否正在保存。
  const [state, formAction, isPending] = useActionState(action, initialActionState);
  // code 是分类唯一代码；type、parentId、icon 和 color 分别表示类型、上级分类、图标和颜色。
  const [formValues, setFormValues] = useState(() => ({
    code: category ? category.code ?? `category-${category.id}` : '',
    type: category?.type ?? 'expense' as CategoryRecord['type'],
    parentId: String(category?.parentId ?? ''),
    icon: normalizeCategoryIconName(category?.icon ?? null) ?? '',
    color: category?.color ?? null as string | null,
  }));
  // 将表单值拆开，供各输入控件和预览使用。
  const { code, type, parentId, icon, color } = formValues;
  // 当前收支类型下可选的一级分类，排除正在编辑的分类本身。
  const parentOptions = categories.filter(
    (item) => item.parentId === null && item.type === type && item.id !== category?.id,
  );
  // 当前选中的上级分类，用于继承分类颜色。
  const selectedParent = parentOptions.find((item) => item.id === Number(parentId));
  // 子分类使用上级分类颜色；上级没有自定义颜色时取默认颜色。
  const parentColor = selectedParent
    ? selectedParent.color ?? fallbackCategoryColor(selectedParent.id)
    : null;

  useEffect(() => {
    if (state.success) onCancel();
  }, [state.success, onCancel]);

  return (
    <Box component="form" action={formAction} sx={{ pt: 1 }}>
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <input type="hidden" name="sortOrder" value={category?.sortOrder ?? 0} />
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={color ?? ''} />
      <Stack spacing={2.25}>
        {state.message ? (
          <Alert severity={state.success ? 'success' : 'error'} role="status">{state.message}</Alert>
        ) : null}

        <TextField
          id="category-code"
          name="code"
          label="分类代码"
          required
          fullWidth
          value={code}
          onChange={(event) => setFormValues((current) => ({ ...current, code: event.target.value }))}
          helperText="唯一标识，例如 food"
          slotProps={{ htmlInput: { maxLength: 50 } }}
        />

        <TextField
          id="category-name"
          name="name"
          label="分类名称"
          required
          fullWidth
          defaultValue={category?.name ?? ''}
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <FormControl fullWidth required>
            <InputLabel id="category-type-label">收支类型</InputLabel>
            <Select
              id="category-type"
              name="type"
              labelId="category-type-label"
              label="收支类型"
              value={type}
              onChange={(event) => {
                setFormValues((current) => ({
                  ...current,
                  type: event.target.value as CategoryRecord['type'],
                  parentId: '',
                }));
              }}
            >
              {categoryTypes.map((item) => (
                <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="category-parent-label">上级分类</InputLabel>
            <Select
              id="category-parent"
              name="parentId"
              labelId="category-parent-label"
              label="上级分类"
              value={parentId}
              onChange={(event) => setFormValues((current) => ({
                ...current,
                parentId: String(event.target.value),
              }))}
            >
              <MenuItem value="">无（一级分类）</MenuItem>
              {parentOptions.map((parent) => (
                <MenuItem key={parent.id} value={parent.id}>{parent.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, flexWrap: 'wrap', pt: 0.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.75 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>分类图标</Typography>
            <CategoryIconPicker
              iconNames={iconNames}
              value={icon}
              onChange={(icon) => setFormValues((current) => ({ ...current, icon }))}
            />
          </Box>
          <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
            <CategoryColorPicker
              color={color}
              hasParent={parentId !== ''}
              parentColor={parentColor}
              onChange={(color) => setFormValues((current) => ({ ...current, color }))}
            />
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button type="button" onClick={onCancel}>取消</Button>
          <Button type="submit" variant="contained" disabled={isPending}>
            {isPending ? '保存中…' : category ? '保存修改' : '添加分类'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}