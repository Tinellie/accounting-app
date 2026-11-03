'use client';

import { useActionState } from 'react';
import { Alert, Box, Button, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import { loginAction, registerAction } from '@/app/auth/actions';
import NextLink from '@/src/components/NextLink';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const [state, formAction, pending] = useActionState(
    isRegister ? registerAction : loginAction,
    { success: false, message: '' },
  );

  return (
    <Box sx={{ width: '100%', maxWidth: 440 }}>
      <Typography variant="overline" color="secondary.main">个人账本 · FINANCE DESK</Typography>
      <Paper variant="outlined" sx={{ mt: 1.5, p: { xs: 3, sm: 4 } }}>
        <Stack component="form" action={formAction} spacing={2.5} aria-busy={pending}>
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 600 }}>
              {isRegister ? '创建账户' : '欢迎回来'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {isRegister ? '开放注册，使用用户名和密码创建自己的账本。' : '登录后继续管理你的个人财务。'}
            </Typography>
          </Box>
          <Box aria-live="polite">
            {state.message && <Alert severity={state.success ? 'success' : 'error'}>{state.message}</Alert>}
          </Box>
          <TextField
            label="用户名"
            name="username"
            autoComplete="username"
            helperText={isRegister ? '3–32 位字母、数字或下划线，不区分大小写。' : undefined}
            slotProps={{
              htmlInput: {
                minLength: 3,
                maxLength: 32,
                pattern: '[A-Za-z0-9_]{3,32}',
                autoCapitalize: 'none',
                spellCheck: false,
              },
            }}
            required
            fullWidth
            disabled={pending}
          />
          <TextField
            label="密码"
            name="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            helperText={isRegister ? '密码长度为 10–128 个字符。' : undefined}
            slotProps={{ htmlInput: isRegister ? { minLength: 10, maxLength: 128 } : {} }}
            required
            fullWidth
            disabled={pending}
          />
          {isRegister && (
            <TextField
              label="确认密码"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              slotProps={{ htmlInput: { minLength: 10, maxLength: 128 } }}
              required
              fullWidth
              disabled={pending}
            />
          )}
          <Button type="submit" variant="contained" size="large" loading={pending} disabled={pending}>
            {isRegister ? '注册并登录' : '登录'}
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {isRegister ? '已有账户？' : '还没有账户？'}{' '}
            <Link component={NextLink} href={isRegister ? '/login' : '/register'}>
              {isRegister ? '前往登录' : '免费注册'}
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
