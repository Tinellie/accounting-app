'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { reorderCategoriesAction } from '@/app/categories/actions';
import SortableCategoryItem from './SortableCategoryItem';
import type { CategoryRecord } from './types';

type SortableCategoryGroupProps = {
  id: string;
  categories: CategoryRecord[];
  children: (category: CategoryRecord, dragHandle: ReactNode) => ReactNode;
};

export default function SortableCategoryGroup({ id, categories, children }: SortableCategoryGroupProps) {
  const [categoryOrder, setCategoryOrder] = useState(() => categories.map((category) => category.id));
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();
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
  const orderedCategoryIds = useMemo(
    () => orderedCategories.map((category) => category.id),
    [orderedCategories],
  );
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
    setCategoryOrder(nextIds);
    setErrorMessage('');

    startTransition(async () => {
      const result = await reorderCategoriesAction(nextIds);
      if (!result.success) {
        setCategoryOrder(previousOrder);
        setErrorMessage(result.message);
      }
    });
  }

  return (
    <DndContext id={id} sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedCategoryIds} strategy={verticalListSortingStrategy}>
        <Stack spacing={1.5}>
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