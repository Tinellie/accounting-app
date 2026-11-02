import { Alert, Box, Paper, Stack, Typography } from '@mui/material';
import CategoryCard from './CategoryCard';
import SortableCategoryGroup from './SortableCategoryGroup';
import { categoryTypes, type CategoryRecord } from './types';

/**
 * 组件：分类列表
 * 功能：按收支类型展示一级分类及其下级分类。
 * 用户可以浏览分类层级、调整顺序或选择分类进行编辑。
 */
type CategoryListProps = {
  categories: CategoryRecord[];
  onEdit: (category: CategoryRecord) => void;
};

export default function CategoryList({ categories, onEdit }: CategoryListProps) {
  // 仅取一级分类作为每种收支类型下的列表入口。
  const rootCategories = categories.filter((category) => category.parentId === null);

  return (
    <Stack spacing={3}>
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
            <Paper variant="outlined" sx={{ p: 2, borderColor: 'divider' }}>
              {typeRoots.length === 0 ? (
                <Typography color="text.secondary">暂无{type.label}分类</Typography>
              ) : (
                <SortableCategoryGroup id={`category-roots-${type.value}`} categories={typeRoots}>
                  {(category, dragHandle) => (
                    <CategoryCard
                      category={category}
                      subcategories={categories.filter((item) => item.parentId === category.id)}
                      onEdit={onEdit}
                      dragHandle={dragHandle}
                    />
                  )}
                </SortableCategoryGroup>
              )}
            </Paper>
          </Box>
        );
      })}
    </Stack>
  );
}