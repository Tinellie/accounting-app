"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/src/db";
import { categories, transactions } from "@/src/db/schema";
import { chooseCategoryColor } from "@/src/lib/category-colors";
import { createCategorySchema, positiveIdSchema, updateCategorySchema } from "@/src/lib/validations";

export type CategoryActionState = {
  success: boolean;
  message: string;
};

class CategoryActionError extends Error {}

/** 新建一级分类或挂在一级分类下的二级分类。 */
export async function createCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const parsed = createCategorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    parentId: formData.get("parentId"),
    color: formData.get("color"),
    sortOrder: formData.get("sortOrder") ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "请检查分类信息" };
  }

  try {
    db.transaction((tx) => {
      if (parsed.data.parentId !== null) {
        const parent = tx.select({ id: categories.id, type: categories.type, parentId: categories.parentId })
          .from(categories)
          .where(eq(categories.id, parsed.data.parentId))
          .get();

        if (!parent || parent.type !== parsed.data.type || parent.parentId !== null) {
          throw new CategoryActionError("子分类必须选择同类型的一级分类");
        }
      }

      const siblingFilter = parsed.data.parentId === null
        ? and(eq(categories.type, parsed.data.type), isNull(categories.parentId))
        : eq(categories.parentId, parsed.data.parentId);
      const lastSibling = tx.select({ sortOrder: categories.sortOrder })
        .from(categories)
        .where(siblingFilter)
        .orderBy(desc(categories.sortOrder))
        .limit(1)
        .get();
      const sortOrder = (lastSibling?.sortOrder ?? -1) + 1;

      const color = parsed.data.parentId === null && parsed.data.color === null
        ? chooseCategoryColor(
            tx.select({ color: categories.color })
              .from(categories)
              .where(isNull(categories.parentId))
              .all()
              .map((category) => category.color),
          )
        : parsed.data.color;

      tx.insert(categories).values({ ...parsed.data, color, sortOrder }).run();
    });
  } catch (error) {
    if (error instanceof CategoryActionError) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "添加分类失败，请稍后重试" };
  }

  revalidatePath("/categories");
  revalidatePath("/transactions");
  return { success: true, message: "分类已添加" };
}

/** 修改分类名称、类型或所属一级分类，并维护最多两层的分类结构。 */
export async function updateCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const parsed = updateCategorySchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    type: formData.get("type"),
    parentId: formData.get("parentId"),
    color: formData.get("color"),
    sortOrder: formData.get("sortOrder") ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "请检查分类信息" };
  }

  const categoryInput = parsed.data;

  try {
    db.transaction((tx) => {
      const current = tx.select({ id: categories.id, type: categories.type, parentId: categories.parentId })
        .from(categories)
        .where(eq(categories.id, categoryInput.id))
        .get();

      if (!current) {
        throw new CategoryActionError("分类不存在");
      }

      if (categoryInput.type !== current.type) {
        const linkedTransaction = tx.select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.categoryId, categoryInput.id))
          .limit(1)
          .get();

        if (linkedTransaction) {
          throw new CategoryActionError("已有流水的分类不能更改收支类型");
        }
      }

      const child = tx.select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, categoryInput.id))
        .limit(1)
        .get();

      if (child && (categoryInput.type !== current.type || categoryInput.parentId !== null)) {
        throw new CategoryActionError("含有子分类的一级分类不能更改类型或移入其他分类");
      }

      if (categoryInput.parentId !== null) {
        const parent = tx.select({ id: categories.id, type: categories.type, parentId: categories.parentId })
          .from(categories)
          .where(eq(categories.id, categoryInput.parentId))
          .get();

        if (
          !parent ||
          parent.id === categoryInput.id ||
          parent.type !== categoryInput.type ||
          parent.parentId !== null
        ) {
          throw new CategoryActionError("子分类必须选择同类型的一级分类");
        }
      }

      const color = categoryInput.parentId === null && categoryInput.color === null
        ? chooseCategoryColor(
            tx.select({ id: categories.id, color: categories.color })
              .from(categories)
              .where(isNull(categories.parentId))
              .all()
              .filter((item) => item.id !== categoryInput.id)
              .map((item) => item.color),
          )
        : categoryInput.color;

      tx.update(categories)
        .set({
          name: categoryInput.name,
          type: categoryInput.type,
          parentId: categoryInput.parentId,
          color,
        })
        .where(eq(categories.id, categoryInput.id))
        .run();
    });
  } catch (error) {
    if (error instanceof CategoryActionError) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "更新分类失败，请稍后重试" };
  }

  revalidatePath("/categories");
  revalidatePath("/transactions");
  return { success: true, message: "分类信息已更新" };
}

/** 在同一个分类层级和收支类型内保存新的排序。 */
export async function reorderCategoriesAction(categoryIds: number[]): Promise<CategoryActionState> {
  const parsedIds = z.array(positiveIdSchema).min(1).max(500).safeParse(categoryIds);
  if (!parsedIds.success || new Set(parsedIds.data).size !== parsedIds.data.length) {
    return { success: false, message: "分类排序数据无效" };
  }

  try {
    db.transaction((tx) => {
      const selectedCategories = tx.select({
        id: categories.id,
        type: categories.type,
        parentId: categories.parentId,
      })
        .from(categories)
        .where(inArray(categories.id, parsedIds.data))
        .all();
      const firstCategory = selectedCategories[0];

      if (
        selectedCategories.length !== parsedIds.data.length ||
        !firstCategory ||
        selectedCategories.some((category) => (
          category.type !== firstCategory.type || category.parentId !== firstCategory.parentId
        ))
      ) {
        throw new CategoryActionError("只能在同级分类之间调整顺序");
      }

      const siblingFilter = firstCategory.parentId === null
        ? and(eq(categories.type, firstCategory.type), isNull(categories.parentId))
        : eq(categories.parentId, firstCategory.parentId);
      const siblings = tx.select({ id: categories.id })
        .from(categories)
        .where(siblingFilter)
        .all();

      if (
        siblings.length !== parsedIds.data.length ||
        siblings.some((sibling) => !parsedIds.data.includes(sibling.id))
      ) {
        throw new CategoryActionError("分类列表已变化，请刷新后重新排序");
      }

      parsedIds.data.forEach((id, index) => {
        tx.update(categories).set({ sortOrder: index }).where(eq(categories.id, id)).run();
      });
    });
  } catch (error) {
    if (error instanceof CategoryActionError) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "保存分类顺序失败，请稍后重试" };
  }

  revalidatePath("/categories");
  revalidatePath("/transactions");
  return { success: true, message: "分类顺序已保存" };
}

/** 仅删除没有子分类且没有关联流水的分类。 */
export async function deleteCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const parsedId = positiveIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) {
    return { success: false, message: "分类编号无效" };
  }
  const categoryId = parsedId.data;

  try {
    db.transaction((tx) => {
      const child = tx.select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, categoryId))
        .limit(1)
        .get();
      const transaction = tx.select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.categoryId, categoryId))
        .limit(1)
        .get();

      if (child || transaction) {
        throw new CategoryActionError("该分类仍有子分类或关联流水，不能删除");
      }

      tx.delete(categories).where(eq(categories.id, categoryId)).run();
    });
  } catch (error) {
    if (error instanceof CategoryActionError) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "删除分类失败，请稍后重试" };
  }

  revalidatePath("/categories");
  revalidatePath("/transactions");
  return { success: true, message: "分类已删除" };
}