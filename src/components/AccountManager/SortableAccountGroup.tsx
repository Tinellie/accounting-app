'use client';

import { useState, useTransition, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
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

type SortableAccountGroupProps = {
  accounts: AccountRecord[];
  isArchived: boolean;
  onEdit: (account: AccountRecord) => void;
};

type SortableAccountItemProps = {
  account: AccountRecord;
  disabled: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
};

export default function SortableAccountGroup({ accounts, isArchived, onEdit }: SortableAccountGroupProps) {
  const [accountOrder, setAccountOrder] = useState(() => accounts.map((account) => account.id));
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const orderedAccounts = accountOrder.flatMap((id) => {
    const account = accountsById.get(id);
    return account ? [account] : [];
  });

  for (const account of accounts) {
    if (accountOrder.includes(account.id)) continue;
    const insertIndex = orderedAccounts.findIndex((item) => account.sortOrder < item.sortOrder);
    if (insertIndex < 0) orderedAccounts.push(account);
    else orderedAccounts.splice(insertIndex, 0, account);
  }

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
    setAccountOrder(nextIds);
    setErrorMessage('');

    startTransition(async () => {
      const result = await reorderAccountsAction(nextIds, isArchived);
      if (!result.success) {
        setAccountOrder(previousOrder);
        setErrorMessage(result.message);
      }
    });
  }

  return (
    <DndContext
      id={isArchived ? 'account-order-archived' : 'account-order-active'}
      sensors={sensors}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={orderedAccounts.map((account) => account.id)} strategy={verticalListSortingStrategy}>
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