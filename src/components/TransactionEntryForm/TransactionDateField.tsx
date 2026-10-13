import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateTimePicker, LocalizationProvider } from '@mui/x-date-pickers';
import dayjs from 'dayjs';

/**
 * 组件：交易时间选择器
 * 功能：让用户选择交易发生的日期和具体时间。
 */
type TransactionDateFieldProps = {
  occurredAt: string;
  onDateChange: (occurredAt: string) => void;
  fieldId?: string;
};

// 选择交易发生时间，并提交转换后的标准日期值。
export default function TransactionDateField({ occurredAt, onDateChange, fieldId = 'txn-date' }: TransactionDateFieldProps) {
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
          slotProps={{ textField: { id: fieldId, required: true, fullWidth: true, size: 'small' } }}
        />
      </LocalizationProvider>
      <input id={`${fieldId}-value`} type="hidden" name="occurredAt" value={occurredAt} />
    </>
  );
}