import { Box, Button } from '@mui/material';
import type { TransactionType } from './types';

/**
 * 组件：交易保存按钮
 * 功能：让用户提交当前交易，并在保存期间显示对应状态。
 */
type TransactionSubmitButtonProps = {
  isPending: boolean;
  disabled: boolean;
  type: TransactionType;
  fieldId?: string;
  label?: string;
};

// 提交交易，并在保存过程中显示等待状态。
export default function TransactionSubmitButton({
  isPending,
  disabled,
  type,
  fieldId = 'txn-submit',
  label = '保存记录',
}: TransactionSubmitButtonProps) {
  return (
    <Box id="txn-submit-row" sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button
        id={fieldId}
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
        {isPending ? '保存中…' : label}
      </Button>
    </Box>
  );
}