import { Box } from '@mui/material';
import CategoryRow from './CategoryRow';
import SortableCategoryGroup from './SortableCategoryGroup';
import { fallbackCategoryColor } from '@/src/lib/category-colors';
import type { CategoryRecord } from './types';
import type { ReactNode } from 'react';

/**
 * 组件：分类卡片
 * 功能：展示一级分类及其子分类，帮助用户查看分类层级和颜色标识。
 * 用户可以整理子分类顺序或编辑分类资料。
 */
type CategoryCardProps = {
  category: CategoryRecord;
  subcategories: CategoryRecord[];
  onEdit: (category: CategoryRecord) => void;
  dragHandle: ReactNode;
};

export default function CategoryCard({ category, subcategories, onEdit, dragHandle }: CategoryCardProps) {
  // 一级分类没有自定义颜色时，使用系统分配的默认颜色。
  const rootColor = category.color ?? fallbackCategoryColor(category.id);

  return (
    <Box
      id={`category-${category.id}`}
      className="category-card"
      component="article"
    >
      <CategoryRow
        category={category}
        color={rootColor}
        onEdit={onEdit}
        hasChildren={subcategories.length > 0}
        dragHandle={dragHandle}
      />
      {subcategories.length > 0 ? (
        <Box sx={{ mt: 0.5, ml: { xs: 1, sm: 3 }, pl: 2, borderLeft: 1, borderColor: 'divider' }}>
          <SortableCategoryGroup id={`category-children-${category.id}`} categories={subcategories}>
            {(child, dragHandle) => (
              <CategoryRow
                category={child}
                color={child.color ?? rootColor}
                onEdit={onEdit}
                hasChildren={false}
                dragHandle={dragHandle}
              />
            )}
          </SortableCategoryGroup>
        </Box>
      ) : null}
    </Box>
  );
}