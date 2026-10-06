import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TransactionListItem, { type TransactionListItemData } from '@/src/components/TransactionListItem';

type TransactionsListProps = {
  transactions: TransactionListItemData[];
};

export default function TransactionsList({ transactions }: TransactionsListProps) {
  const monthlyGroups: { key: string; label: string; transactions: TransactionListItemData[] }[] = [];
  const monthFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });

  transactions.forEach((transaction) => {
    const year = transaction.occurredAt.getFullYear();
    const month = transaction.occurredAt.getMonth();
    const key = `${year}-${month}`;
    const currentGroup = monthlyGroups[monthlyGroups.length - 1];

    if (currentGroup?.key === key) {
      currentGroup.transactions.push(transaction);
    } else {
      monthlyGroups.push({
        key,
        label: monthFormatter.format(transaction.occurredAt),
        transactions: [transaction],
      });
    }
  });

  return (
    <Box id="txn-list" component="section" aria-labelledby="txn-title">
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography id="txn-title" component="h2" variant="h2">全部流水</Typography>
        <Typography variant="body2" color="text.secondary">{transactions.length} 笔</Typography>
      </Box>

      {transactions.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 3 }}>暂无交易记录</Typography>
      ) : (
        <Stack spacing={2}>
          {monthlyGroups.map((group) => (
            <Box key={group.key}>
              <Box
                component="header"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  minHeight: 36,
                  px: 1.5,
                  py: 0.75,
                  mb: 0.5,
                  borderRadius: 0,
                  bgcolor: 'action.hover',
                  color: 'text.secondary',
                }}
              >
                <Typography variant="subtitle2" sx={{ color: 'inherit', fontWeight: 600 }}>
                  {group.label}
                </Typography>
              </Box>
              <Stack divider={<Divider flexItem />}>
                {group.transactions.map((transaction) => (
                  <TransactionListItem key={transaction.id} transaction={transaction} />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}