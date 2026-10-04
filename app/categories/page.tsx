import { asc } from "drizzle-orm";
import Stack from "@mui/material/Stack";
import CategoryManager from "@/src/components/CategoryManager";
import PageHeading from "@/src/components/PageHeading";
import { db } from "@/src/db";
import { categories } from "@/src/db/schema";
import categoryIconNames from "@/src/lib/category-icon-names.json";

export default function CategoriesPage() {
  const categoryRows = db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
      parentId: categories.parentId,
      icon: categories.icon,
      color: categories.color,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .all();

  return (
    <Stack component="section" spacing={0}>
      <PageHeading eyebrow="ORGANIZE" title="分类与标签" description="整理交易分类与标签" />
      <Stack sx={{ pt: 3.75 }}>
        <CategoryManager categories={categoryRows} iconNames={categoryIconNames} />
      </Stack>
    </Stack>
  );
}