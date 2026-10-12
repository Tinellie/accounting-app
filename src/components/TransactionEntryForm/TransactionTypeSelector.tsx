import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import type { TransactionType } from './types';

type TransactionTypeSelectorProps = {
  type: TransactionType;
  onTypeChange: (type: TransactionType) => void;
};

const transactionTypes: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: '支出 (e)' },
  { value: 'income', label: '收入 (i)' },
  { value: 'transfer', label: '转账 (t)' },
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
        sx={(theme) => ({
          '& .txn-type-option': {
            transition: theme.transitions.create(['background-color', 'border-color', 'color']),
          },
        })}
      >
        {transactionTypes.map((transactionType) => (
          <ToggleButton
            className="txn-type-option"
            key={transactionType.value}
            value={transactionType.value}
            sx={(theme) => {
              const colors = theme.palette.transaction[transactionType.value];
              return {
                '&:hover': {
                  backgroundColor: colors.light,
                  color: colors.dark,
                },
                '&.Mui-selected, &.Mui-selected:hover': {
                  backgroundColor: colors.main,
                  borderColor: colors.main,
                  color: theme.palette.getContrastText(colors.main),
                },
              };
            }}
          >
            {transactionType.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <input id="txn-type-value" type="hidden" name="type" value={type} />
    </Box>
  );
}