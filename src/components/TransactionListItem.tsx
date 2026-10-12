import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import CategoryIcon from '@/src/components/CategoryIcon';
import { fallbackCategoryColor } from '@/src/lib/category-colors';
import { transactions } from '@/src/db/schema';
import { formatMinorUnits } from '@/src/lib/money';

export type TransactionListItemData = Pick<
  typeof transactions.$inferSelect,
  'id' | 'type' | 'amount' | 'occurredAt' | 'notes'
> & {
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
  transaction: TransactionListItemData;
};

const transactionDisplay = {
  expense: { label: '支出', color: 'error.main' },
  income: { label: '收入', color: 'success.main' },
  transfer: { label: '转账', color: 'info.main' },
  adjustment: { label: '调整', color: 'text.primary' },
} as const;

export default function TransactionListItem({ transaction }: TransactionListItemProps) {
  const display = transactionDisplay[transaction.type];
  const isTransfer = transaction.type === 'transfer';
  const amountForDisplay = transaction.type === 'expense' ? -transaction.amount : transaction.amount;
  const categoryColor = transaction.categoryColor ?? (
    transaction.categoryParentId === null
      ? transaction.categoryId === null ? null : fallbackCategoryColor(transaction.categoryId)
      : transaction.categoryParentColor ?? fallbackCategoryColor(transaction.categoryParentId)
  );
  const sign = transaction.type === 'transfer' || transaction.type === 'adjustment'
    ? transaction.amount < 0 ? '−' : ''
    : amountForDisplay < 0 ? '−' : amountForDisplay > 0 ? '+' : '';

  return (
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
        rowGap: { xs: 1.5, md: 3 },
        py: 2,
      }}
    >
      <Checkbox
        size="small"
        slotProps={{ input: { 'aria-label': `选择${display.label}记录` } }}
        sx={{
          gridColumn: 1,
          gridRow: { xs: '1 / span 2', md: 1 },
          justifySelf: 'center',
          alignSelf: 'center',
          width: 24,
          height: 24,
          p: 0,
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
          {transaction.categoryName ? (
            <>
              {' · '}
              {transaction.categoryName}
            </>
          ) : ' · 未分类'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(transaction.occurredAt)}
        </Typography>
      </Box>
      {transaction.notes ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            gridColumn: { xs: '3 / -1', md: 4 },
            gridRow: { xs: 3, md: 1 },
            display: { xs: 'none', md: 'block' },
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
          {transaction.accountName}
          {transaction.destinationAccountName ? ` → ${transaction.destinationAccountName}` : ''}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: display.color,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            textAlign: 'right',
          }}
        >
          {sign}{transaction.currency} {formatMinorUnits(Math.abs(amountForDisplay))}
        </Typography>
      </Box>
    </Box>
  );
}