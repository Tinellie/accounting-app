'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import { UploadFile as UploadFileIcon } from '@mui/icons-material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import TransactionsList from '@/src/components/TransactionsList';
import SourceAccountField from '@/src/components/TransactionEntryForm/SourceAccountField';
import type { AccountOption, CategoryOption } from '@/src/components/TransactionEntryForm/types';
import { activeOcrErrors, assignPreviewAccount, hasActiveAiError, hasActiveAiWarning, serializePreviewRows } from '@/src/lib/wechat-import/preview';
import WechatImportProgress from '@/src/components/WechatImportProgress';
import { readImportStream } from '@/src/lib/wechat-import/stream';
import type { ImportProgress, ImportStage, PreviewTransaction } from '@/src/lib/wechat-import/types';
import { saveWechatImportAction } from '@/app/transactions/import-actions';
import { chinaToday, cmbCardGroups, validScreenshotDate } from '@/src/lib/wechat-import/cmb';

export default function WechatImportDialog({ accounts, categories, source = 'wechat' }: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  source?: 'wechat' | 'alipay' | 'alipay-hk' | 'cmb' | 'hangseng' | 'hangseng-bank';
}) {
  const pdf = source === 'hangseng' || source === 'hangseng-bank';
  const sourceName = source === 'hangseng-bank' ? '恒生银行卡' : pdf ? '恒生信用卡' : source === 'cmb' ? '招商银行' : source === 'alipay-hk' ? '支付宝(HK)' : source === 'alipay' ? '支付宝' : '微信';
  const screenshotCurrency = source === 'alipay-hk' ? 'HKD' : 'CNY';
  const currencyError = source === 'alipay-hk' ? '请选择港币账户，支付宝(HK)导入不支持币种转换' : '请选择人民币账户，截图导入不支持币种转换';
  const importTitle = pdf ? `${sourceName}导入` : `从${sourceName}截图导入`;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<PreviewTransaction[] | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [screenshotDate, setScreenshotDate] = useState(chinaToday);
  const [progress, setProgress] = useState<Partial<Record<ImportStage, ImportProgress>>>({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
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
    setScreenshotDate(chinaToday());
  }

  function close() {
    if (saveLock.current) return;
    resetImport();
    setOpen(false);
  }

  async function load(file: File) {
    if (source === 'cmb' && !validScreenshotDate(screenshotDate)) {
      setError('请选择有效的截图日期');
      return;
    }
    setError(null);
    setTransactions(null);
    setSelectedAccountId('');
    setProgress({});
    setBatchId(null);
    if (file.size > 20 * 1024 * 1024) {
      setError(`${pdf ? 'PDF' : '图片'}不能超过 20 MB`);
      return;
    }
    if (!(pdf ? file.type === 'application/pdf' : ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setError(pdf ? '请选择 PDF 账单文件' : '请选择 JPG、PNG 或 WebP 图片');
      return;
    }
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setPending(true);
    try {
      const form = new FormData();
      form.set('image', file);
      if (source === 'cmb') form.set('screenshotDate', screenshotDate);
      const response = await fetch(`/api/${source}-import`, {
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

  const invalidCount = transactions?.filter((transaction) => activeOcrErrors(transaction).length > 0 || hasActiveAiError(transaction)).length ?? 0;
  const warningCount = transactions?.filter(hasActiveAiWarning).length ?? 0;
  const cardGroups = source === 'cmb' && transactions ? cmbCardGroups(transactions) : [];
  const hasInvalidRows = transactions?.some((transaction) => (
    !transaction.type
    || transaction.amount === null || !Number.isSafeInteger(transaction.amount) || transaction.amount === 0
    || (transaction.amount < 0 && !(transaction.type === 'expense' && transaction.isRefund))
    || !transaction.occurredAt || !Number.isFinite(transaction.occurredAt.getTime())
    || !transaction.categoryId
    || !categories.some((category) => category.id === transaction.categoryId && category.type === transaction.type)
    || (transaction.notes?.length ?? 0) > 1000
  )) ?? false;
  const hasInvalidAccounts = transactions?.some((transaction) => (
    !accounts.some((account) => account.id === transaction.accountId && (pdf || account.currency === screenshotCurrency))
  )) ?? false;
  const canSave = Boolean(batchId && transactions?.length
    && invalidCount === 0 && !hasInvalidRows && !hasInvalidAccounts && !pending && !isSaving);

  function save() {
    if (!canSave || !batchId || !transactions || saveLock.current) return;
    saveLock.current = true;
    setConfirmSave(false);
    setError(null);
    startSaving(async () => {
      let saved = false;
      try {
        const result = await saveWechatImportAction({ batchId, editedRows: serializePreviewRows(transactions) });
        if (result.success) {
          saved = true;
          router.refresh();
        } else {
          setError(result.message);
        }
      } catch {
        setError('保存结果未确认，请重试；同一批次重试不会重复入账');
      } finally {
        saveLock.current = false;
        if (saved) close();
      }
    });
  }
  return (
    <>
      <Box>
        <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => {
          setScreenshotDate(chinaToday());
          setOpen(true);
        }}>{importTitle}</Button>
      </Box>
      <Dialog open={open} onClose={close} fullWidth maxWidth="md" scroll="paper">
        <DialogTitle>{importTitle}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <input
              ref={inputRef}
              type="file"
              accept={pdf ? 'application/pdf' : 'image/jpeg,image/png,image/webp'}
              aria-label={`选择${sourceName}账单${pdf ? 'PDF' : '截图'}`}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void load(file);
              }}
            />
            {!transactions ? (
              <>
                {source === 'cmb' ? (
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DatePicker
                      label="截图日期（用于今天/昨天及未标注年份的月份）"
                      value={screenshotDate ? dayjs(screenshotDate) : null}
                      onChange={(value) => setScreenshotDate(value?.isValid() ? value.format('YYYY-MM-DD') : '')}
                      format="YYYY/MM/DD"
                      disabled={pending}
                      slotProps={{ textField: { required: true, fullWidth: true, size: 'small' } }}
                    />
                  </LocalizationProvider>
                ) : null}
                <Button variant="contained" disabled={pending} startIcon={<UploadFileIcon />} onClick={() => inputRef.current?.click()}>
                  {pdf ? '选择 PDF 文件' : '选择图片文件'}
                </Button>
                {pending || Object.keys(progress).length > 0 ? <WechatImportProgress progress={progress} pending={pending} failed={error !== null} pdf={pdf} pdfOcr={source === 'hangseng-bank'} /> : null}
              </>
            ) : null}
            {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
            {transactions ? (
              <>
                {pdf ? <Alert severity="info">账单金额按所选账户的币种入账，不作汇率转换。原币金额及汇率仅保存在 data 中；请确认账户币种适合此账单。</Alert> : null}
                {source === 'alipay-hk' ? <Alert severity="info">账单金额为 HKD，请选择港币账户，不作币种转换。</Alert> : null}
                <Alert severity={invalidCount ? 'error' : warningCount ? 'warning' : 'success'}>
                  识别出 {transactions.length} 笔交易，{invalidCount} 笔存在识别或 AI 分类错误，{warningCount} 笔 AI 分类置信度低于 50%。请确认金额、日期和分类；AI 置信度是模型自报分数，不代表实际准确率。
                </Alert>
                {source === 'cmb' ? cardGroups.map((group, index) => (
                  <SourceAccountField
                    key={group.card}
                    accounts={accounts}
                    type="expense"
                    sourceAccountId={String(group.accountId ?? '')}
                    onAccountChange={(value) => {
                      const account = accounts.find((item) => String(item.id) === value);
                      if (account && !pdf && account.currency !== screenshotCurrency) {
                        setError(currencyError);
                        return;
                      }
                      setTransactions((rows) => rows?.map((row) => (row.sourceCard ?? '未识别卡号') !== group.card
                        ? row : account ? assignPreviewAccount(row, account)
                          : { ...row, accountId: null, accountName: '未选择账户' }) ?? null);
                      setError(null);
                    }}
                    fieldId={`cmb-card-account-${index}`}
                    labelOverride={`${group.card}（${group.count} 笔）对应账户`}
                    disabled={isSaving || accounts.length === 0}
                  />
                )) : <SourceAccountField
                  accounts={accounts}
                  type="expense"
                  sourceAccountId={selectedAccountId}
                  onAccountChange={(value) => {
                    const account = accounts.find((item) => String(item.id) === value);
                    if (account && !pdf && account.currency !== screenshotCurrency) {
                      setError(currencyError);
                      return;
                    }
                    setTransactions((rows) => rows?.map((row) => account ? assignPreviewAccount(row, account) : {
                      ...row, accountId: null, accountName: '未选择账户',
                    }) ?? null);
                    setSelectedAccountId(value);
                    setError(null);
                  }}
                  fieldId={`${source}-import-account`}
                  labelOverride="统一设置账户（覆盖全部）"
                  disabled={isSaving || accounts.length === 0}
                />}
                {accounts.length === 0 ? <Alert severity="warning">暂无可用账户，请先在账户管理中添加账户。</Alert> : null}
                {invalidCount > 0 || hasInvalidRows ? <Alert severity="error">本批次存在未确认错误或无效交易信息，请编辑修正或删除无效行后保存。</Alert> : null}
                <TransactionsList mode="preview" transactions={transactions} accounts={accounts} categories={categories}
                  disabled={isSaving}
                  onChange={(rows) => {
                    setTransactions(rows);
                    setSelectedAccountId(rows.length && rows.every((row) => row.accountId === rows[0].accountId)
                      ? String(rows[0].accountId ?? '') : '');
                    setError(null);
                  }} showDebugData={pdf} />
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={isSaving}>
            {pending ? '取消识别' : transactions ? '取消' : '关闭'}
          </Button>
          {transactions ? (
            <Button variant="contained" disabled={!canSave} onClick={() => setConfirmSave(true)}>
              {isSaving ? '正在保存…' : `保存 ${transactions.length} 笔交易`}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
      <Dialog open={confirmSave} onClose={() => setConfirmSave(false)} maxWidth="xs" fullWidth>
        <DialogTitle>确认保存导入交易</DialogTitle>
        <DialogContent>
          将 {transactions?.length ?? 0} 笔交易按预览中各行的账户保存，并同步更新对应账户余额。勾选仅用于编辑，不限制保存范围。
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
