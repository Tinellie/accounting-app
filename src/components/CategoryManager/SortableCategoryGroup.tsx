'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { Alert, Stack } from '@mui/material';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { reorderCategoriesAction } from '@/app/categories/actions';
import SortableCategoryItem from './SortableCategoryItem';
import type { CategoryRecord } from './types';

/**
 * 组件：可排序分类分组
 * 功能：展示一组分类，并让用户拖动分类调整显示顺序。
 */
type SortableCategoryGroupProps = {
  id: string;
  categories: CategoryRecord[];
  children: (category: CategoryRecord, dragHandle: ReactNode) => ReactNode;
};

export default function SortableCategoryGroup({ id, categories, children }: SortableCategoryGroupProps) {
  // 当前分类顺序及保存失败提示属于同一次排序操作。
  const [orderState, setOrderState] = useState(() => ({
    categoryOrder: categories.map((category) => category.id),
    errorMessage: '',
  }));
  const { categoryOrder, errorMessage } = orderState;
  // 标记分类顺序是否正在保存。
  const [isPending, startTransition] = useTransition();
  // 按用户保存的顺序排列分类，并保留新增分类。
  const orderedCategories = useMemo(() => {
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    return [
      ...categoryOrder.flatMap((categoryId) => {
        const category = categoriesById.get(categoryId);
        return category ? [category] : [];
      }),
      ...categories.filter((category) => !categoryOrder.includes(category.id)),
    ];
  }, [categories, categoryOrder]);
  // 拖动组件使用的分类 ID 顺序。
  const orderedCategoryIds = useMemo(
    () => orderedCategories.map((category) => category.id),
    [orderedCategories],
  );
  // 启用鼠标和键盘两种分类排序操作方式。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (isPending || !event.over || event.active.id === event.over.id) return;

    const oldIndex = orderedCategories.findIndex((category) => category.id === event.active.id);
    const newIndex = orderedCategories.findIndex((category) => category.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousOrder = categoryOrder;
    const nextIds = arrayMove(orderedCategories, oldIndex, newIndex).map((category) => category.id);
    setOrderState((current) => ({ ...current, categoryOrder: nextIds, errorMessage: '' }));

    startTransition(async () => {
      const result = await reorderCategoriesAction(nextIds);
      if (!result.success) {
        setOrderState((current) => ({
          ...current,
          categoryOrder: previousOrder,
          errorMessage: result.message,
        }));
      }
    });
  }

  return (
    <DndContext id={id} sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedCategoryIds} strategy={verticalListSortingStrategy}>
        <Stack spacing={0.5}>
          {orderedCategories.map((category) => (
            <SortableCategoryItem key={category.id} category={category} disabled={isPending}>
              {(dragHandle) => children(category, dragHandle)}
            </SortableCategoryItem>
          ))}
          {errorMessage ? <Alert severity="error" role="status">{errorMessage}</Alert> : null}
        </Stack>
      </SortableContext>
    </DndContext>
  );
}