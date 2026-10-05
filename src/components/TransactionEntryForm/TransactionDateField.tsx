import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import dayjs from 'dayjs';

type TransactionDateFieldProps = {
  occurredAt: string;
  onDateChange: (occurredAt: string) => void;
};

// 选择交易发生时间，并提交转换后的标准日期值。
export default function TransactionDateField({ occurredAt, onDateChange }: TransactionDateFieldProps) {
  return (
    <>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <DateTimePicker
          label="发生时间"
          value={occurredAt ? dayjs(occurredAt) : null}
          onChange={(value) => onDateChange(value?.isValid() ? value.toISOString() : '')}
          format="YYYY/MM/DD HH:mm:ss"
          views={['year', 'month', 'day', 'hours', 'minutes', 'seconds']}
          openTo="day"
          ampm={false}
          slotProps={{
            textField: { id: 'txn-date', required: true, fullWidth: true, size: 'small' },
          }}
        />
      </LocalizationProvider>
      <input id="txn-date-value" type="hidden" name="occurredAt" value={occurredAt} />
    </>
  );
}