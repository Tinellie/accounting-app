import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthStore, SESSION_COOKIE } from './auth-store';

export async function getCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getAuthStore().session(token);
}

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  return session;
}

export async function listUserSessions() {
  const current = await requireUser();
  return getAuthStore().sessions(current.user.id).map(session => ({
    ...session, current: session.id === current.session.id,
  }));
}
