'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import { UploadFile as UploadFileIcon } from '@mui/icons-material';
import TransactionsList from '@/src/components/TransactionsList';
import SourceAccountField from '@/src/components/TransactionEntryForm/SourceAccountField';
import type { AccountOption } from '@/src/components/TransactionEntryForm/types';
import WechatImportProgress from '@/src/components/WechatImportProgress';
import { readImportStream } from '@/src/lib/wechat-import/stream';
import type { ImportProgress, ImportStage, PreviewTransaction } from '@/src/lib/wechat-import/types';
import { saveWechatImportAction } from '@/app/transactions/import-actions';

export default function WechatImportDialog({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<PreviewTransaction[] | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [progress, setProgress] = useState<Partial<Record<ImportStage, ImportProgress>>>({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const saveLock = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  function resetImport() {
    if (saveLock.current) return;
    controller.current?.abort();
    controller.current = null;
    setPending(false);
    setConfirmSave(false);
    setError(null);
    setTransactions(null);
    setBatchId(null);
    setSelectedAccountId('');
    setProgress({});
    setSavedMessage(null);
  }

  function close() {
    if (saveLock.current) return;
    resetImport();
    setOpen(false);
  }

  async function load(file: File) {
    setError(null);
    setTransactions(null);
    setSelectedAccountId('');
    setProgress({});
    setBatchId(null);
    setSavedMessage(null);
    if (file.size > 20 * 1024 * 1024) {
      setError('图片不能超过 20 MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('请选择 JPG、PNG 或 WebP 图片');
      return;
    }
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setPending(true);
    try {
      const form = new FormData();
      form.set('image', file);
      const response = await fetch('/api/wechat-import', {
        method: 'POST',
        headers: { Accept: 'application/x-ndjson' },
        body: form,
        signal: abort.signal,
      });
      if (!response.ok) {
        const result: { error?: string } = await response.json();
        throw new Error(result.error ?? `导入失败（HTTP ${response.status}）`);
      }
      const result = await readImportStream(response, (update) => {
        if (!abort.signal.aborted) setProgress((current) => ({ ...current, [update.stage]: update }));
      });
      if (!abort.signal.aborted) {
        setBatchId(result.batchId);
        setTransactions(result.transactions.map((transaction) => ({
          ...transaction,
          occurredAt: transaction.occurredAt ? new Date(transaction.occurredAt) : null,
        })));
      }
    } catch (error) {
      if (!abort.signal.aborted) setError(error instanceof Error ? error.message : '截图识别失败，请重试');
    } finally {
      if (controller.current === abort) {
        setPending(false);
        controller.current = null;
      }
    }
  }

  const invalidCount = transactions?.filter((transaction) => transaction.importDebug.errors.length > 0 || transaction.aiCategory?.status === 'error').length ?? 0;
  const warningCount = transactions?.filter((transaction) => transaction.aiCategory?.status === 'warning').length ?? 0;
  const selectedAccount = accounts.find((account) => String(account.id) === selectedAccountId);
  const previewTransactions = transactions?.map((transaction) => selectedAccount ? {
    ...transaction,
    accountId: selectedAccount.id,
    accountName: selectedAccount.name,
    currency: selectedAccount.currency,
  } : transaction) ?? null;
  const hasInvalidRows = transactions?.some((transaction) => (
    !transaction.type
    || transaction.amount === null || !Number.isSafeInteger(transaction.amount) || transaction.amount <= 0
    || !transaction.occurredAt || !Number.isFinite(transaction.occurredAt.getTime())
    || !transaction.categoryId
    || (transaction.notes?.length ?? 0) > 1000
  )) ?? false;
  const canSave = Boolean(batchId && transactions?.length && selectedAccount?.currency === 'CNY'
    && invalidCount === 0 && !hasInvalidRows && !savedMessage && !pending && !isSaving);

  function save() {
    if (!canSave || !batchId || !selectedAccount || saveLock.current) return;
    saveLock.current = true;
    setConfirmSave(false);
    setError(null);
    startSaving(async () => {
      try {
        const result = await saveWechatImportAction({ batchId, accountId: selectedAccount.id });
        if (result.success) {
          setSavedMessage(result.message);
          router.refresh();
        } else {
          setError(result.message);
        }
      } catch {
        setError('保存结果未确认，请重试；同一批次重试不会重复入账');
      } finally {
        saveLock.current = false;
      }
    });
  }
  return (
    <>
      <Box>
        <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setOpen(true)}>从微信截图导入</Button>
      </Box>
      <Dialog open={open} onClose={close} fullWidth maxWidth="md" scroll="paper">
        <DialogTitle>从微信截图导入</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="选择微信账单截图"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void load(file);
              }}
            />
            {!transactions ? (
              <>
                <Button variant="contained" disabled={pending} startIcon={<UploadFileIcon />} onClick={() => inputRef.current?.click()}>
                  选择图片文件
                </Button>
                {pending || Object.keys(progress).length > 0 ? <WechatImportProgress progress={progress} pending={pending} failed={error !== null} /> : null}
              </>
            ) : null}
            {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
            {transactions && previewTransactions ? (
              <>
                <Alert severity={invalidCount ? 'error' : warningCount ? 'warning' : 'success'}>
                  识别出 {transactions.length} 笔交易，{invalidCount} 笔存在识别或 AI 分类错误，{warningCount} 笔 AI 分类置信度低于 50%。请确认金额、日期和分类；AI 置信度是模型自报分数，不代表实际准确率。
                </Alert>
                <SourceAccountField
                  accounts={accounts}
                  type="expense"
                  sourceAccountId={selectedAccountId}
                  onAccountChange={(value) => {
                    setSelectedAccountId(value);
                    setError(null);
                  }}
                  fieldId="wechat-import-account"
                  disabled={isSaving || savedMessage !== null || accounts.length === 0}
                />
                {accounts.length === 0 ? <Alert severity="warning">暂无可用账户，请先在账户管理中添加账户。</Alert> : null}
                {!savedMessage && (invalidCount > 0 || hasInvalidRows) ? <Alert severity="error">本批次存在红色错误或无效交易信息，无法保存。请重新识别后再试。</Alert> : null}
                {selectedAccount && selectedAccount.currency !== 'CNY' ? <Alert severity="error">微信账单金额为 CNY，请选择人民币账户；暂不支持汇率转换。</Alert> : null}
                {savedMessage ? <Alert severity="success" role="status">{savedMessage}</Alert> : null}
                <TransactionsList mode="preview" transactions={previewTransactions} showDebugData={false} />
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={isSaving}>
            {pending ? '取消识别' : transactions && !savedMessage ? '取消' : '关闭'}
          </Button>
          {transactions && !savedMessage ? (
            <Button variant="contained" disabled={!canSave} onClick={() => setConfirmSave(true)}>
              {isSaving ? '正在保存…' : `保存 ${transactions.length} 笔交易`}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
      <Dialog open={confirmSave} onClose={() => setConfirmSave(false)} maxWidth="xs" fullWidth>
        <DialogTitle>确认保存导入交易</DialogTitle>
        <DialogContent>
          将 {transactions?.length ?? 0} 笔交易保存到“{selectedAccount?.name}”，并同步更新账户余额。
          {warningCount > 0 ? `其中 ${warningCount} 笔 AI 分类置信度低于 50%，确认保存表示你已核对这些分类。` : ''}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSave(false)}>取消</Button>
          <Button variant="contained" disabled={!canSave} onClick={save}>确认保存</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
