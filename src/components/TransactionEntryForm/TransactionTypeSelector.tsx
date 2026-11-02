import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { TransactionType } from './types';

/**
 * 组件：交易类型选择器
 * 功能：让用户在支出、收入和转账之间切换。
 */
type TransactionTypeSelectorProps = {
  type: TransactionType;
  onTypeChange: (type: TransactionType) => void;
  fieldId?: string;
  allowTransfer?: boolean;
};

const transactionTypes: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: '支出 (e)' },
  { value: 'income', label: '收入 (i)' },
  { value: 'transfer', label: '转账 (t)' },
];

// 提供交易类型切换，并将当前类型放入表单数据。
export default function TransactionTypeSelector({ type, onTypeChange, fieldId = 'txn-type', allowTransfer = true }: TransactionTypeSelectorProps) {
  return (
    <Box className="txn-type-field">
      <ToggleButtonGroup
        id={fieldId}
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
        {transactionTypes.filter((item) => allowTransfer || item.value !== 'transfer').map((transactionType) => (
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
      <input id={`${fieldId}-value`} type="hidden" name="type" value={type} />
    </Box>
  );
}