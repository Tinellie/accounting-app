import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CategoryRecord } from './types';

type SortableCategoryItemProps = {
  category: CategoryRecord;
  disabled: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
};

export default function SortableCategoryItem({ category, disabled, children }: SortableCategoryItemProps) {
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
            sx={{ cursor: 'grab', touchAction: 'none', '&:active': { cursor: 'grabbing' } }}
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        </Tooltip>,
      )}
    </Box>
  );
}