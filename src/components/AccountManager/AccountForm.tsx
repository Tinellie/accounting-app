import { useActionState, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import {
  createAccountAction,
  updateAccountAction,
  type AccountActionState,
} from '@/app/accounts/actions';
import { accountIconSelection } from '@/src/lib/account-icon-url';
import AccountIconPicker from './AccountIconPicker';
import { accountTypes, initialActionState, type AccountRecord } from './types';

type AccountFormProps = {
  account: AccountRecord | null;
  icons: string[];
  onCancel: () => void;
};

export default function AccountForm({ account, icons, onCancel }: AccountFormProps) {
  const action = account ? updateAccountAction : createAccountAction;
  const [state, formAction, isPending] = useActionState<AccountActionState, FormData>(action, initialActionState);
  const [code, setCode] = useState(account ? account.code ?? `account-${account.id}` : '');
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountRecord['type']>(account?.type ?? 'checking');
  const [selectedIcon, setSelectedIcon] = useState(accountIconSelection(account?.icon ?? null));

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
          value={code}
          onChange={(event) => setCode(event.target.value)}
          helperText="唯一标识，例如 ali"
          slotProps={{ htmlInput: { maxLength: 50 } }}
        />

        <TextField
          id="account-name"
          name="name"
          label="账户名称"
          required
          fullWidth
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <FormControl fullWidth required>
          <InputLabel id="account-type-label">账户类型</InputLabel>
          <Select
            id="account-type"
            name="type"
            labelId="account-type-label"
            label="账户类型"
            value={type}
            onChange={(event) => setType(event.target.value as AccountRecord['type'])}
          >
            {accountTypes.map((type) => (
              <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <input type="hidden" name="icon" value={selectedIcon} />
        <AccountIconPicker icons={icons} value={selectedIcon} onChange={setSelectedIcon} />

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