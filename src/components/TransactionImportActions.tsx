'use client';

import { useState, useTransition, type ChangeEvent } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import {
  previewTransactionImportAction,
  saveImportedTransactionsAction,
  type OcrImportRow,
} from '@/app/transactions/actions';
import TransactionListItem, { type TransactionListItemData } from '@/src/components/TransactionListItem';
import { toMinorUnits } from '@/src/lib/money';
import type { AccountOption, CategoryOption, TransactionType } from './TransactionEntryForm/types';

/**
 * 组件：交易截图导入
 * 功能：让用户上传微信或支付宝账单截图，检查识别结果并补充交易信息。
 * 确认后可将整理好的记录加入账本。
 */
type ImportSource = 'wechat' | 'alipay';
type PreviewTransaction = OcrImportRow & { id: number; categoryId: number | null };
type TransactionImportState = {
  // 当前导入来源；null 表示导入窗口关闭。
  selectedSource: ImportSource | null;
  // 用户选择的账单截图。
  selectedFile: File | null;
  // 识别后可检查和修改的交易列表。
  previewRows: PreviewTransaction[];
  // 用户选择将交易导入到哪个账户。
  accountId: string;
  // 阻止继续操作的错误信息。
  errorMessage: string;
  // 识别或分类建议产生的提醒。
  warningMessage: string;
  // 导入成功后显示的结果信息。
  successMessage: string;
};

type TransactionImportActionsProps = {
  accounts: AccountOption[];
  categories: CategoryOption[];
};

const importSourceLabels: Record<ImportSource, string> = {
  wechat: '微信',
  alipay: '支付宝',
};

function getSignedAmount(amount: string | null): number | null {
  if (!amount || !/^[+-]?\d+(?:\.\d{1,2})?$/.test(amount.trim())) return null;

  try {
    return toMinorUnits(amount.trim().startsWith('+') ? amount.trim().slice(1) : amount.trim());
  } catch {
    return null;
  }
}

function getTransactionType(amount: string | null): TransactionType | null {
  const signedAmount = getSignedAmount(amount);
  if (signedAmount === null || signedAmount === 0) return null;
  return signedAmount < 0 ? 'expense' : 'income';
}

function makeListItem(
  row: PreviewTransaction,
  account: AccountOption | undefined,
  categories: CategoryOption[],
): TransactionListItemData | null {
  const signedAmount = getSignedAmount(row.amount);
  const type = getTransactionType(row.amount);
  const occurredAt = row.occurredAt ? new Date(row.occurredAt) : null;
  const category = categories.find((item) => item.id === row.categoryId);

  if (
    signedAmount === null || signedAmount === 0 || !type || !occurredAt || Number.isNaN(occurredAt.getTime()) ||
    !account || (category && category.type !== type)
  ) {
    return null;
  }

  const parentCategory = !category || category.parentId === null
    ? undefined
    : categories.find((item) => item.id === category.parentId);

  return {
    id: row.id,
    type,
    amount: Math.abs(signedAmount),
    occurredAt,
    notes: row.description,
    accountId: account.id,
    toAccountId: null,
    accountName: account.name,
    currency: account.currency,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    categoryIcon: category?.icon ?? null,
    categoryColor: category?.color ?? null,
    categoryParentId: category?.parentId ?? null,
    categoryParentColor: parentCategory?.color ?? null,
    destinationAccountName: null,
  };
}

