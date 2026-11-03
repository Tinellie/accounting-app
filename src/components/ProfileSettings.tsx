'use client';

import { useActionState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { changePasswordAction, updateProfileAction } from '@/app/auth/actions';

type ProfileSettingsProps = {
  username: string;
  displayName: string;
};

export default function ProfileSettings({ username, displayName }: ProfileSettingsProps) {
  const [profileState, profileAction, profilePending] = useActionState(updateProfileAction, {
    success: false,
    message: '',
  });
  const [passwordState, passwordAction, passwordPending] = useActionState(changePasswordAction, {
    success: false,
    message: '',
  });

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack component="form" action={profileAction} spacing={2.5} aria-busy={profilePending}>
          <Typography component="h2" variant="h6">个人资料</Typography>
          <Box aria-live="polite">
            {profileState.message && (
              <Alert severity={profileState.success ? 'success' : 'error'}>{profileState.message}</Alert>
            )}
          </Box>
          <TextField
            label="用户名"
            value={username}
            slotProps={{ input: { readOnly: true } }}
            helperText="用户名用于登录，不可修改。"
            fullWidth
          />
          <TextField
            label="显示名称"
            name="displayName"
            defaultValue={displayName}
            autoComplete="nickname"
            required
            disabled={profilePending}
            fullWidth
          />
          <Button type="submit" variant="contained" loading={profilePending} disabled={profilePending} sx={{ alignSelf: 'flex-start' }}>
            保存资料
          </Button>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack component="form" action={passwordAction} spacing={2.5} aria-busy={passwordPending}>
          <Box>
            <Typography component="h2" variant="h6">修改密码</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              请先验证当前密码，再设置新的登录密码。
            </Typography>
          </Box>
          <Box aria-live="polite">
            {passwordState.message && (
              <Alert severity={passwordState.success ? 'success' : 'error'}>{passwordState.message}</Alert>
            )}
          </Box>
          <TextField
            label="当前密码"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            disabled={passwordPending}
            fullWidth
          />
          <TextField
            label="新密码"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            helperText="密码长度为 10–128 个字符。"
            slotProps={{ htmlInput: { minLength: 10, maxLength: 128 } }}
            required
            disabled={passwordPending}
            fullWidth
          />
          <TextField
            label="确认新密码"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            slotProps={{ htmlInput: { minLength: 10, maxLength: 128 } }}
            required
            disabled={passwordPending}
            fullWidth
          />
          <Button type="submit" variant="contained" loading={passwordPending} disabled={passwordPending} sx={{ alignSelf: 'flex-start' }}>
            更新密码
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
