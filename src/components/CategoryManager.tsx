'use client';

import { useActionState, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CategoryColorPicker from '@/src/components/CategoryColorPicker';
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
  type CategoryActionState,
} from '@/app/categories/actions';
import { fallbackCategoryColor } from '@/src/lib/category-colors';

type CategoryRecord = {
  id: number;
  name: string;
  type: 'expense' | 'income';
  parentId: number | null;
  color: string | null;
  sortOrder: number;
};

type CategoryManagerProps = {
  categories: CategoryRecord[];
};

const initialActionState: CategoryActionState = { success: false, message: '' };
const categoryTypes: { value: CategoryRecord['type']; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
];

// 按支出和收入分组展示分类，并管理分类编辑弹窗。
export default function CategoryManager({ categories }: CategoryManagerProps) {
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null | undefined>(undefined);
  const rootCategories = categories.filter((category) => category.parentId === null);

  return (
    <Stack id="category-manager" spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button id="category-add" variant="contained" onClick={() => setEditingCategory(null)}>
          添加分类
        </Button>
      </Box>

      {categories.length === 0 ? (
        <Alert severity="info">还没有分类。先添加一级分类，再按需要添加二级子分类。</Alert>
      ) : null}

      {categoryTypes.map((type) => {
        const typeRoots = rootCategories.filter((category) => category.type === type.value);

        return (
          <Box key={type.value} component="section" aria-labelledby={`category-${type.value}-title`}>
            <Typography id={`category-${type.value}-title`} component="h2" variant="h2" sx={{ mb: 1.5 }}>
              {type.label}分类
            </Typography>
            {typeRoots.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 1.5 }}>暂无{type.label}分类</Typography>
            ) : (
              <Stack spacing={1.5}>
                {typeRoots.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    subcategories={categories.filter((item) => item.parentId === category.id)}
                    onEdit={setEditingCategory}
                  />
                ))}
              </Stack>
            )}
          </Box>
        );
      })}

      <Dialog
        open={editingCategory !== undefined}
        onClose={() => setEditingCategory(undefined)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editingCategory ? '编辑分类' : '添加分类'}</DialogTitle>
        <DialogContent>
          {editingCategory !== undefined ? (
            <CategoryForm
              key={editingCategory?.id ?? 'new-category'}
              category={editingCategory}
              categories={categories}
              onCancel={() => setEditingCategory(undefined)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

type CategoryCardProps = {
  category: CategoryRecord;
  subcategories: CategoryRecord[];
  onEdit: (category: CategoryRecord) => void;
};

// 展示一个一级分类及其下属的二级分类。
function CategoryCard({ category, subcategories, onEdit }: CategoryCardProps) {
  const rootColor = category.color ?? fallbackCategoryColor(category.id);

  return (
    <Paper
      id={`category-${category.id}`}
      className="category-card"
      component="article"
      variant="outlined"
      sx={{ p: 2, borderColor: 'divider' }}
    >
      <CategoryRow category={category} color={rootColor} onEdit={onEdit} hasChildren={subcategories.length > 0} />
      {subcategories.length > 0 ? (
        <Stack spacing={1} sx={{ mt: 1.5, ml: { xs: 1, sm: 3 }, pl: 2, borderLeft: 1, borderColor: 'divider' }}>
          {subcategories.map((child) => (
            <CategoryRow
              key={child.id}
              category={child}
              color={child.color ?? rootColor}
              onEdit={onEdit}
              hasChildren={false}
            />
          ))}
        </Stack>
      ) : null}
    </Paper>
  );
}

type CategoryRowProps = {
  category: CategoryRecord;
  color: string;
  onEdit: (category: CategoryRecord) => void;
  hasChildren: boolean;
};

// 显示分类名称和编辑、删除操作。
function CategoryRow({ category, color, onEdit, hasChildren }: CategoryRowProps) {
  return (
    <Box className="category-row" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box aria-hidden="true" sx={{ width: 4, height: 24, flexShrink: 0, borderRadius: 1, bgcolor: color }} />
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body1" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{category.name}</Typography>
          <Chip label={hasChildren ? '一级' : category.parentId === null ? '一级' : '二级'} size="small" />
        </Box>
        <Box sx={{ display: 'flex', flexShrink: 0, gap: 0.5 }}>
          <Button size="small" onClick={() => onEdit(category)}>编辑</Button>
          <DeleteCategoryControl category={category} disabled={hasChildren} />
        </Box>
      </Box>
    </Box>
  );
}

type DeleteCategoryControlProps = {
  category: CategoryRecord;
  disabled: boolean;
};

// 删除分类；服务端会阻止删除仍有子分类或流水引用的分类。
function DeleteCategoryControl({ category, disabled }: DeleteCategoryControlProps) {
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

type CategoryFormProps = {
  category: CategoryRecord | null;
  categories: CategoryRecord[];
  onCancel: () => void;
};

// 新建或编辑分类，并根据选择的类型筛选可用一级分类。
function CategoryForm({ category, categories, onCancel }: CategoryFormProps) {
  const action = category ? updateCategoryAction : createCategoryAction;
  const [state, formAction, isPending] = useActionState(action, initialActionState);
  const [type, setType] = useState<CategoryRecord['type']>(category?.type ?? 'expense');
  const [parentId, setParentId] = useState(String(category?.parentId ?? ''));
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
      <input type="hidden" name="color" value={color ?? ''} />
      <Stack spacing={2}>
        {state.message ? (
          <Alert severity={state.success ? 'success' : 'error'} role="status">{state.message}</Alert>
        ) : null}

        <TextField
          id="category-name"
          name="name"
          label="分类名称"
          required
          fullWidth
          defaultValue={category?.name ?? ''}
        />

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

        <CategoryColorPicker
          color={color}
          hasParent={parentId !== ''}
          parentColor={parentColor}
          onChange={setColor}
        />

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