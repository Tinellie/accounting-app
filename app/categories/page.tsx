import { asc } from "drizzle-orm";
import Stack from "@mui/material/Stack";
import CategoryManager from "@/src/components/CategoryManager";
import TagManager from "@/src/components/TagManager";
import PageHeading from "@/src/components/PageHeading";
import { db } from "@/src/db";
import { categories, tags } from "@/src/db/schema";
import categoryIconNames from "@/src/lib/category-icon-names.json";

/**
 * 组件：分类管理页面
 * 功能：展示分类与标签管理工具，供用户维护分类层级和外观。
 */
export default function CategoriesPage() {
  // 读取分类管理页需要展示的分类资料，并按用户设定顺序排列。
  const categoryRows = db
    .select({
      id: categories.id,
      code: categories.code,
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
  const tagRows = db.select().from(tags).orderBy(asc(tags.sortOrder), asc(tags.name)).all();

  return (
    <Stack component="section" spacing={0}>
      <PageHeading eyebrow="ORGANIZE" title="分类与标签" description="整理交易分类与标签" />
      <Stack spacing={3} sx={{ pt: 3.75 }}>
        <CategoryManager categories={categoryRows} iconNames={categoryIconNames} />
        <TagManager tags={tagRows} iconNames={categoryIconNames} />
      </Stack>
    </Stack>
  );
}