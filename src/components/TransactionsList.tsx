import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TransactionListItem, { type TransactionListItemData } from '@/src/components/TransactionListItem';

type TransactionsListProps = {
  transactions: TransactionListItemData[];
};

export default function TransactionsList({ transactions }: TransactionsListProps) {
  return (
    <Box id="txn-list" component="section" aria-labelledby="txn-title">
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography id="txn-title" component="h2" variant="h2">全部流水</Typography>
        <Typography variant="body2" color="text.secondary">{transactions.length} 笔</Typography>
      </Box>

      {transactions.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 3 }}>暂无交易记录</Typography>
      ) : (
        <Stack divider={<Divider flexItem />}>
          {transactions.map((transaction) => (
            <TransactionListItem key={transaction.id} transaction={transaction} />
          ))}
        </Stack>
      )}
    </Box>
  );
}