'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Alert, Box, Paper, Stack, TextField, Typography } from '@mui/material';
import { createTransactionAction, updateTransactionAction } from '@/app/transactions/actions';
import { formatMinorUnits } from '@/src/lib/money';
import SourceAccountField from './SourceAccountField';
import TransactionAmountFields from './TransactionAmountFields';
import TransactionDateField from './TransactionDateField';
import TransactionDetailField from './TransactionDetailField';
import TransactionSubmitButton from './TransactionSubmitButton';
import TransactionTypeSelector from './TransactionTypeSelector';
import type { CategoryOption, TransactionType, AccountOption, EditableTransaction } from './types';

/**
 * 组件：交易录入表单
 * 功能：供用户新增或修改支出、收入和转账记录。
 * 用户可以填写金额、时间、账户、分类和备注。
 */
type TransactionEntryFormProps = {
  accounts: AccountOption[];
  categories: CategoryOption[];
  initialTransaction?: EditableTransaction;
  onSaved?: () => void;
};

const initialActionState = { success: false, message: '' };

// 管理表单状态，并组合各个交易录入子组件。
export default function TransactionEntryForm({
  accounts,
  categories,
  initialTransaction,
  onSaved,
}: TransactionEntryFormProps) {
  // 区分新增与编辑模式，影响表单默认值和提交后的行为。
  const isEditing = initialTransaction !== undefined;
  // 为编辑表单生成独立字段 ID，新增表单使用统一前缀。
  const fieldIdPrefix = isEditing ? `txn-edit-${initialTransaction.id}` : 'txn';
  // 当前表单元素的 ID。
  const formId = isEditing ? `${fieldIdPrefix}-entry` : 'txn-entry';
  // type/categoryId/sourceAccountId/destinationAccountId/occurredAt 分别记录交易类型、分类、转出账户、转入账户和发生时间。
  const [formValues, setFormValues] = useState(() => ({
    type: initialTransaction?.type ?? 'expense' as TransactionType,
    categoryId: String(initialTransaction?.categoryId ?? ''),
    sourceAccountId: String(initialTransaction?.accountId ?? ''),
    destinationAccountId: String(initialTransaction?.toAccountId ?? ''),
    occurredAt: initialTransaction?.occurredAt.toISOString() ?? '',
  }));
  const { type, categoryId, sourceAccountId, destinationAccountId, occurredAt } = formValues;
  // 根据新增/编辑模式选择对应的保存操作。
  const action = isEditing ? updateTransactionAction : createTransactionAction;
  // 保存结果、提交函数和当前是否正在保存。
  const [state, formAction, isPending] = useActionState(action, initialActionState);
  // 只显示与当前支出、收入或转账类型相符的分类。
  const filteredCategories = categories.filter((category) => category.type === type);

  useEffect(() => {
    if (isEditing) return;
    startTransition(() => setFormValues((current) => ({
      ...current,
      occurredAt: new Date().toISOString(),
    })));
  }, [isEditing]);

  useEffect(() => {
    if (isEditing && state.success) onSaved?.();
  }, [isEditing, onSaved, state.success]);

  useEffect(() => {
    if (isEditing) return;

    function handleTransactionShortcut(event: KeyboardEvent) {
      if (event.key === 'Enter' && event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
        const target = event.target;
        const form = target instanceof HTMLElement ? target.closest<HTMLFormElement>('#txn-entry') : null;
        if (!form) return;

        event.preventDefault();
        const submitButton = form.querySelector<HTMLButtonElement>('#txn-submit');
        if (!submitButton || submitButton.disabled) return;

        const formData = new FormData(form);
        const transactionType = formData.get('type');
        const amount = String(formData.get('amount') ?? '').trim();
        const occurredAt = formData.get('occurredAt');
        const accountId = Number(formData.get('accountId'));
        const toAccountId = Number(formData.get('toAccountId'));
        const categoryId = Number(formData.get('categoryId'));
        const hasValidAmount = /^-?\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
        const hasValidDate = typeof occurredAt === 'string' && !Number.isNaN(Date.parse(occurredAt));
        const hasValidAccount = Number.isSafeInteger(accountId) && accountId > 0;
        const hasValidDetails = transactionType === 'transfer'
          ? Number.isSafeInteger(toAccountId) && toAccountId > 0 && toAccountId !== accountId
          : Number.isSafeInteger(categoryId) && categoryId > 0;

        if (!hasValidAmount || !hasValidDate || !hasValidAccount || !hasValidDetails) {
          form.reportValidity();
          return;
        }

        if (form.reportValidity()) form.requestSubmit(submitButton);
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input:not([type="hidden"]), textarea, [role="combobox"], [role="textbox"], [role="spinbutton"]'))
      ) {
        return;
      }

      const shortcutTypes: Record<string, TransactionType> = {
        e: 'expense',
        i: 'income',
        t: 'transfer',
      };
      const nextType = shortcutTypes[event.key.toLowerCase()];
      if (!nextType) return;

      event.preventDefault();
      changeType(nextType);
    }

    document.addEventListener('keydown', handleTransactionShortcut);
    return () => document.removeEventListener('keydown', handleTransactionShortcut);
  }, [isEditing]);

  function changeType(nextType: TransactionType) {
    setFormValues((current) => ({
      ...current,
      type: nextType,
      categoryId: '',
      destinationAccountId: '',
    }));
  }

  return (
    <Stack spacing={2.5}>
      <Paper
        id={isEditing ? `${fieldIdPrefix}-form` : 'txn-form'}
        component="section"
        variant="outlined"
        sx={(theme) => ({
          p: { xs: 2, md: 3 },
          borderColor: 'divider',
          backgroundColor: type === 'expense' ? theme.palette.background.paper : theme.palette.transaction[type].light,
          transition: theme.transitions.create('background-color'),
        })}
      >
        <Stack className="txn-form-content" spacing={2.5}>
        {/* 表单标题 */}
        <Typography id={isEditing ? `${fieldIdPrefix}-title` : 'txn-form-title'} component="h2" variant="h2">
          {isEditing ? '编辑交易' : '记一笔'}
        </Typography>

        {/* 没有可用账户时提示用户先创建账户 */}
        {accounts.length === 0 ? (
          <Alert id="txn-account-hint" severity="info">请先在账户管理中添加账户，再记录交易。</Alert>
        ) : null}

        {/* 显示提交后的成功或失败消息 */}
        {state.message ? (
          <Alert id="txn-status" severity={state.success ? 'success' : 'error'} role="status">
            {state.message}
          </Alert>
        ) : null}

        {/* 收集交易信息并交给服务端保存 */}
        <Box id={formId} component="form" action={formAction}>
          {initialTransaction ? <input type="hidden" name="id" value={initialTransaction.id} /> : null}
          <Stack className="txn-entry-fields" spacing={2}>
            {/* 选择支出、收入或转账 */}
            <TransactionTypeSelector type={type} onTypeChange={changeType} fieldId={`${fieldIdPrefix}-type`} />

            {/* 交易的时间、账户、金额和备注等输入项 */}
            <Box
                id={`${fieldIdPrefix}-fields`}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 2,
              }}
            >
              <Box sx={{ gridColumn: '1 / -1' }}>
                <TransactionDateField
                  occurredAt={occurredAt}
                  onDateChange={(occurredAt) => setFormValues((current) => ({ ...current, occurredAt }))}
                  fieldId={`${fieldIdPrefix}-date`}
                />
              </Box>

              <Box
                id={`${fieldIdPrefix}-account-row`}
                sx={{
                  gridColumn: '1 / -1',
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'minmax(0, 1fr)',
                    sm: type === 'transfer' ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
                  },
                  gap: 2,
                }}
              >
                <SourceAccountField
                  accounts={accounts}
                  type={type}
                  sourceAccountId={sourceAccountId}
                  onAccountChange={(sourceAccountId) => setFormValues((current) => ({ ...current, sourceAccountId }))}
                  fieldId={`${fieldIdPrefix}-account`}
                />
                {type === 'transfer' ? (
                  <TransactionDetailField
                    type={type}
                    accounts={accounts}
                    categories={filteredCategories}
                    sourceAccountId={sourceAccountId}
                    categoryId={categoryId}
                    destinationAccountId={destinationAccountId}
                    onCategoryChange={(categoryId) => setFormValues((current) => ({ ...current, categoryId }))}
                    onDestinationChange={(destinationAccountId) => setFormValues((current) => ({ ...current, destinationAccountId }))}
                    fieldId={`${fieldIdPrefix}-detail`}
                  />
                ) : null}
              </Box>

              {type !== 'transfer' ? (
                <TransactionDetailField
                  type={type}
                  accounts={accounts}
                  categories={filteredCategories}
                  sourceAccountId={sourceAccountId}
                  categoryId={categoryId}
                  destinationAccountId={destinationAccountId}
                  onCategoryChange={(categoryId) => setFormValues((current) => ({ ...current, categoryId }))}
                  onDestinationChange={(destinationAccountId) => setFormValues((current) => ({ ...current, destinationAccountId }))}
                  fieldId={`${fieldIdPrefix}-detail`}
                />
              ) : null}

              <Box sx={{ gridColumn: type === 'transfer' ? '1 / -1' : undefined }}>
                <TransactionAmountFields
                  fieldId={`${fieldIdPrefix}-amount`}
                  initialValue={initialTransaction ? formatMinorUnits(initialTransaction.amount) : undefined}
                />
              </Box>

              <TextField
                id={`${fieldIdPrefix}-notes`}
                name="notes"
                label="备注"
                fullWidth
                size="small"
                multiline
                minRows={3}
                defaultValue={initialTransaction?.notes ?? ''}
                sx={{ gridColumn: '1 / -1' }}
              />
            </Box>

            {/* 提交交易记录 */}
            <TransactionSubmitButton
              isPending={isPending}
              type={type}
              fieldId={`${fieldIdPrefix}-submit`}
              label={isEditing ? '保存修改' : '保存记录'}
              disabled={
                isPending ||
                accounts.length === 0 ||
                (type !== 'transfer' && filteredCategories.length === 0)
              }
            />
          </Stack>
        </Box>
        </Stack>
      </Paper>
    </Stack>
  );
}