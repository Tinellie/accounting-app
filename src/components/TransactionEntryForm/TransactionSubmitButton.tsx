import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

type TransactionSubmitButtonProps = {
  isPending: boolean;
  disabled: boolean;
};

// 提交交易，并在保存过程中显示等待状态。
export default function TransactionSubmitButton({ isPending, disabled }: TransactionSubmitButtonProps) {
  return (
    <Box id="txn-submit-row" sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button id="txn-submit" type="submit" variant="contained" disabled={disabled}>
        {isPending ? '保存中…' : '保存记录'}
      </Button>
    </Box>
  );
}