import { useActionState, useEffect, useState } from 'react';
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material';
import {
  createAccountAction,
  updateAccountAction,
  type AccountActionState,
} from '@/app/accounts/actions';
import { accountIconSelection } from '@/src/lib/account-icon-url';
import AccountIconPicker from './AccountIconPicker';
import { accountTypes, initialActionState, type AccountRecord } from './types';

/**
 * 组件：账户表单
 * 功能：供用户新增或修改账户名称、代码、类型、图标及初始信息。
 * 保存后会返回账户管理列表。
 */
type AccountFormProps = {
  account: AccountRecord | null;
  icons: string[];
  onCancel: () => void;
};

export default function AccountForm({ account, icons, onCancel }: AccountFormProps) {
  // 根据是否已有账户选择新增或更新操作。
  const action = account ? updateAccountAction : createAccountAction;
  // 服务端保存结果、提交函数和当前是否正在保存。
  const [state, formAction, isPending] = useActionState<AccountActionState, FormData>(action, initialActionState);
  // code 是账户唯一代码，name 是显示名称，type 是账户类别，icon 是所选图标。
  const [formValues, setFormValues] = useState(() => ({
    code: account ? account.code ?? `account-${account.id}` : '',
    name: account?.name ?? '',
    type: account?.type ?? 'checking' as AccountRecord['type'],
    icon: accountIconSelection(account?.icon ?? null),
  }));

  useEffect(() => {
    if (state.success) onCancel();
  }, [state.success, onCancel]);

  return (
    <Box component="form" action={formAction} sx={{ pt: 1 }}>
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <Stack spacing={2}>
        {state.message ? (
          <Alert severity={state.success ? 'success' : 'error'} role="status">{state.message}</Alert>
        ) : null}

        <TextField
          id="account-code"
          name="code"
          label="账户代码"
          required
          fullWidth
          value={formValues.code}
          onChange={(event) => setFormValues((current) => ({ ...current, code: event.target.value }))}
          helperText="唯一标识，例如 ali"
          slotProps={{ htmlInput: { maxLength: 50 } }}
        />

        <TextField
          id="account-name"
          name="name"
          label="账户名称"
          required
          fullWidth
          value={formValues.name}
          onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
        />

        <FormControl fullWidth required>
          <InputLabel id="account-type-label">账户类型</InputLabel>
          <Select
            id="account-type"
            name="type"
            labelId="account-type-label"
            label="账户类型"
            value={formValues.type}
            onChange={(event) => setFormValues((current) => ({
              ...current,
              type: event.target.value as AccountRecord['type'],
            }))}
          >
            {accountTypes.map((type) => (
              <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <input type="hidden" name="icon" value={formValues.icon} />
        <AccountIconPicker
          icons={icons}
          value={formValues.icon}
          onChange={(icon) => setFormValues((current) => ({ ...current, icon }))}
        />

        <TextField
          id="account-icon"
          name="iconUpload"
          label="上传新图标"
          type="file"
          fullWidth
          helperText="上传图片会替换上方选择的图标；支持 PNG、JPEG 或 WebP，最大 5 MB"
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { accept: 'image/png,image/jpeg,image/webp' },
          }}
        />

        {!account ? (
          <>
            <TextField
              id="account-balance"
              name="balance"
              label="初始余额"
              placeholder="0.00"
              fullWidth
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
            <TextField
              id="account-currency"
              name="currency"
              label="货币代码"
              defaultValue="CNY"
              required
              fullWidth
            />
          </>
        ) : null}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button type="button" onClick={onCancel}>取消</Button>
          <Button type="submit" variant="contained" disabled={isPending}>
            {isPending ? '保存中…' : account ? '保存修改' : '添加账户'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}