import TextField from '@mui/material/TextField';

type TransactionDateFieldProps = {
  occurredAt: string;
  onDateChange: (occurredAt: string) => void;
};

// 选择交易发生时间，并提交转换后的标准日期值。
export default function TransactionDateField({ occurredAt, onDateChange }: TransactionDateFieldProps) {
  return (
    <>
      <TextField
        id="txn-date"
        name="occurredAtLocal"
        label="发生时间"
        type="datetime-local"
        required
        fullWidth
        size="small"
        slotProps={{ inputLabel: { shrink: true } }}
        onChange={(event) => {
          const selectedDate = new Date(event.target.value);
          onDateChange(Number.isNaN(selectedDate.getTime()) ? '' : selectedDate.toISOString());
        }}
      />
      <input id="txn-date-value" type="hidden" name="occurredAt" value={occurredAt} />
    </>
  );
}