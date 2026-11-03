'use client';

import { useActionState } from 'react';
import { Alert, Box, Button, Chip, Divider, List, ListItem, Paper, Stack, Typography } from '@mui/material';
import { revokeOtherSessionsAction, revokeSessionAction } from '@/app/auth/actions';

type UserSession = {
  id: string;
  userAgent: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  current: boolean;
};

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai',
});

export default function SessionControls({ sessions }: { sessions: UserSession[] }) {
  const [state, formAction, pending] = useActionState(
    async (_previousState: { message: string }, formData: FormData) => {
      if (formData.get('sessionId')) {
        await revokeSessionAction(formData);
        return { message: '已退出所选设备。' };
      }
      await revokeOtherSessionsAction();
      return { message: '已退出所有其他设备。' };
    },
    { message: '' },
  );
  const hasOtherSessions = sessions.some((session) => !session.current);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
      <Stack spacing={2.5} aria-busy={pending}>
        <Box>
          <Typography component="h2" variant="h6">登录设备</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            管理仍在有效期内的登录会话。时间以北京时间显示。
          </Typography>
        </Box>
        <Box aria-live="polite">
          {state.message && <Alert severity="success">{state.message}</Alert>}
        </Box>
        <Box component="form" action={formAction}>
          <Button
            type="submit"
            variant="outlined"
            color="error"
            loading={pending}
            disabled={pending || !hasOtherSessions}
          >
            退出所有其他设备
          </Button>
        </Box>
        <List disablePadding aria-label="登录设备列表">
          {sessions.map((session, index) => (
            <Box component="li" key={session.id} sx={{ listStyle: 'none' }}>
              {index > 0 && <Divider sx={{ my: 2 }} />}
              <ListItem component="div" disableGutters sx={{ alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
                    <Typography variant="subtitle2">登录设备 {index + 1}</Typography>
                    {session.current && <Chip label="当前设备" size="small" color="primary" variant="outlined" />}
                  </Stack>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere', mb: 1 }}>
                    {session.userAgent || '未知设备'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="p">
                    登录时间：{dateFormatter.format(session.createdAt)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="p">
                    最近活动：{dateFormatter.format(session.lastSeenAt)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="p">
                    到期时间：{dateFormatter.format(session.expiresAt)}
                  </Typography>
                </Box>
                {!session.current && (
                  <Box component="form" action={formAction}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <Button
                      type="submit"
                      color="error"
                      variant="outlined"
                      size="small"
                      disabled={pending}
                      aria-label={`退出登录设备 ${index + 1}`}
                    >
                      退出此设备
                    </Button>
                  </Box>
                )}
              </ListItem>
            </Box>
          ))}
        </List>
        {sessions.length === 0 && <Typography color="text.secondary">暂无登录设备记录。</Typography>}
      </Stack>
    </Paper>
  );
}
