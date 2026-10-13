import type { ReactNode } from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import CategoryIcon from '@/src/components/CategoryIcon';
import DeleteCategoryControl from './DeleteCategoryControl';
import type { CategoryRecord } from './types';

/**
 * 组件：分类行
 * 功能：展示分类图标、名称、代码和颜色。
 * 用户可以编辑分类；没有子分类时也可以删除。
 */
type CategoryRowProps = {
  category: CategoryRecord;
  color: string;
  onEdit: (category: CategoryRecord) => void;
  hasChildren: boolean;
  dragHandle: ReactNode;
};

export default function CategoryRow({ category, color, onEdit, hasChildren, dragHandle }: CategoryRowProps) {
  return (
    <Box className="category-row" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      {dragHandle}
      <Box aria-hidden="true" sx={{ width: 4, height: 24, flexShrink: 0, borderRadius: 1, bgcolor: color }} />
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <CategoryIcon name={category.icon} color="action" fontSize="small" />
          <Typography variant="body1" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{category.name}</Typography>
          <Chip
            label={category.code ?? `category-${category.id}`}
            size="small"
            sx={{ maxWidth: '100%' }}
          />
        </Box>
        <Box sx={{ display: 'flex', flexShrink: 0, gap: 0.5 }}>
          <Button size="small" onClick={() => onEdit(category)}>编辑</Button>
          <DeleteCategoryControl category={category} disabled={hasChildren} />
        </Box>
      </Box>
    </Box>
  );
}