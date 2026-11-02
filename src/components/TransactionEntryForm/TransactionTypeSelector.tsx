import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { TransactionType } from './types';

/**
 * 组件：交易类型选择器
 * 功能：让用户在支出、收入和转账之间切换。
 */
type TransactionTypeSelectorProps = {
  multiple?: false;
  type: TransactionType;
  onTypeChange: (type: TransactionType) => void;
} | {
  multiple: true;
  type: (TransactionType | 'adjustment')[];
  onTypeChange: (type: (TransactionType | 'adjustment')[]) => void;
};

type SelectorProps = TransactionTypeSelectorProps & {
  fieldId?: string;
  allowTransfer?: boolean;
};

const transactionTypes: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: '支出 (e)' },
  { value: 'income', label: '收入 (i)' },
  { value: 'transfer', label: '转账 (t)' },
];

// 提供交易类型切换，并将当前类型放入表单数据。
export default function TransactionTypeSelector(props: SelectorProps) {
  const { type, fieldId = 'txn-type', allowTransfer = true } = props;
  const options = props.multiple
    ? [...transactionTypes.map((item) => ({ ...item, label: item.label.split(' ')[0] })), { value: 'adjustment' as const, label: '调整' }]
    : transactionTypes;
  return (
    <Box className="txn-type-field">
      <ToggleButtonGroup
        id={fieldId}
        exclusive={!props.multiple}
        value={type}
        onChange={(_, nextType: TransactionType | 'adjustment' | (TransactionType | 'adjustment')[] | null) => {
          if (props.multiple) {
            if (Array.isArray(nextType)) props.onTypeChange(nextType);
          } else if (nextType && !Array.isArray(nextType) && nextType !== 'adjustment') props.onTypeChange(nextType);
        }}
        aria-label="交易类型"
        size="small"
        sx={(theme) => ({
          '& .txn-type-option': {
            transition: theme.transitions.create(['background-color', 'border-color', 'color']),
          },
        })}
      >
        {options.filter((item) => allowTransfer || item.value !== 'transfer').map((transactionType) => (
          <ToggleButton
            className="txn-type-option"
            key={transactionType.value}
            value={transactionType.value}
            sx={(theme) => {
              const colors = transactionType.value === 'adjustment'
                ? { main: theme.palette.primary.main, dark: theme.palette.primary.dark, light: theme.palette.action.hover }
                : theme.palette.transaction[transactionType.value];
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
      {!props.multiple ? <input id={`${fieldId}-value`} type="hidden" name="type" value={props.type} /> : null}
    </Box>
  );
}