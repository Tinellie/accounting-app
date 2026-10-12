import TextField from '@mui/material/TextField';

// 输入交易金额。
export default function TransactionAmountFields() {
  return (
    <TextField
      id="txn-amount"
      name="amount"
      label="金额"
      placeholder="0.00"
      required
      fullWidth
      size="small"
      slotProps={{ htmlInput: { inputMode: 'decimal' } }}
    />
  );
}