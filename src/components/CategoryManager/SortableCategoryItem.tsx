import type { ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CategoryRecord } from './types';

/**
 * 组件：可排序分类项
 * 功能：为分类提供可见的拖动入口，方便用户调整分类顺序。
 */
type SortableCategoryItemProps = {
  category: CategoryRecord;
  disabled: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
};

export default function SortableCategoryItem({ category, disabled, children }: SortableCategoryItemProps) {
  // 当前分类的拖动属性、位置变化和拖动状态。
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled });

  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ opacity: isDragging ? 0.55 : 1, position: 'relative', zIndex: isDragging ? 1 : 'auto' }}
    >
      {children(
        <Tooltip title={`拖动${category.name}调整顺序`}>
          <IconButton
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`拖动${category.name}调整顺序`}
            size="small"
            sx={{
              width: 24,
              minWidth: 24,
              height: 28,
              p: 0,
              cursor: 'grab',
              touchAction: 'none',
              '&:active': { cursor: 'grabbing' },
            }}
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        </Tooltip>,
      )}
    </Box>
  );
}