export default function TransactionImportActions({ accounts, categories }: TransactionImportActionsProps) {
  // 将来源、文件、预览、目标账户和结果提示集中保存为当前导入流程。
  const [importState, setImportState] = useState<TransactionImportState>(() => ({
    selectedSource: null,
    selectedFile: null,
    previewRows: [],
    accountId: String(accounts[0]?.id ?? ''),
    errorMessage: '',
    warningMessage: '',
    successMessage: '',
  }));
  const { selectedSource, selectedFile, previewRows, accountId, errorMessage, warningMessage, successMessage } = importState;
  // 标记截图识别或导入保存是否正在进行。
  const [isPending, startTransition] = useTransition();
  // 根据用户选择的账户 ID 找到对应账户资料。
  const selectedAccount = accounts.find((account) => account.id === Number(accountId));

  function updateImportState(updates: Partial<TransactionImportState>) {
    setImportState((current) => ({ ...current, ...updates }));
  }

  function openDialog(source: ImportSource) {
    updateImportState({
      selectedSource: source,
      selectedFile: null,
      previewRows: [],
      accountId: String(accounts[0]?.id ?? ''),
      errorMessage: '',
      warningMessage: '',
    });
  }

  function closeDialog() {
    updateImportState({
      selectedSource: null,
      selectedFile: null,
      previewRows: [],
      errorMessage: '',
      warningMessage: '',
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    updateImportState({
      selectedFile: event.currentTarget.files?.[0] ?? null,
      previewRows: [],
      errorMessage: '',
      warningMessage: '',
    });
    event.currentTarget.value = '';
  }

  function recognizeScreenshot() {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.set('screenshot', selectedFile);
    updateImportState({ errorMessage: '' });

    startTransition(async () => {
      try {
        const result = await previewTransactionImportAction(formData);
        if (!result.success) {
          updateImportState({ errorMessage: result.message });
          return;
        }

        updateImportState({
          warningMessage: result.classificationWarning ?? '',
          previewRows: result.rows,
        });
      } catch {
        updateImportState({ errorMessage: '截图识别失败，请稍后重试' });
      }
    });
  }

  function confirmImport() {
    if (!selectedAccount || previewRows.length === 0) return;

    const rows = previewRows.map((row) => ({
      amount: row.amount ?? '',
      occurredAt: row.occurredAt && !Number.isNaN(new Date(row.occurredAt).getTime())
        ? new Date(row.occurredAt).toISOString()
        : '',
      description: row.description ?? '',
      categoryId: row.categoryId ?? 0,
    }));
    updateImportState({ errorMessage: '' });

    startTransition(async () => {
      try {
        const result = await saveImportedTransactionsAction({ accountId: selectedAccount.id, rows });
        if (!result.success) {
          updateImportState({ errorMessage: result.message });
          return;
        }

        updateImportState({ successMessage: result.message });
        closeDialog();
      } catch {
        updateImportState({ errorMessage: '批量保存失败，请稍后重试' });
      }
    });
  }

  function changeRowCategory(rowId: number, categoryValue: string) {
    const categoryId = categoryValue ? Number(categoryValue) : null;
    const category = categories.find((item) => item.id === categoryId);
    const parentCategory = category?.parentId === null || !category
      ? undefined
      : categories.find((item) => item.id === category.parentId);
    setImportState((current) => ({
      ...current,
      previewRows: current.previewRows.map((row) => row.id === rowId ? {
        ...row,
        categoryId,
        categoryCode: category?.code ?? null,
        categoryName: category?.name ?? null,
        categoryPath: category
          ? parentCategory ? `${parentCategory.name} / ${category.name}` : category.name
          : null,
        categoryConfidence: null,
        categoryReason: null,
      } : row),
    }));
  }

  // 将预览行整理成交易列表项的显示数据。
  const listItems = previewRows.map((row) => makeListItem(row, selectedAccount, categories));
  // 检查每笔导入交易是否都已选择匹配收支方向的分类。
  const hasMatchingCategory = previewRows.every((row) => {
    const type = getTransactionType(row.amount);
    return Boolean(type && categories.some((category) => category.id === row.categoryId && category.type === type));
  });
  // 只有账户、有效预览内容和匹配分类均齐备时才允许确认导入。
  const canConfirm = Boolean(
    selectedAccount && previewRows.length > 0 && listItems.every((item) => item !== null) && hasMatchingCategory,
  );

  return (
    <>
      {successMessage ? (
        <Alert severity="success" onClose={() => updateImportState({ successMessage: '' })}>
          {successMessage}
        </Alert>
      ) : null}
      <Paper
        id="txn-import-actions"
        component="section"
        variant="outlined"
        aria-labelledby="txn-import-title"
        sx={{ p: { xs: 2, md: 2.5 }, borderColor: 'divider' }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Box>
            <Typography id="txn-import-title" component="h2" variant="subtitle1">
              导入交易
            </Typography>
          </Box>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              id="txn-import-wechat"
              variant="outlined"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => openDialog('wechat')}
            >
              从微信导入
            </Button>
            <Button
              id="txn-import-alipay"
              variant="outlined"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => openDialog('alipay')}
            >
              从支付宝导入
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Dialog
        open={selectedSource !== null}
        onClose={closeDialog}
        fullWidth
        maxWidth={previewRows.length > 0 ? 'lg' : 'sm'}
        scroll="paper"
      >
        <DialogTitle>
          {previewRows.length > 0 ? '预览待导入交易' : selectedSource ? `从${importSourceLabels[selectedSource]}导入` : '导入交易'}
        </DialogTitle>
        <DialogContent dividers>
          {errorMessage ? <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert> : null}
          {warningMessage ? <Alert severity="warning" sx={{ mb: 2 }}>{warningMessage}</Alert> : null}

          {selectedSource === 'wechat' && previewRows.length === 0 ? (
            <Stack spacing={2}>
              <Button component="label" variant="outlined" startIcon={<UploadFileOutlinedIcon />}>
                上传微信账单截图
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                />
              </Button>
              <Typography variant="body2" color="text.secondary">
                支持 JPG、PNG、WebP，文件不超过 5 MB
              </Typography>
              {selectedFile ? (
                <Typography variant="body2">{selectedFile.name}</Typography>
              ) : null}
            </Stack>
          ) : null}

          {selectedSource === 'alipay' ? (
            <TextField
              id="txn-alipay-import-content"
              label="账单内容"
              fullWidth
              multiline
              minRows={8}
              margin="dense"
            />
          ) : null}

          {previewRows.length > 0 ? (
            <Stack spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel id="txn-import-account-label">导入到账户</InputLabel>
                <Select
                  id="txn-import-account"
                  labelId="txn-import-account-label"
                  value={accountId}
                  label="导入到账户"
                  onChange={(event) => updateImportState({ accountId: event.target.value })}
                >
                  {accounts.map((account) => (
                    <MenuItem key={account.id} value={String(account.id)}>
                      {account.name} · {account.currency}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box component="section" aria-labelledby="txn-import-preview-title">
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
                  <Typography id="txn-import-preview-title" component="h3" variant="subtitle1">
                    待导入流水
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {previewRows.length} 笔
                  </Typography>
                </Box>
                {!hasMatchingCategory ? (
                  <Alert severity="warning" sx={{ mb: 1 }}>
                    请为每笔交易选择与收支方向匹配的分类后再确认。
                  </Alert>
                ) : null}
                <Stack divider={<Divider flexItem />}>
                  {previewRows.map((row, index) => {
                    const item = listItems[index];
                    const type = getTransactionType(row.amount);
                    const matchingCategories = type
                      ? categories.filter((category) => category.type === type)
                      : [];

                    return (
                      <Box key={row.id} sx={{ py: 1 }}>
                        {item ? (
                          <TransactionListItem transaction={item} />
                        ) : (
                          <Alert severity="warning" sx={{ my: 1 }}>
                            第 {index + 1} 笔未能识别有效的日期或金额
                            {row.ocrText ? `：${row.ocrText}` : ''}
                          </Alert>
                        )}
                        {row.description ? (
                          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, pl: 5 }}>
                            {row.description}
                          </Typography>
                        ) : null}
                        {row.categoryConfidence !== null ? (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 5 }}>
                            DeepSeek {Math.round(row.categoryConfidence * 100)}% · {row.categoryReason}
                          </Typography>
                        ) : null}
                        {type && matchingCategories.length > 0 ? (
                          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                            <InputLabel id={`txn-import-category-label-${row.id}`}>分类</InputLabel>
                            <Select
                              id={`txn-import-category-${row.id}`}
                              labelId={`txn-import-category-label-${row.id}`}
                              value={row.categoryId === null ? '' : String(row.categoryId)}
                              label="分类"
                              onChange={(event) => changeRowCategory(row.id, event.target.value)}
                            >
                              {matchingCategories.map((category) => (
                                <MenuItem key={category.id} value={String(category.id)}>
                                  {category.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : null}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={isPending}>
            {previewRows.length > 0 ? '取消导入' : '取消'}
          </Button>
          {selectedSource === 'wechat' && previewRows.length === 0 ? (
            <Button variant="contained" onClick={recognizeScreenshot} disabled={!selectedFile || isPending}>
              {isPending ? '识别中…' : '识别并预览'}
            </Button>
          ) : null}
          {previewRows.length > 0 ? (
            <Button variant="contained" onClick={confirmImport} disabled={!canConfirm || isPending}>
              {isPending ? '保存中…' : `确认保存 ${previewRows.length} 笔`}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </>
  );
}