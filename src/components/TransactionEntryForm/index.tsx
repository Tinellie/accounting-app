'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { createTransactionAction } from '@/app/transactions/actions';
import SourceAccountField from './SourceAccountField';
import TransactionAmountFields from './TransactionAmountFields';
import TransactionDateField from './TransactionDateField';
import TransactionDetailField from './TransactionDetailField';
import TransactionImportActions from '@/src/components/TransactionImportActions';
import TransactionSubmitButton from './TransactionSubmitButton';
import TransactionTypeSelector from './TransactionTypeSelector';
import type { CategoryOption, TransactionType, AccountOption } from './types';

type TransactionEntryFormProps = {
  accounts: AccountOption[];
  categories: CategoryOption[];
};

const initialActionState = { success: false, message: '' };

// 管理表单状态，并组合各个交易录入子组件。
export default function TransactionEntryForm({ accounts, categories }: TransactionEntryFormProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [state, formAction, isPending] = useActionState(createTransactionAction, initialActionState);
  const filteredCategories = categories.filter((category) => category.type === type);

  useEffect(() => {
    startTransition(() => setOccurredAt(new Date().toISOString()));
  }, [setOccurredAt]);

  useEffect(() => {
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
      setType(nextType);
      setCategoryId('');
      setDestinationAccountId('');
    }

    document.addEventListener('keydown', handleTransactionShortcut);
    return () => document.removeEventListener('keydown', handleTransactionShortcut);
  }, []);

  function changeType(nextType: TransactionType) {
    setType(nextType);
    setCategoryId('');
    setDestinationAccountId('');
  }

  return (
    <Stack spacing={2.5}>
      <TransactionImportActions accounts={accounts} categories={categories} />
      <Paper
        id="txn-form"
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
        <Typography id="txn-form-title" component="h2" variant="h2">记一笔</Typography>

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
        <Box id="txn-entry" component="form" action={formAction}>
          <Stack className="txn-entry-fields" spacing={2}>
            {/* 选择支出、收入或转账 */}
            <TransactionTypeSelector type={type} onTypeChange={changeType} />

            {/* 交易的时间、账户、金额和备注等输入项 */}
            <Box
              id="txn-fields"
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 2,
              }}
            >
              <Box sx={{ gridColumn: '1 / -1' }}>
                <TransactionDateField occurredAt={occurredAt} onDateChange={setOccurredAt} />
              </Box>

              <Box
                id="txn-account-row"
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
                  onAccountChange={setSourceAccountId}
                />
                {type === 'transfer' ? (
                  <TransactionDetailField
                    type={type}
                    accounts={accounts}
                    categories={filteredCategories}
                    sourceAccountId={sourceAccountId}
                    categoryId={categoryId}
                    destinationAccountId={destinationAccountId}
                    onCategoryChange={setCategoryId}
                    onDestinationChange={setDestinationAccountId}
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
                  onCategoryChange={setCategoryId}
                  onDestinationChange={setDestinationAccountId}
                />
              ) : null}

              <Box sx={{ gridColumn: type === 'transfer' ? '1 / -1' : undefined }}>
                <TransactionAmountFields />
              </Box>

              <TextField
                id="txn-notes"
                name="notes"
                label="备注"
                fullWidth
                size="small"
                multiline
                minRows={3}
                sx={{ gridColumn: '1 / -1' }}
              />
            </Box>

            {/* 提交交易记录 */}
            <TransactionSubmitButton
              isPending={isPending}
              type={type}
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