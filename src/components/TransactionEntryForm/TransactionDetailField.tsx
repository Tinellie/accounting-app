import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { AccountOption, CategoryOption, TransactionType } from './types';

type TransactionDetailFieldProps = {
  type: TransactionType;
  accounts: AccountOption[];
  categories: CategoryOption[];
  sourceAccountId: string;
  categoryId: string;
  destinationAccountId: string;
  onCategoryChange: (categoryId: string) => void;
  onDestinationChange: (accountId: string) => void;
};

// 转账时选择转入账户，收入或支出时选择对应分类。
export default function TransactionDetailField({
  type,
  accounts,
  categories,
  sourceAccountId,
  categoryId,
  destinationAccountId,
  onCategoryChange,
  onDestinationChange,
}: TransactionDetailFieldProps) {
  const isTransfer = type === 'transfer';
  const label = isTransfer ? '转入账户' : '分类';

  return (
    <FormControl
      id="txn-detail-field"
      fullWidth
      size="small"
      required
      disabled={isTransfer ? accounts.length < 2 : categories.length === 0}
    >
      <InputLabel id="txn-detail-label">{label}</InputLabel>
      <Select
        id="txn-detail"
        labelId="txn-detail-label"
        name={isTransfer ? 'toAccountId' : 'categoryId'}
        label={label}
        value={isTransfer ? destinationAccountId : categoryId}
        onChange={(event) => {
          const value = String(event.target.value);
          if (isTransfer) onDestinationChange(value);
          else onCategoryChange(value);
        }}
      >
        <MenuItem className="txn-detail-option" value=""><em>请选择{label}</em></MenuItem>
        {isTransfer
          ? accounts.map((account) => (
              <MenuItem
                className="txn-detail-option"
                key={account.id}
                value={account.id}
                disabled={String(account.id) === sourceAccountId}
              >
                {account.name}
              </MenuItem>
            ))
          : categories.map((category) => (
              <MenuItem className="txn-detail-option" key={category.id} value={category.id}>
                {category.name}
              </MenuItem>
            ))}
      </Select>

      {isTransfer && accounts.length < 2 ? (
        <FormHelperText id="txn-transfer-hint">转账需要两个可用账户</FormHelperText>
      ) : null}
      {!isTransfer && categories.length === 0 ? (
        <FormHelperText id="txn-category-hint">请先创建对应类型的分类</FormHelperText>
      ) : null}
    </FormControl>
  );
}