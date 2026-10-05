import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { transactions } from '@/src/db/schema';
import { formatMinorUnits } from '@/src/lib/money';

export type TransactionListItemData = Pick<
  typeof transactions.$inferSelect,
  'id' | 'type' | 'amount' | 'occurredAt' | 'notes'
> & {
  accountName: string;
  currency: string;
  categoryName: string | null;
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
  const amountForDisplay = transaction.type === 'expense' ? -transaction.amount : transaction.amount;
  const sign = transaction.type === 'transfer' || transaction.type === 'adjustment'
    ? transaction.amount < 0 ? '−' : ''
    : amountForDisplay < 0 ? '−' : amountForDisplay > 0 ? '+' : '';

  return (
    <Box
      className="txn-item"
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr) minmax(110px, 40%)',
          md: 'minmax(0, 1.1fr) minmax(0, 1fr) minmax(160px, auto)',
        },
        alignItems: 'center',
        gap: { xs: 1.5, md: 3 },
        py: 2,
      }}
    >
      <Box sx={{ minWidth: 0, gridColumn: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {display.label}
          {transaction.categoryName ? ` · ${transaction.categoryName}` : ' · 未分类'}
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
            gridColumn: { xs: '1 / -1', md: 2 },
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
          gridColumn: { xs: 2, md: 3 },
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