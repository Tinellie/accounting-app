import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import SortableAccountGroup from './SortableAccountGroup';
import { accountTypes, type AccountRecord } from './types';

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
        <AccountTypeGroups accounts={activeAccounts} isArchived={false} onEdit={onEdit} />
      )}

      {archivedAccounts.length > 0 ? (
        <Box component="section" aria-labelledby="account-archived-title">
          <Typography id="account-archived-title" component="h2" variant="h2" sx={{ mb: 1.5 }}>
            已归档账户
          </Typography>
          <AccountTypeGroups accounts={archivedAccounts} isArchived onEdit={onEdit} />
        </Box>
      ) : null}
    </Stack>
  );
}

type AccountTypeGroupsProps = {
  accounts: AccountRecord[];
  isArchived: boolean;
  onEdit: (account: AccountRecord) => void;
};

function AccountTypeGroups({ accounts, isArchived, onEdit }: AccountTypeGroupsProps) {
  return (
    <Stack spacing={2}>
      {accountTypes.map((type) => {
        const typeAccounts = accounts.filter((account) => account.type === type.value);
        if (typeAccounts.length === 0) return null;

        return (
          <Box key={type.value} component="section" aria-labelledby={`account-type-${type.value}-${isArchived}`}>
            <Typography
              id={`account-type-${type.value}-${isArchived}`}
              component="h2"
              variant="h2"
              sx={{ mb: 1.5 }}
            >
              {type.label}
            </Typography>
            <SortableAccountGroup
              accounts={typeAccounts}
              accountType={type.value}
              isArchived={isArchived}
              onEdit={onEdit}
            />
          </Box>
        );
      })}
    </Stack>
  );
}