import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import { accountTypes } from '@/src/components/AccountManager/types';
import { accountIconUrl } from '@/src/lib/account-icon-url';
import type { AccountOption, TransactionType } from './types';

type SourceAccountFieldProps = {
  accounts: AccountOption[];
  type: TransactionType;
  sourceAccountId: string;
  onAccountChange: (accountId: string) => void;
};

// 选择支出或收入账户；转账时选择转出账户。
export default function SourceAccountField({
  accounts,
  type,
  sourceAccountId,
  onAccountChange,
}: SourceAccountFieldProps) {
  const label = type === 'transfer' ? '转出账户' : '账户';

  return (
    <FormControl id="txn-account-field" fullWidth size="small" required disabled={accounts.length === 0}>
      <InputLabel id="txn-account-label">{label}</InputLabel>
      <Select
        id="txn-account"
        labelId="txn-account-label"
        name="accountId"
        label={label}
        value={sourceAccountId}
        onChange={(event) => onAccountChange(String(event.target.value))}
      >
        <MenuItem className="txn-account-option" value=""><em>请选择账户</em></MenuItem>
        {accountTypes.flatMap((accountType) => {
          const groupedAccounts = accounts.filter((account) => account.type === accountType.value);
          if (groupedAccounts.length === 0) return [];

          return [
            <MenuItem
              key={`${accountType.value}-heading`}
              value={`group-${accountType.value}`}
              disabled
              sx={{
                minHeight: 32,
                py: 0.25,
                gap: 1,
                color: 'text.secondary',
                fontWeight: 400,
                '&.Mui-disabled': { opacity: 1, color: 'text.secondary' },
                '&::before, &::after': {
                  content: '""',
                  flex: 1,
                  borderTop: '0.5px solid',
                  borderColor: 'divider',
                },
              }}
            >
              {accountType.label}
            </MenuItem>,
            ...groupedAccounts.map((account) => (
              <MenuItem className="txn-account-option" key={account.id} value={account.id}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    width: '100%',
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Avatar
                    src={accountIconUrl(account.icon)}
                    alt={`${account.name}图标`}
                    variant="rounded"
                    sx={{ width: 24, height: 24, flexShrink: 0, fontSize: 12 }}
                  >
                    {account.name.slice(0, 1).toUpperCase()}
                  </Avatar>
                  <Box
                    component="span"
                    title={account.name}
                    sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {account.name}
                  </Box>
                </Box>
              </MenuItem>
            )),
          ];
        })}
      </Select>
    </FormControl>
  );
}