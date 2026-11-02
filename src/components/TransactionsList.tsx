'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Paper, Snackbar, Stack, Tooltip, Typography } from '@mui/material';
import {
  Delete as DeleteIcon,
  EditOutlined as EditOutlinedIcon,
  SwapVert as SwapVertIcon,
} from '@mui/icons-material';
import {
  bulkUpdateTransactionAccountAction,
  bulkUpdateTransactionCategoryAction,
  deleteTransactionsAction,
  reverseTransactionCategoryTypeAction,
} from '@/app/transactions/actions';
import TransactionDetailField from '@/src/components/TransactionEntryForm/TransactionDetailField';
import SourceAccountField from '@/src/components/TransactionEntryForm/SourceAccountField';
import TransactionEntryForm from '@/src/components/TransactionEntryForm';
import type {
  AccountOption,
  CategoryOption,
  EditableTransaction,
} from '@/src/components/TransactionEntryForm/types';
import TransactionListItem, { type TransactionListItemData } from '@/src/components/TransactionListItem';
import type { PreviewTransaction } from '@/src/lib/wechat-import/types';
import { assignPreviewAccount, assignPreviewCategory, editPreviewRow, updateRowSelection } from '@/src/lib/wechat-import/preview';
import { createTransactionSchema } from '@/src/lib/validations';

/**
 * 组件：交易列表
 * 功能：按月份展示交易记录，供用户查看和勾选流水。
 * 用户可以批量修改分类或账户、反转收支、编辑及删除记录。
 */
