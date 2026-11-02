import { TextField } from '@mui/material';

/**
 * 组件：交易金额输入框
 * 功能：让用户填写本笔交易的金额。
 */
type TransactionAmountFieldsProps = {
  fieldId?: string;
  initialValue?: string;
};

// 输入交易金额。
export default function TransactionAmountFields({ fieldId = 'txn-amount', initialValue }: TransactionAmountFieldsProps) {
  return (
    <TextField
      id={fieldId}
      name="amount"
      label="金额"
      placeholder="0.00"
      helperText="支出退款填写负金额，普通支出、收入及转账填写正金额"
      defaultValue={initialValue}
      required
      fullWidth
      size="small"
      slotProps={{ htmlInput: { inputMode: 'decimal' } }}
    />
  );
}