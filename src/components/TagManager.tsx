'use client';

import { useActionState, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CategoryIcon, { normalizeCategoryIconName } from './CategoryIcon';
import CategoryIconPicker from './CategoryIconPicker';
import CategoryColorPicker from './CategoryColorPicker';
import { fallbackCategoryColor } from '../lib/category-colors';
import type { TagRecord } from '../lib/tags';
import { deleteTagAction, saveTagAction } from '@/app/categories/tag-actions';

const initialState = { success: false, message: '' };

export default function TagManager({ tags, iconNames }: { tags: TagRecord[]; iconNames: string[] }) {
  const [editing, setEditing] = useState<TagRecord | null | undefined>(undefined);
  const close = () => setEditing(undefined);
  const roots = tags.filter((tag) => tag.parentId === null);
  const row = (tag: TagRecord, inherited?: string) => {
    const children = tags.some((child) => child.parentId === tag.id);
    const color = tag.color ?? inherited ?? fallbackCategoryColor(tag.id);
    return (
      <Box key={tag.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        <Box sx={{ width: 4, height: 24, flexShrink: 0, borderRadius: 1, bgcolor: color }} />
        <CategoryIcon name={tag.icon ?? 'Label'} color="action" fontSize="small" />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Chip label={tag.name} title={tag.name} size="small" variant="outlined" sx={{ maxWidth: '100%', fontWeight: 400, borderColor: color, bgcolor: alpha(color, 0.1) }} />
          <Chip label={tag.code ?? `tag-${tag.id}`} size="small" sx={{ maxWidth: '100%', fontWeight: 400 }} />
        </Box>
        <Button size="small" onClick={() => setEditing(tag)}>编辑</Button>
        <DeleteTag tag={tag} disabled={children} />
      </Box>
    );
  };
  return (
    <Box component="section" aria-labelledby="tags-title">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography id="tags-title" component="h2" variant="h2">标签</Typography>
        <Button variant="contained" onClick={() => setEditing(null)}>添加标签</Button>
      </Box>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {roots.length ? <Stack spacing={0.5}>{roots.map((root) => {
          const children = tags.filter((tag) => tag.parentId === root.id);
          return (
            <Box key={root.id}>
              {row(root)}
              {children.length ? <Stack spacing={0.5} sx={{ mt: 0.5, ml: { xs: 1, sm: 3 }, pl: 2, borderLeft: 1, borderColor: 'divider' }}>
                {children.map((child) => row(child, root.color ?? fallbackCategoryColor(root.id)))}
              </Stack> : null}
            </Box>
          );
        })}</Stack> : <Typography color="text.secondary">暂无标签。先添加一级标签，再添加二级子标签。</Typography>}
      </Paper>
      <Dialog open={editing !== undefined} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? '编辑标签' : '添加标签'}</DialogTitle>
        <DialogContent>
          {editing !== undefined ? <TagForm key={editing?.id ?? 'new'} tag={editing} tags={tags} iconNames={iconNames} onClose={close} /> : null}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function DeleteTag({ tag, disabled }: { tag: TagRecord; disabled: boolean }) {
  const [state, action, pending] = useActionState(deleteTagAction, initialState);
  return (
    <Box>
      <form action={action}>
        <input type="hidden" name="id" value={tag.id} />
        <Button type="submit" size="small" color="error" disabled={disabled || pending}>删除</Button>
      </form>
      {!state.success && state.message ? <Alert severity="error" role="status">{state.message}</Alert> : null}
    </Box>
  );
}

function TagForm({ tag, tags, iconNames, onClose }: { tag: TagRecord | null; tags: TagRecord[]; iconNames: string[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveTagAction, initialState);
  const [parentId, setParentId] = useState(String(tag?.parentId ?? ''));
  const [icon, setIcon] = useState(normalizeCategoryIconName(tag?.icon ?? null) ?? '');
  const [color, setColor] = useState(tag?.color ?? null);
  const hasChildren = tags.some((item) => item.parentId === tag?.id);
  const parents = tags.filter((item) => item.parentId === null && item.id !== tag?.id);
  const parent = parents.find((item) => String(item.id) === parentId);
  useEffect(() => { if (state.success) onClose(); }, [state.success, onClose]);
  return (
    <Box component="form" action={action} sx={{ pt: 1 }}>
      {tag ? <input type="hidden" name="id" value={tag.id} /> : null}
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={color ?? ''} />
      <Stack spacing={2.25}>
        {state.message ? <Alert severity={state.success ? 'success' : 'error'} role="status">{state.message}</Alert> : null}
        <TextField name="code" label="标签代码" required fullWidth defaultValue={tag?.code ?? (tag ? `tag-${tag.id}` : '')} helperText="唯一标识，支持英文字母、数字、连字符和下划线，保存时转为小写" slotProps={{ htmlInput: { maxLength: 50, pattern: '[A-Za-z0-9_\\-]{1,50}' } }} />
        <TextField name="name" label="标签名称" required fullWidth defaultValue={tag?.name ?? ''} slotProps={{ htmlInput: { maxLength: 100 } }} />
        <FormControl fullWidth>
          <InputLabel id="tag-parent-label">上级标签</InputLabel>
          <Select name="parentId" labelId="tag-parent-label" label="上级标签" value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <MenuItem value="">无（一级标签）</MenuItem>
            {!hasChildren ? parents.map((item) => <MenuItem key={item.id} value={String(item.id)}>{item.name}</MenuItem>) : null}
          </Select>
        </FormControl>
        <Box>
          <Typography variant="body2" sx={{ mb: 1 }}>标签图标</Typography>
          <CategoryIconPicker entityLabel="标签" iconNames={iconNames} value={icon} onChange={setIcon} />
        </Box>
        <CategoryColorPicker entityLabel="标签" color={color} hasParent={parentId !== ''} parentColor={parent ? parent.color ?? fallbackCategoryColor(parent.id) : null} onChange={setColor} />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button onClick={onClose} disabled={pending}>取消</Button>
          <Button type="submit" variant="contained" disabled={pending}>{pending ? '保存中…' : tag ? '保存修改' : '添加标签'}</Button>
        </Box>
      </Stack>
    </Box>
  );
}
