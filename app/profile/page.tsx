import type { Metadata } from 'next';
import { Stack } from '@mui/material';
import PageHeading from '@/src/components/PageHeading';
import ProfileSettings from '@/src/components/ProfileSettings';
import SessionControls from '@/src/components/SessionControls';
import { listUserSessions, requireUser } from '@/src/lib/auth';

export const metadata: Metadata = { title: '个人主页 · 个人账本' };

export default async function ProfilePage() {
  const { user } = await requireUser();
  const sessions = await listUserSessions();

  return (
    <Stack spacing={3.5}>
      <PageHeading eyebrow="Personal profile" title="个人主页" description="管理个人资料、登录密码与设备会话。" />
      <ProfileSettings username={user.username} displayName={user.displayName} />
      <SessionControls sessions={sessions} />
    </Stack>
  );
}
