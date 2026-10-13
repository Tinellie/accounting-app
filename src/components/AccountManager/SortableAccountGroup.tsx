'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { Alert, Box, IconButton, Stack, Tooltip } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderAccountsAction } from '@/app/accounts/actions';
import AccountCard from './AccountCard';
import type { AccountRecord } from './types';

/**
 * 组件：可排序账户分组
 * 功能：展示同一类型的账户，并让用户拖动账户调整显示顺序。
 */
type SortableAccountGroupProps = {
  accounts: AccountRecord[];
  accountType: AccountRecord['type'];
  isArchived: boolean;
  onEdit: (account: AccountRecord) => void;
};

type SortableAccountItemProps = {
  account: AccountRecord;
  disabled: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
};

export default function SortableAccountGroup({ accounts, accountType, isArchived, onEdit }: SortableAccountGroupProps) {
  // 当前账户顺序及保存失败提示属于同一次排序操作。
  const [orderState, setOrderState] = useState(() => ({
    accountOrder: accounts.map((account) => account.id),
    errorMessage: '',
  }));
  const { accountOrder, errorMessage } = orderState;
  // 标记账户顺序是否正在保存。
  const [isPending, startTransition] = useTransition();
  // 按用户保存的顺序排列账户，并把新出现的账户插入合适位置。
  const orderedAccounts = useMemo(() => {
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    const ordered = accountOrder.flatMap((id) => {
      const account = accountsById.get(id);
      return account ? [account] : [];
    });

    for (const account of accounts) {
      if (accountOrder.includes(account.id)) continue;
      const insertIndex = ordered.findIndex((item) => account.sortOrder < item.sortOrder);
      if (insertIndex < 0) ordered.push(account);
      else ordered.splice(insertIndex, 0, account);
    }

    return ordered;
  }, [accounts, accountOrder]);
  // 拖动组件使用的账户 ID 顺序。
  const orderedAccountIds = useMemo(
    () => orderedAccounts.map((account) => account.id),
    [orderedAccounts],
  );

  // 启用鼠标和键盘两种账户排序操作方式。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (isPending || !event.over || event.active.id === event.over.id) return;

    const oldIndex = orderedAccounts.findIndex((account) => account.id === event.active.id);
    const newIndex = orderedAccounts.findIndex((account) => account.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousOrder = accountOrder;
    const nextIds = arrayMove(orderedAccounts, oldIndex, newIndex).map((account) => account.id);
    setOrderState((current) => ({ ...current, accountOrder: nextIds, errorMessage: '' }));

    startTransition(async () => {
      const result = await reorderAccountsAction(nextIds, isArchived, accountType);
      if (!result.success) {
        setOrderState((current) => ({
          ...current,
          accountOrder: previousOrder,
          errorMessage: result.message,
        }));
      }
    });
  }

  return (
    <DndContext
      id={`account-order-${isArchived ? 'archived' : 'active'}-${accountType}`}
      sensors={sensors}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={orderedAccountIds} strategy={verticalListSortingStrategy}>
        <Stack className="account-list" spacing={1.5}>
          {orderedAccounts.map((account) => (
            <SortableAccountItem
              key={account.id}
              account={account}
              disabled={isPending}
            >
              {(dragHandle) => <AccountCard account={account} onEdit={() => onEdit(account)} dragHandle={dragHandle} />}
            </SortableAccountItem>
          ))}
          {errorMessage ? <Alert severity="error" role="status">{errorMessage}</Alert> : null}
        </Stack>
      </SortableContext>
    </DndContext>
  );
}

function SortableAccountItem({ account, disabled, children }: SortableAccountItemProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id, disabled });

  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ opacity: isDragging ? 0.55 : 1, position: 'relative', zIndex: isDragging ? 1 : 'auto' }}
    >
      {children(
        <Tooltip title={`拖动${account.name}调整顺序`}>
          <IconButton
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`拖动${account.name}调整顺序`}
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