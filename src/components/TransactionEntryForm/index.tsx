'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { createTransactionAction } from '@/app/transactions/actions';
import SourceAccountField from './SourceAccountField';
import TransactionAmountFields from './TransactionAmountFields';
import TransactionDateField from './TransactionDateField';
import TransactionDetailField from './TransactionDetailField';
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

  function changeType(nextType: TransactionType) {
    setType(nextType);
    setCategoryId('');
    setDestinationAccountId('');
  }

  return (
    <Paper id="txn-form" component="section" variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderColor: 'divider' }}>
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
              {/* 选择交易发生时间 */}
              <TransactionDateField occurredAt={occurredAt} onDateChange={setOccurredAt} />

              {/* 选择来源账户 */}
              <SourceAccountField
                accounts={accounts}
                type={type}
                sourceAccountId={sourceAccountId}
                onAccountChange={setSourceAccountId}
              />

              {/* 转账时选择转入账户，其他类型选择交易分类 */}
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

              {/* 输入交易金额和备注 */}
              <TransactionAmountFields />
            </Box>

            {/* 提交交易记录 */}
            <TransactionSubmitButton
              isPending={isPending}
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
  );
}