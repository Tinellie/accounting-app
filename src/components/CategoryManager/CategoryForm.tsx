'use client';

import { useActionState, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CategoryColorPicker from '@/src/components/CategoryColorPicker';
import CategoryIconPicker from '@/src/components/CategoryIconPicker';
import { createCategoryAction, updateCategoryAction } from '@/app/categories/actions';
import { fallbackCategoryColor } from '@/src/lib/category-colors';
import { normalizeCategoryIconName } from '@/src/components/CategoryIcon';
import { categoryTypes, initialActionState, type CategoryRecord } from './types';

type CategoryFormProps = {
  category: CategoryRecord | null;
  categories: CategoryRecord[];
  iconNames: string[];
  onCancel: () => void;
};

export default function CategoryForm({ category, categories, iconNames, onCancel }: CategoryFormProps) {
  const action = category ? updateCategoryAction : createCategoryAction;
  const [state, formAction, isPending] = useActionState(action, initialActionState);
  const [code, setCode] = useState(category ? category.code ?? `category-${category.id}` : '');
  const [type, setType] = useState<CategoryRecord['type']>(category?.type ?? 'expense');
  const [parentId, setParentId] = useState(String(category?.parentId ?? ''));
  const [icon, setIcon] = useState(normalizeCategoryIconName(category?.icon ?? null) ?? '');
  const [color, setColor] = useState<string | null>(category?.color ?? null);
  const parentOptions = categories.filter(
    (item) => item.parentId === null && item.type === type && item.id !== category?.id,
  );
  const selectedParent = parentOptions.find((item) => item.id === Number(parentId));
  const parentColor = selectedParent
    ? selectedParent.color ?? fallbackCategoryColor(selectedParent.id)
    : null;

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
          onChange={(event) => setCode(event.target.value)}
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
                setType(event.target.value as CategoryRecord['type']);
                setParentId('');
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
              onChange={(event) => setParentId(String(event.target.value))}
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
            <CategoryIconPicker iconNames={iconNames} value={icon} onChange={setIcon} />
          </Box>
          <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
            <CategoryColorPicker
              color={color}
              hasParent={parentId !== ''}
              parentColor={parentColor}
              onChange={setColor}
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