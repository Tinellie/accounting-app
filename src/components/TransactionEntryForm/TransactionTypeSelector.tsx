import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import type { TransactionType } from './types';

type TransactionTypeSelectorProps = {
  type: TransactionType;
  onTypeChange: (type: TransactionType) => void;
};

const transactionTypes: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
];

// 提供交易类型切换，并将当前类型放入表单数据。
export default function TransactionTypeSelector({ type, onTypeChange }: TransactionTypeSelectorProps) {
  return (
    <Box className="txn-type-field">
      <ToggleButtonGroup
        id="txn-type"
        exclusive
        value={type}
        onChange={(_, nextType: TransactionType | null) => {
          if (nextType) onTypeChange(nextType);
        }}
        aria-label="交易类型"
        size="small"
      >
        {transactionTypes.map((transactionType) => (
          <ToggleButton className="txn-type-option" key={transactionType.value} value={transactionType.value}>
            {transactionType.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <input id="txn-type-value" type="hidden" name="type" value={type} />
    </Box>
  );
}