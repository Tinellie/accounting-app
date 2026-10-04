import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import CategoryIcon from '@/src/components/CategoryIcon';
import DeleteCategoryControl from './DeleteCategoryControl';
import type { CategoryRecord } from './types';

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
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CategoryIcon name={category.icon} color="action" fontSize="small" />
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