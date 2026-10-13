import { Alert, Box, Stack, Typography } from '@mui/material';
import SortableAccountGroup from './SortableAccountGroup';
import { accountTypes, type AccountRecord } from './types';

/**
 * 组件：账户列表
 * 功能：按账户类型展示未归档账户，并单独列出已归档账户。
 * 用户可以浏览账户分组并选择要编辑的账户。
 */
type AccountListProps = {
  accounts: AccountRecord[];
  onEdit: (account: AccountRecord) => void;
};

export default function AccountList({ accounts, onEdit }: AccountListProps) {
  // 分别保存正常使用和已归档的账户，供列表分区展示。
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