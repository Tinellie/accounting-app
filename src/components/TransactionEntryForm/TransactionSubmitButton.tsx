import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { TransactionType } from './types';

type TransactionSubmitButtonProps = {
  isPending: boolean;
  disabled: boolean;
  type: TransactionType;
};

// 提交交易，并在保存过程中显示等待状态。
export default function TransactionSubmitButton({ isPending, disabled, type }: TransactionSubmitButtonProps) {
  return (
    <Box id="txn-submit-row" sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button
        id="txn-submit"
        type="submit"
        variant="contained"
        disabled={disabled}
        sx={(theme) => {
          const colors = theme.palette.transaction[type];
          return {
            backgroundColor: colors.main,
            color: theme.palette.getContrastText(colors.main),
            transition: theme.transitions.create('background-color'),
            '&:hover': { backgroundColor: colors.dark },
            '&.Mui-disabled': {
              backgroundColor: colors.light,
              color: theme.palette.text.secondary,
            },
          };
        }}
      >
        {isPending ? '保存中…' : '保存记录'}
      </Button>
    </Box>
  );
}