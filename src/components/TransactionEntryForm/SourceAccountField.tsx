import { useState } from 'react';
import { Autocomplete, Avatar, Box, Checkbox, Chip, InputAdornment, TextField, Typography } from '@mui/material';
import { accountTypes } from '@/src/components/AccountManager/types';
import { accountIconUrl } from '@/src/lib/account-icon-url';
import { filterCodeFirst, findExactCode } from './optionFilters';
import type { AccountOption, TransactionType } from './types';

/**
 * 组件：交易账户选择器
 * 功能：让用户选择收入或支出的账户；转账时选择转出账户。
 */
type SourceAccountFieldProps = {
  accounts: AccountOption[];
  type: TransactionType;
  fieldId?: string;
  labelOverride?: string;
  disabled?: boolean;
} & ({
  multiple?: false;
  sourceAccountId: string;
  onAccountChange: (accountId: string) => void;
} | {
  multiple: true;
  sourceAccountId: string[];
  onAccountChange: (accountId: string[]) => void;
});

// 选择支出或收入账户；转账时选择转出账户。
export default function SourceAccountField(props: SourceAccountFieldProps) {
  const {
  accounts,
  type,
  sourceAccountId,
  fieldId,
  labelOverride,
  disabled,
  } = props;
  // 按交易类型确定账户输入框的标签和唯一 ID。
  const label = labelOverride ?? (type === 'transfer' ? '转出账户' : '账户');
  const autocompleteId = fieldId ?? 'txn-account';
  // 按账户类型排序，供用户分组浏览和选择。
  const orderedAccounts = accountTypes.flatMap((accountType) => (
    accounts.filter((account) => account.type === accountType.value)
  ));
  // 从当前账户选项中找到表单已选账户。
  const selectedAccount = accounts.find((account) => String(account.id) === sourceAccountId) ?? null;
  // 账户搜索框当前显示的文字。
  const [inputValue, setInputValue] = useState(selectedAccount?.name ?? '');

  if (props.multiple) {
    return (
      <Autocomplete<AccountOption, true>
        multiple
        disableCloseOnSelect
        sx={{
          minWidth: 0,
          '& .MuiAutocomplete-inputRoot': { height: 40, flexWrap: 'nowrap', overflow: 'hidden' },
        }}
        renderValue={(selected, getItemProps) => (
          <Box sx={{ display: 'flex', overflow: 'hidden', maxWidth: 'calc(100% - 36px)', minWidth: 0, flexShrink: 1 }}>
            {selected.map((account, index) => {
              const { key, ...itemProps } = getItemProps({ index });
              return <Chip key={key} {...itemProps} label={account.name} size="small" sx={{ flexShrink: 0, maxWidth: '100%', mr: 0.5 }} />;
            })}
          </Box>
        )}
        id={autocompleteId}
        fullWidth
        size="small"
        disabled={disabled ?? accounts.length === 0}
        options={orderedAccounts}
        value={orderedAccounts.filter((account) => props.sourceAccountId.includes(String(account.id)))}
        onChange={(_, selected) => props.onAccountChange(selected.map((account) => String(account.id)))}
        getOptionLabel={(account) => account.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        groupBy={(account) => accountTypes.find((item) => item.value === account.type)?.label ?? '其他'}
        filterOptions={(options, state) => filterCodeFirst(options, state.inputValue)}
        noOptionsText="没有匹配的账户"
        renderOption={(optionProps, account, { selected }) => {
          const { key, ...rest } = optionProps;
          return (
            <Box component="li" key={key} {...rest} sx={{ display: 'flex', gap: 1 }}>
              <Checkbox checked={selected} size="small" sx={{ pointerEvents: 'none' }} tabIndex={-1} />
              <Avatar src={accountIconUrl(account.icon)} variant="rounded" sx={{ width: 24, height: 24, fontSize: 12 }}>
                {account.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <Box component="span" sx={{ flex: 1 }}>{account.name}</Box>
              {account.code ? <Typography variant="caption" color="text.secondary">{account.code}</Typography> : null}
            </Box>
          );
        }}
        renderInput={(params) => <TextField {...params} label={label} placeholder={props.sourceAccountId.length ? '' : '全部账户'} />}
      />
    );
  }

  return (
    <>
      <input type="hidden" name="accountId" value={sourceAccountId} />
      <Autocomplete<AccountOption>
        key={type === 'transfer' ? 'transfer-source-account' : 'source-account'}
        id={autocompleteId}
        fullWidth
        size="small"
        disabled={disabled ?? accounts.length === 0}
        options={orderedAccounts}
        value={selectedAccount}
        inputValue={inputValue}
        onChange={(_, account) => {
          setInputValue(account?.name ?? '');
          props.onAccountChange(account ? String(account.id) : '');
        }}
        onInputChange={(_, inputValue, reason) => {
          if (reason === 'input') {
            const exactMatch = findExactCode(orderedAccounts, inputValue);
            setInputValue(exactMatch?.name ?? inputValue);
            props.onAccountChange(exactMatch ? String(exactMatch.id) : '');
          } else if (reason === 'clear') {
            setInputValue('');
            props.onAccountChange('');
          } else if (reason === 'reset') {
            setInputValue(inputValue);
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
        renderOption={(props, account) => {
          const { key, ...optionProps } = props;
          return (
          <Box key={key} component="li" {...optionProps} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
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
          );
        }}
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