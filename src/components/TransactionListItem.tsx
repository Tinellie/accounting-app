'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { Alert, AlertTitle, Box, Checkbox, Collapse, IconButton, Typography } from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import CategoryIcon from '@/src/components/CategoryIcon';
import { fallbackCategoryColor } from '@/src/lib/category-colors';
import type { transactions } from '@/src/db/schema';
import { formatMinorUnits } from '@/src/lib/money';
import type { PreviewTransaction } from '@/src/lib/wechat-import/types';
import { activeOcrErrors } from '@/src/lib/wechat-import/preview';

/**
 * 组件：交易列表项
 * 功能：展示一笔交易的金额、时间、账户和分类信息。
 * 用户可以勾选该记录以进行批量操作。
 */
export type TransactionListItemData = Pick<
  typeof transactions.$inferSelect,
  'id' | 'type' | 'amount' | 'occurredAt' | 'notes' | 'data' | 'accountId' | 'toAccountId'
> & {
  isRefund?: boolean;
  accountName: string;
  currency: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  categoryParentId: number | null;
  categoryParentColor: string | null;
  destinationAccountName: string | null;
};

type TransactionListItemProps = {
  transaction: TransactionListItemData | PreviewTransaction;
  selected?: boolean;
  onSelectedChange?: (selected: boolean, exclusive?: boolean) => void;
  showDebugData?: boolean;
};

const transactionDisplay = {
  expense: { label: '支出' },
  income: { label: '收入' },
  transfer: { label: '转账' },
  adjustment: { label: '调整' },
} as const;

