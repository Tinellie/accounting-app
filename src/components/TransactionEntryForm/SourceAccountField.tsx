import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { accountTypes } from '@/src/components/AccountManager/types';
import { accountIconUrl } from '@/src/lib/account-icon-url';
import { filterCodeFirst, findExactCode } from './optionFilters';
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
  const orderedAccounts = accountTypes.flatMap((accountType) => (
    accounts.filter((account) => account.type === accountType.value)
  ));
  const selectedAccount = accounts.find((account) => String(account.id) === sourceAccountId) ?? null;
  const [inputValue, setInputValue] = useState(selectedAccount?.name ?? '');

  return (
    <>
      <input type="hidden" name="accountId" value={sourceAccountId} />
      <Autocomplete<AccountOption>
        key={type === 'transfer' ? 'transfer-source-account' : 'source-account'}
        id="txn-account"
        fullWidth
        size="small"
        disabled={accounts.length === 0}
        options={orderedAccounts}
        value={selectedAccount}
        inputValue={inputValue}
        onChange={(_, account) => {
          setInputValue(account?.name ?? '');
          onAccountChange(account ? String(account.id) : '');
        }}
        onInputChange={(_, inputValue, reason) => {
          if (reason === 'input') {
            const exactMatch = findExactCode(orderedAccounts, inputValue);
            setInputValue(exactMatch?.name ?? inputValue);
            onAccountChange(exactMatch ? String(exactMatch.id) : '');
          } else if (reason === 'clear') {
            setInputValue('');
            onAccountChange('');
          }
        }}
        getOptionLabel={(account) => account.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        groupBy={(account) => accountTypes.find((item) => item.value === account.type)?.label ?? '其他'}
        filterOptions={(options, state) => filterCodeFirst(options, state.inputValue)}
        noOptionsText="没有匹配的账户"
        renderGroup={({ key, group, children }) => (
          <li key={key}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 32,
                px: 2,
                color: 'text.secondary',
                fontSize: '0.875rem',
                '&::before, &::after': {
                  content: '""',
                  flex: 1,
                  borderTop: '0.5px solid',
                  borderColor: 'divider',
                },
              }}
            >
              {group}
            </Box>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{children}</ul>
          </li>
        )}
        renderOption={(props, account) => (
          <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Avatar
              src={accountIconUrl(account.icon)}
              alt={`${account.name}图标`}
              variant="rounded"
              sx={{ width: 24, height: 24, flexShrink: 0, fontSize: 12 }}
            >
              {account.name.slice(0, 1).toUpperCase()}
            </Avatar>
            <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {account.name}
            </Box>
            {account.code ? <Typography variant="caption" color="text.secondary">{account.code}</Typography> : null}
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder="输入账户代码或名称"
            required
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps.input,
                startAdornment: selectedAccount ? (
                  <>
                    <InputAdornment position="start" sx={{ mr: 0.5 }}>
                      <Avatar
                        src={accountIconUrl(selectedAccount.icon)}
                        alt={`${selectedAccount.name}图标`}
                        variant="rounded"
                        sx={{ width: 24, height: 24, fontSize: 12 }}
                      >
                        {selectedAccount.name.slice(0, 1).toUpperCase()}
                      </Avatar>
                    </InputAdornment>
                    {params.slotProps.input.startAdornment}
                  </>
                ) : params.slotProps.input.startAdornment,
              },
            }}
          />
        )}
      />
    </>
  );
}