type EditableTransactionsListProps = {
  transactions: TransactionListItemData[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  showDebugData?: boolean;
};

type TransactionsListProps = (EditableTransactionsListProps & { mode?: 'default' }) | {
  mode: 'preview';
  transactions: PreviewTransaction[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  onChange: (transactions: PreviewTransaction[]) => void;
  disabled?: boolean;
  showDebugData?: boolean;
};

type TransactionActionResult = { success: boolean; message: string };

export default function TransactionsList(props: TransactionsListProps) {
  return <EditableTransactionsList {...props} />;
}

function TransactionRows({ transactions, preview = false, selectedIds, onSelectedChange, showDebugData = true }: {
  transactions: (TransactionListItemData | PreviewTransaction)[];
  preview?: boolean;
  selectedIds?: Set<number>;
  onSelectedChange?: (id: number, selected: boolean, exclusive?: boolean) => void;
  showDebugData?: boolean;
}) {
  const headingId = useId();
  const groups: { key: string; label: string; transactions: (TransactionListItemData | PreviewTransaction)[] }[] = [];
  const formatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', ...(preview ? { timeZone: 'Asia/Shanghai' } : {}) });
  transactions.forEach((transaction) => {
    const label = transaction.occurredAt ? formatter.format(transaction.occurredAt) : '日期待修正';
    const previous = groups[groups.length - 1];
    if (previous?.label === label) previous.transactions.push(transaction);
    else groups.push({ key: `${label}-${transaction.id}`, label, transactions: [transaction] });
  });
  return (
    <Box id={preview ? undefined : 'txn-list'} component="section" aria-labelledby={headingId} sx={{ pb: preview ? 0 : { xs: 22, md: 12 } }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography id={headingId} component="h2" variant="h2">{preview ? '识别预览' : '全部流水'}</Typography>
        <Typography variant="body2" color="text.secondary">{transactions.length} 笔</Typography>
      </Box>
      {transactions.length === 0 ? <Typography color="text.secondary" sx={{ py: 3 }}>暂无交易记录</Typography> : (
        <Stack spacing={2}>
          {groups.map((group) => (
            <Box key={group.key}>
              <Box component="header" sx={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 36, px: 1.5, py: 0.75, mb: 0.5, borderRadius: 0, bgcolor: 'action.hover', color: 'text.secondary' }}>
                <Typography variant="subtitle2" sx={{ color: 'inherit', fontWeight: 600 }}>{group.label}</Typography>
              </Box>
              <Stack divider={<Divider flexItem />}>
                {group.transactions.map((transaction) => (
                  <TransactionListItem
                    key={transaction.id}
                    transaction={transaction}
                    showDebugData={showDebugData}
                    selected={selectedIds?.has(transaction.id)}
                    onSelectedChange={onSelectedChange ? (selected, exclusive) => onSelectedChange(transaction.id, selected, exclusive) : undefined}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function EditableTransactionsList(props: TransactionsListProps) {
  const { transactions, accounts, categories, showDebugData } = props;
  const preview = props.mode === 'preview';
  const fieldPrefix = useId();
  const router = useRouter();
  // 当前勾选的交易 ID，用于计算批量操作的目标。
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // 批量分类和账户选择框当前显示的值。
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkAccountId, setBulkAccountId] = useState('');
  // 最近一次批量操作的成功或失败提示。
  const [feedback, setFeedback] = useState<TransactionActionResult | null>(null);
  // 非空时表示正在编辑的交易；null 表示编辑窗口关闭。
  const [editingTransaction, setEditingTransaction] = useState<(Omit<EditableTransaction, 'amount' | 'occurredAt' | 'accountId'> & {
    amount: number | null; occurredAt: Date | null; accountId: number | null;
  }) | null>(null);
  // 当前需要确认的操作，避免删除和反转确认窗口同时打开。
  const [confirmationAction, setConfirmationAction] = useState<'delete' | 'reverse' | null>(null);
  // 标记批量操作是否正在提交。
  const [isPending, startTransition] = useTransition();
  const disabled = isPending || (props.mode === 'preview' && props.disabled === true);

  // 当前选中的交易记录。
  const selectedTransactions = transactions.filter((transaction) => selectedIds.has(transaction.id));
  // 首笔选中交易的类型，用于判断批量操作是否适用。
  const selectedType = selectedTransactions[0]?.type;
  // 仅当所选记录全为相同方向的收支交易时才允许分类操作。
  const canChangeCategory = (
    selectedType === 'expense' || selectedType === 'income'
  ) && selectedTransactions.every((transaction) => transaction.type === selectedType);
  const containsRefund = selectedTransactions.some((transaction) => transaction.type === 'expense' && (transaction.amount ?? 0) < 0);
  const canReverse = canChangeCategory && selectedTransactions.every((row) => row.amount !== null && row.amount > 0);
  // 所有交易均被选中时，全选框显示选中状态。
  const allSelected = transactions.length > 0 && selectedTransactions.length === transactions.length;
  // 反转后的目标类型和该类型下的默认一级分类。
  const reverseType = selectedType === 'expense' ? 'income' : 'expense';
  const reverseCategory = categories
    .filter((category) => category.type === reverseType && category.parentId === null)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))[0];
  // 仅单选且不是余额调整时允许打开编辑表单。
  const editableSelection = selectedTransactions.length === 1 && selectedTransactions[0]?.type !== 'adjustment'
    ? selectedTransactions[0]
    : null;

  function runAction(action: () => Promise<TransactionActionResult>, clearSelection = false) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        setFeedback(result);
        if (result.success) {
          if (clearSelection) setSelectedIds(new Set());
          router.refresh();
        }
      } catch {
        setFeedback({ success: false, message: '操作失败，请稍后重试' });
      }
    });
  }

  function changeRowSelection(transactionId: number, selected: boolean, exclusive = false) {
    if (disabled) return;
    setSelectedIds((current) => updateRowSelection(current, transactionId, selected, exclusive));
  }

  function changePreview(operation: (rows: PreviewTransaction[]) => PreviewTransaction[]) {
    if (props.mode !== 'preview' || disabled) return;
    try {
      props.onChange(operation(props.transactions));
      setFeedback({ success: true, message: '已修改预览，尚未写入数据库' });
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : '修改预览失败' });
    }
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(transactions.map((transaction) => transaction.id)));
  }

  function handleCategoryChange(categoryValue: string) {
    const categoryId = Number(categoryValue);
    if (!canChangeCategory || !Number.isSafeInteger(categoryId) || categoryId <= 0) return;
    setBulkCategoryId(categoryValue);
    const transactionIds = selectedTransactions.map((transaction) => transaction.id);
    if (props.mode === 'preview') {
      changePreview((rows) => {
        const category = categories.find((item) => item.id === categoryId);
        if (!category) throw new Error('所选分类不存在');
        return rows.map((row) => selectedIds.has(row.id) ? assignPreviewCategory(row, category, categories) : row);
      });
      return;
    }
    runAction(() => bulkUpdateTransactionCategoryAction({ transactionIds, categoryId }));
  }

  function handleAccountChange(accountValue: string) {
    const accountId = Number(accountValue);
    if (selectedTransactions.length === 0 || !Number.isSafeInteger(accountId) || accountId <= 0) return;
    setBulkAccountId(accountValue);
    const transactionIds = selectedTransactions.map((transaction) => transaction.id);
    if (props.mode === 'preview') {
      changePreview((rows) => {
        const account = accounts.find((item) => item.id === accountId);
        if (!account) throw new Error('所选账户不存在');
        return rows.map((row) => selectedIds.has(row.id) ? assignPreviewAccount(row, account) : row);
      });
      return;
    }
    runAction(() => bulkUpdateTransactionAccountAction({ transactionIds, accountId }));
  }

  function confirmDeleteSelection() {
    const transactionIds = selectedTransactions.map((transaction) => transaction.id);
    setConfirmationAction(null);
    if (props.mode === 'preview') {
      changePreview((rows) => rows.filter((row) => !selectedIds.has(row.id)));
      setSelectedIds(new Set());
      return;
    }
    runAction(() => deleteTransactionsAction(transactionIds), true);
  }

  function confirmReverseSelection() {
    const transactionIds = selectedTransactions.map((transaction) => transaction.id);
    setConfirmationAction(null);
    if (props.mode === 'preview') {
      changePreview((rows) => {
        if (!canReverse || !reverseCategory) throw new Error('只能反转金额有效、同类型且不包含退款的交易');
        return rows.map((row) => selectedIds.has(row.id)
          ? assignPreviewCategory({ ...row, type: reverseType, isRefund: false }, reverseCategory, categories) : row);
      });
      return;
    }
    runAction(() => reverseTransactionCategoryTypeAction(transactionIds));
  }

  function openEdit() {
    if (!editableSelection) return;
    setEditingTransaction({
      id: editableSelection.id,
      type: editableSelection.type === 'income' || editableSelection.type === 'transfer' ? editableSelection.type : 'expense',
      amount: editableSelection.amount,
      occurredAt: editableSelection.occurredAt,
      accountId: editableSelection.accountId,
      toAccountId: editableSelection.toAccountId,
      categoryId: editableSelection.categoryId,
      notes: editableSelection.notes,
    });
  }

  function closeEdit() {
    setEditingTransaction(null);
  }

  function savePreviewEdit(formData: FormData): TransactionActionResult {
    if (props.mode !== 'preview' || disabled || !editingTransaction) return { success: false, message: '预览当前不可编辑' };
    const parsed = createTransactionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? '交易信息无效' };
    try {
      props.onChange(props.transactions.map((row) => row.id === editingTransaction.id
        ? editPreviewRow(row, parsed.data, accounts, categories) : row));
      return { success: true, message: '已修改预览，尚未写入数据库' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '修改预览失败' };
    }
  }

  return (
    <>
      <TransactionRows transactions={transactions} preview={preview} selectedIds={selectedIds} onSelectedChange={disabled ? undefined : changeRowSelection} showDebugData={showDebugData} />

      <Paper
        component="section"
        aria-label="所选交易操作"
        elevation={8}
        sx={{
          position: preview ? 'sticky' : 'fixed',
          left: preview ? 0 : { xs: 0, md: 256 },
          right: 0,
          bottom: 0,
          zIndex: (theme) => preview ? 1 : theme.zIndex.appBar,
          px: { xs: 1.5, md: 3 },
          py: 1.5,
          borderRadius: 0,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '32px minmax(0, 1fr) 40px 40px 40px',
              md: '32px auto minmax(180px, 1fr) minmax(180px, 1fr) 40px 40px 40px',
            },
            alignItems: 'center',
            gap: 1,
            maxWidth: 1440,
            mx: 'auto',
          }}
        >
          <Checkbox
            disabled={disabled}
            checked={allSelected}
            indeterminate={!allSelected && selectedTransactions.length > 0}
            onChange={toggleAll}
            slotProps={{ input: { 'aria-label': allSelected ? '取消全选交易' : '全选交易' } }}
            sx={{ gridColumn: 1, justifySelf: 'center', p: 0.5 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ gridColumn: { xs: 2, md: 2 }, whiteSpace: 'nowrap' }}>
            已选 {selectedTransactions.length} 项
          </Typography>

          <Box sx={{ gridColumn: { xs: '1 / 3', md: 3 }, minWidth: 0 }}>
            <TransactionDetailField
              key={`bulk-category-${canChangeCategory ? selectedType : 'disabled'}`}
              type={canChangeCategory ? selectedType : 'expense'}
              accounts={accounts}
              categories={canChangeCategory ? categories.filter((category) => category.type === selectedType) : categories.filter((category) => category.type === 'expense')}
              sourceAccountId=""
              categoryId={bulkCategoryId}
              destinationAccountId=""
              onCategoryChange={handleCategoryChange}
              onDestinationChange={() => undefined}
              fieldId={`${fieldPrefix}-bulk-category`}
              disabled={!canChangeCategory || disabled}
            />
          </Box>
          <Box sx={{ gridColumn: { xs: '3 / 6', md: 4 }, minWidth: 0 }}>
            <SourceAccountField
              accounts={accounts}
              type={selectedType === 'transfer' ? 'transfer' : 'expense'}
              sourceAccountId={bulkAccountId}
              onAccountChange={handleAccountChange}
              fieldId={`${fieldPrefix}-bulk-account`}
              labelOverride="账户"
              disabled={selectedTransactions.length === 0 || disabled}
            />
          </Box>

          <Tooltip title={containsRefund ? '退款记录不能反转收支类型，请通过编辑修改' : `反转支出/收入，分类设为目标类型首个分类${reverseCategory ? `：${reverseCategory.name}` : ''}`}>
            <Box sx={{ gridColumn: { xs: 3, md: 5 }, justifySelf: 'center' }}>
              <IconButton
                aria-label="反转收支类型"
                disabled={!canReverse || containsRefund || !reverseCategory || disabled}
                onClick={() => setConfirmationAction('reverse')}
                sx={{ width: 40, height: 40, borderRadius: 1 }}
              >
                <SwapVertIcon />
              </IconButton>
            </Box>
          </Tooltip>
          <Tooltip title="编辑所选交易">
            <Box sx={{ gridColumn: { xs: 4, md: 6 }, justifySelf: 'center' }}>
              <IconButton
                aria-label="编辑所选交易"
                disabled={selectedTransactions.length !== 1 || !editableSelection || disabled}
                onClick={openEdit}
                sx={{ width: 40, height: 40, borderRadius: 1 }}
              >
                <EditOutlinedIcon />
              </IconButton>
            </Box>
          </Tooltip>
          <Tooltip title="删除所选交易">
            <Box sx={{ gridColumn: { xs: 5, md: 7 }, justifySelf: 'center' }}>
              <IconButton
                aria-label="删除所选交易"
                color="error"
                disabled={selectedTransactions.length === 0 || disabled}
                onClick={() => setConfirmationAction('delete')}
                sx={{ width: 40, height: 40, borderRadius: 1 }}
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          </Tooltip>
        </Box>
      </Paper>

      <Dialog open={confirmationAction === 'reverse'} onClose={() => setConfirmationAction(null)} maxWidth="xs" fullWidth>
        <DialogTitle>反转收支类型</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            将 {selectedTransactions.length} 笔交易反转为{reverseType === 'income' ? '收入' : '支出'}，分类统一设为“{reverseCategory?.name}”。{preview ? '仅修改预览，保存导入后才更新余额。' : '并同步调整账户余额。'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmationAction(null)}>取消</Button>
          <Button variant="contained" onClick={confirmReverseSelection} disabled={disabled}>
            确认反转
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmationAction === 'delete'} onClose={() => setConfirmationAction(null)} maxWidth="xs" fullWidth>
        <DialogTitle>删除交易</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {preview ? `从预览中移除所选 ${selectedTransactions.length} 笔交易，不会修改数据库或账户余额。` : `删除所选 ${selectedTransactions.length} 笔交易，并同步回退账户余额。此操作无法撤销。`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmationAction(null)}>取消</Button>
          <Button variant="contained" color="error" onClick={confirmDeleteSelection} disabled={disabled}>
            删除
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editingTransaction !== null} onClose={closeEdit} fullWidth maxWidth="md">
        {editingTransaction ? (
          <TransactionEntryForm
            key={editingTransaction.id}
            accounts={accounts}
            categories={categories}
            initialTransaction={editingTransaction}
            onPreviewSubmit={preview ? savePreviewEdit : undefined}
            onSaved={() => {
              closeEdit();
              setSelectedIds(new Set());
              if (!preview) router.refresh();
            }}
          />
        ) : null}
      </Dialog>

      <Snackbar open={feedback !== null} autoHideDuration={4000} onClose={() => setFeedback(null)}>
        {feedback ? (
          <Alert severity={feedback.success ? 'success' : 'error'} onClose={() => setFeedback(null)}>
            {feedback.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}