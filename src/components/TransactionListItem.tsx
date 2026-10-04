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
  expense: { label: '支出', sign: '−', color: 'error.main' },
  income: { label: '收入', sign: '+', color: 'success.main' },
  transfer: { label: '转账', sign: '', color: 'primary.main' },
  adjustment: { label: '调整', sign: '', color: 'text.primary' },
} as const;

export default function TransactionListItem({ transaction }: TransactionListItemProps) {
  const display = transactionDisplay[transaction.type];

  return (
    <Box
      className="txn-item"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: '1.1fr 1fr 1fr auto' },
        alignItems: 'center',
        gap: { xs: 1.5, md: 3 },
        py: 2,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {display.label}
          {transaction.categoryName ? ` · ${transaction.categoryName}` : ' · 未分类'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(transaction.occurredAt)}
        </Typography>
      </Box>
      <Typography
        variant="body2"
        sx={{ gridColumn: { xs: '1', md: 'auto' }, color: 'text.secondary', overflowWrap: 'anywhere' }}
      >
        {transaction.accountName}
        {transaction.destinationAccountName ? ` → ${transaction.destinationAccountName}` : ''}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          gridColumn: { xs: '2', md: 'auto' },
          gridRow: { xs: '1 / span 2', md: 'auto' },
          color: display.color,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        }}
      >
        {display.sign}{transaction.currency} {formatMinorUnits(transaction.amount)}
      </Typography>
      {transaction.notes ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: { xs: 'none', md: 'block' }, overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {transaction.notes}
        </Typography>
      ) : null}
    </Box>
  );
}