import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CategoryCard from './CategoryCard';
import SortableCategoryGroup from './SortableCategoryGroup';
import { categoryTypes, type CategoryRecord } from './types';

type CategoryListProps = {
  categories: CategoryRecord[];
  onEdit: (category: CategoryRecord) => void;
};

export default function CategoryList({ categories, onEdit }: CategoryListProps) {
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
            {typeRoots.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 1.5 }}>暂无{type.label}分类</Typography>
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
          </Box>
        );
      })}
    </Stack>
  );
}