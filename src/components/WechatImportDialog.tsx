'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import { UploadFile as UploadFileIcon } from '@mui/icons-material';
import TransactionsList from '@/src/components/TransactionsList';
import WechatImportProgress from '@/src/components/WechatImportProgress';
import { readImportStream } from '@/src/lib/wechat-import/stream';
import type { ImportProgress, ImportStage, PreviewTransaction } from '@/src/lib/wechat-import/types';

export default function WechatImportDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<PreviewTransaction[] | null>(null);
  const [progress, setProgress] = useState<Partial<Record<ImportStage, ImportProgress>>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  function close() {
    if (controller.current) setProgress({});
    controller.current?.abort();
    controller.current = null;
    setPending(false);
    setOpen(false);
  }

  async function load(file: File) {
    setError(null);
    setTransactions(null);
    setProgress({});
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

  const invalidCount = transactions?.filter((transaction) => transaction.importDebug.errors.length > 0).length ?? 0;
  return (
    <>
      <Box>
        <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setOpen(true)}>从微信截图导入</Button>
      </Box>
      <Dialog open={open} onClose={close} fullWidth maxWidth="md" scroll="paper">
        <DialogTitle>从微信截图导入</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">仅识别与预览，不会写入交易或修改账户余额。请上传包含年月标题的微信账单截图。</Alert>
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
            <Button variant="contained" disabled={pending} startIcon={<UploadFileIcon />} onClick={() => inputRef.current?.click()}>
              {transactions ? '选择另一张图片' : '选择图片文件'}
            </Button>
            {pending || Object.keys(progress).length > 0 ? <WechatImportProgress progress={progress} pending={pending} failed={error !== null} /> : null}
            {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
            {transactions ? (
              <>
                <Alert severity={invalidCount ? 'warning' : 'success'}>
                  识别出 {transactions.length} 笔交易，{invalidCount ? `${invalidCount} 笔需要检查，请确认金额、日期等识别结果。` : '金额和日期均通过格式校验，请确认识别结果。'}
                </Alert>
                <TransactionsList mode="preview" transactions={transactions} showDebugData={false} />
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={close}>{pending ? '取消识别' : '关闭'}</Button></DialogActions>
      </Dialog>
    </>
  );
}