export default function TransactionListItem({ transaction, selected, onSelectedChange, showDebugData = true }: TransactionListItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const detailsId = useId();
  const debug = 'importDebug' in transaction ? transaction.importDebug : null;
  const aiCategory = 'aiCategory' in transaction ? transaction.aiCategory : undefined;
  const manuallyClassified = 'manualReview' in transaction && transaction.manualReview?.category;
  const ocrErrors = 'importDebug' in transaction ? activeOcrErrors(transaction) : [];
  const isRefund = transaction.type === 'expense' && (transaction.amount ?? 0) < 0;
  const display = transaction.type ? transactionDisplay[transaction.type] : { label: '待识别' };
  // 标记转账记录，以调整列表中账户信息的展示。
  const isTransfer = transaction.type === 'transfer';
  // 支出金额加负号展示，其他类型保留原方向。
  const amountForDisplay = transaction.amount === null ? null : transaction.type === 'expense' ? -transaction.amount : transaction.amount;
  // 优先使用分类自身颜色，再回退到上级或默认颜色。
  const categoryColor = transaction.categoryColor ?? (
    transaction.categoryParentId === null
      ? transaction.categoryId === null ? null : fallbackCategoryColor(transaction.categoryId)
      : transaction.categoryParentColor ?? fallbackCategoryColor(transaction.categoryParentId)
  );
  // 转账和余额调整仅在金额为负数时显示负号。
  const sign = transaction.type === 'transfer' || transaction.type === 'adjustment'
    ? (transaction.amount ?? 0) < 0 ? '−' : ''
    : amountForDisplay !== null && amountForDisplay < 0 ? '−' : amountForDisplay !== null && amountForDisplay > 0 ? '+' : '';

  return (
    <Box
      onClick={(event) => {
        if (event.altKey && onSelectedChange && event.target instanceof Element
          && !event.target.closest('button, input, a, [role="button"]')) {
          event.preventDefault();
          onSelectedChange(true, true);
        }
      }}
      sx={ocrErrors.length || (!manuallyClassified && aiCategory?.status === 'error') ? { border: 1, borderColor: 'error.main', bgcolor: 'action.hover', px: 1.5 } : undefined}>
      {debug?.imageUrl && showDebugData ? (
        <>
          {imageFailed ? <Alert severity="error">原始切图加载失败，文件可能已被清理：{debug.sourcePath}</Alert> : (
            <Image
              src={debug.imageUrl}
              alt={`第 ${debug.sequence} 行原始切图`}
              width={debug.bounds.width}
              height={debug.bounds.height}
              unoptimized
              onError={() => setImageFailed(true)}
              style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 240, objectFit: 'contain', marginTop: 12 }}
            />
          )}
        </>
      ) : null}
      {ocrErrors.length ? <Alert severity="error" sx={{ mt: 1 }}>{ocrErrors.join('；')}</Alert> : null}
      {manuallyClassified ? <Typography variant="caption" color="text.secondary">分类已手动确认，原始 OCR / AI 数据保留供调试</Typography> : null}
      {aiCategory && !manuallyClassified && aiCategory.status !== 'success' ? (
          <Alert severity={aiCategory.status === 'error' ? 'error' : 'warning'} sx={{ mt: 1, '& .MuiAlert-message': { minWidth: 0, width: '100%' } }}>
            <AlertTitle>{aiCategory.status === 'error' ? 'AI 分类返回错误，已保留原分类' : 'AI 分类置信度低于 50%，已应用推荐分类'}</AlertTitle>
            {aiCategory.errors.length ? <Typography variant="body2">{aiCategory.errors.join('；')}</Typography> : null}
            <Typography variant="caption">AI 原始返回数据{aiCategory.rawResponse === null ? '（未收到返回）' : ''}</Typography>
            <Box component="pre" sx={{ my: 0.5, p: 1, fontSize: 12, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', bgcolor: 'action.hover' }}>
              {typeof aiCategory.rawResponse === 'string' ? aiCategory.rawResponse : JSON.stringify(aiCategory.rawResponse, null, 2)}
            </Box>
          </Alert>
      ) : null}
    <Box
      className="txn-item"
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '32px 32px minmax(0, 1fr) minmax(110px, 40%)',
          md: '32px 32px minmax(0, 1.1fr) minmax(0, 1fr) minmax(160px, auto)',
        },
        alignItems: 'center',
        columnGap: { xs: 0.75, md: 1.25 },
        rowGap: aiCategory ? 0.5 : { xs: 1.5, md: 3 },
        py: 2,
      }}
    >
      <Checkbox
        size="small"
        checked={selected ?? false}
        disabled={!onSelectedChange}
        onChange={(event) => onSelectedChange?.(event.target.checked, event.nativeEvent instanceof MouseEvent && event.nativeEvent.altKey)}
        slotProps={{ input: { 'aria-label': `选择${display.label}记录` } }}
        sx={{
          gridColumn: 1,
          gridRow: { xs: '1 / span 2', md: 1 },
          justifySelf: 'center',
          alignSelf: 'center',
          width: 24,
          height: 24,
          p: 0,
          visibility: debug && !onSelectedChange ? 'hidden' : 'visible',
        }}
      />
      {transaction.categoryName || isTransfer ? (
        <Box
          aria-hidden="true"
          sx={{
            gridColumn: 2,
            gridRow: { xs: '1 / span 2', md: 1 },
            alignSelf: 'center',
            justifySelf: 'center',
            display: 'grid',
            placeItems: 'center',
            width: 32,
            height: 32,
            borderRadius: 1,
            bgcolor: isTransfer ? 'transaction.transfer.light' : categoryColor ? `${categoryColor}1A` : 'action.hover',
          }}
        >
          <CategoryIcon
            name={isTransfer ? 'SwapHoriz' : transaction.categoryIcon ?? 'Category'}
            color={isTransfer ? 'transaction.transfer.main' : categoryColor ?? 'action'}
            fontSize="medium"
          />
        </Box>
      ) : <Box sx={{ gridColumn: 2, gridRow: { xs: '1 / span 2', md: 1 } }} />}
      <Box sx={{ minWidth: 0, gridColumn: 3 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {display.label}
          {isRefund ? '（退款）' : ''}
          {'syntheticRefund' in transaction && transaction.syntheticRefund ? '（自动补全）' : ''}
          {transaction.categoryName ? (
            <>
              {' · '}
              {transaction.categoryName}
            </>
          ) : ' · 未分类'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {transaction.occurredAt
            ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', ...(debug ? { timeZone: 'Asia/Shanghai' } : {}) }).format(transaction.occurredAt)
            : <Box component="span" sx={{ color: 'error.main' }}>日期待修正</Box>}
        </Typography>
      </Box>
      {transaction.notes ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            gridColumn: { xs: '3 / -1', md: 4 },
            gridRow: { xs: 3, md: 1 },
            display: { xs: debug ? 'block' : 'none', md: 'block' },
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {transaction.notes}
        </Typography>
      ) : null}
      <Box
        sx={{
          gridColumn: { xs: 4, md: 5 },
          gridRow: { xs: '1 / span 2', md: 1 },
          justifySelf: 'end',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 0.5,
          minWidth: 0,
          maxWidth: { xs: '40vw', md: 'none' },
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ maxWidth: '100%', textAlign: 'right', overflowWrap: 'anywhere' }}
        >
          {'sourceCard' in transaction && transaction.sourceCard ? `${transaction.sourceCard} · ` : ''}
          {transaction.accountName}
          {transaction.destinationAccountName ? ` → ${transaction.destinationAccountName}` : ''}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: amountForDisplay === null ? 'text.secondary'
              : amountForDisplay > 0 ? 'success.main'
                : amountForDisplay < 0 ? 'error.main' : 'text.primary',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            textAlign: 'right',
          }}
        >
          {amountForDisplay === null ? '金额待修正' : `${sign}${transaction.currency} ${formatMinorUnits(Math.abs(amountForDisplay))}`}
        </Typography>
      </Box>
      {aiCategory && !manuallyClassified && (aiCategory.confidence !== null || aiCategory.explanation) ? (
        <Box sx={{ gridColumn: '3 / -1', gridRow: { xs: 4, md: 2 }, minWidth: 0, justifySelf: 'stretch', textAlign: 'left', overflowWrap: 'anywhere' }}>
          {aiCategory.confidence !== null ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              AI 分类置信度：{(aiCategory.confidence * 100).toFixed(1)}%
            </Typography>
          ) : null}
          {aiCategory.explanation ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              说明：{aiCategory.explanation}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Box>
      {debug && showDebugData ? (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, pb: 1 }}>
            <Typography variant="caption" color="text.secondary">{'currencyMode' in transaction && transaction.currencyMode === 'account' ? '原始 PDF 文本 / data 调试对象' : '原始 OCR / 调试对象'}</Typography>
            <IconButton
              size="small"
              aria-label={expanded ? '折叠原始 OCR 对象' : '展开原始 OCR 对象'}
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => setExpanded((value) => !value)}
            >
              <ExpandMoreIcon sx={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
            </IconButton>
          </Box>
          <Collapse in={expanded} unmountOnExit>
            <Box id={detailsId} component="pre" sx={{ m: 0, mb: 2, p: 1.5, fontSize: 12, overflow: 'auto', maxHeight: 480, bgcolor: 'action.hover', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {JSON.stringify(transaction, null, 2)}
            </Box>
          </Collapse>
        </>
      ) : null}
    </Box>
  );
}