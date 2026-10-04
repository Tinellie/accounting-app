import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
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
        {accounts.map((account) => (
          <MenuItem className="txn-account-option" key={account.id} value={account.id}>{account.name}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}