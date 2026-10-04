import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AccountCard from './AccountCard';
import type { AccountRecord } from './types';

type AccountListProps = {
  accounts: AccountRecord[];
  onEdit: (account: AccountRecord) => void;
};

export default function AccountList({ accounts, onEdit }: AccountListProps) {
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const archivedAccounts = accounts.filter((account) => account.isArchived);

  return (
    <Stack spacing={3}>
      {activeAccounts.length === 0 ? (
        <Alert severity="info">还没有账户。添加现金、银行卡或其他账户后，就可以记录交易。</Alert>
      ) : (
        <AccountCardList accounts={activeAccounts} onEdit={onEdit} />
      )}

      {archivedAccounts.length > 0 ? (
        <Box component="section" aria-labelledby="account-archived-title">
          <Typography id="account-archived-title" component="h2" variant="h2" sx={{ mb: 1.5 }}>
            已归档账户
          </Typography>
          <AccountCardList accounts={archivedAccounts} onEdit={onEdit} />
        </Box>
      ) : null}
    </Stack>
  );
}

type AccountCardListProps = {
  accounts: AccountRecord[];
  onEdit: (account: AccountRecord) => void;
};

function AccountCardList({ accounts, onEdit }: AccountCardListProps) {
  return (
    <Box className="account-list" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} onEdit={() => onEdit(account)} />
      ))}
    </Box>
  );
}