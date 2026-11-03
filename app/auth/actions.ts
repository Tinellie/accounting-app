'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/src/lib/auth';
import { AuthError, getAuthStore, SESSION_COOKIE, SESSION_DURATION } from '@/src/lib/auth-store';

type State = { success: boolean; message: string };
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/, '用户名需为 3–32 位字母、数字或下划线');
const passwordSchema = z.string().min(10, '密码至少 10 位').max(128, '密码不能超过 128 位');
const failure = (message: string): State => ({ success: false, message });

async function requestDetails() {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  const origin = requestHeaders.get('origin');
  if (origin && new URL(origin).host !== host) throw new AuthError('不允许跨站操作');
  return {
    agent: requestHeaders.get('user-agent') ?? '未知设备',
    address: requestHeaders.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'local',
  };
}

async function setSession(token: string, maxAge = SESSION_DURATION / 1000) {
  const requestHeaders = await headers();
  const secure = process.env.NODE_ENV === 'production' || requestHeaders.get('x-forwarded-proto') === 'https';
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge,
  });
}

async function authenticate(form: FormData, register: boolean): Promise<State> {
  const parsed = z.object({
    username: usernameSchema, password: register ? passwordSchema : z.string().min(1).max(128),
  }).safeParse({ username: form.get('username'), password: form.get('password') });
  if (!parsed.success) return failure(parsed.error.issues[0].message);
  if (register && form.get('confirmPassword') !== parsed.data.password) return failure('两次输入的密码不一致');
  try {
    const details = await requestDetails();
    const store = getAuthStore();
    store.rateLimit(`${register ? 'register' : 'login'}:ip:${details.address}`, register ? 5 : 20, register ? 3600000 : 900000);
    store.rateLimit(`login:user:${parsed.data.username}`, 20, 900000);
    const result = register
      ? await store.register(parsed.data.username, parsed.data.password, details.agent)
      : await store.login(parsed.data.username, parsed.data.password, details.agent);
    await setSession(result.token);
  } catch (error) {
    if (error instanceof AuthError) return failure(error.message);
    console.error('[auth]', error);
    return failure('登录服务暂时不可用，请稍后重试');
  }
  redirect('/');
}

export async function loginAction(_previous: State, form: FormData): Promise<State> {
  return authenticate(form, false);
}
export async function registerAction(_previous: State, form: FormData): Promise<State> {
  return authenticate(form, true);
}
export async function logoutAction(): Promise<void> {
  const current = await requireUser();
  await requestDetails();
  getAuthStore().revoke(current.user.id, current.session.id);
  await setSession('', 0);
  redirect('/login');
}
export async function updateProfileAction(_previous: State, form: FormData): Promise<State> {
  const current = await requireUser();
  const parsed = z.string().trim().min(1, '请输入显示名称').max(50, '显示名称不能超过 50 字').safeParse(form.get('displayName'));
  if (!parsed.success) return failure(parsed.error.issues[0].message);
  await requestDetails();
  getAuthStore().updateProfile(current.user.id, parsed.data);
  revalidatePath('/', 'layout');
  return { success: true, message: '个人资料已更新' };
}
export async function changePasswordAction(_previous: State, form: FormData): Promise<State> {
  const current = await requireUser();
  const parsed = passwordSchema.safeParse(form.get('newPassword'));
  if (!parsed.success) return failure(parsed.error.issues[0].message);
  if (form.get('confirmPassword') !== parsed.data) return failure('两次输入的密码不一致');
  const old = z.string().min(1).max(128).safeParse(form.get('currentPassword'));
  if (!old.success) return failure('请输入当前密码');
  try {
    await requestDetails();
    const store = getAuthStore();
    store.rateLimit(`password:${current.user.id}`, 10, 900000);
    const result = await store.changePassword(current.user.id, current.session.id, old.data, parsed.data);
    await setSession(result.token);
  } catch (error) {
    if (error instanceof AuthError) return failure(error.message);
    console.error('[auth:password]', error);
    return failure('修改密码失败，请稍后重试');
  }
  revalidatePath('/profile');
  return { success: true, message: '密码已更新，其他设备已退出登录' };
}
export async function revokeSessionAction(form: FormData): Promise<void> {
  const current = await requireUser();
  await requestDetails();
  const id = z.uuid().parse(form.get('sessionId'));
  getAuthStore().revoke(current.user.id, id);
  if (id === current.session.id) {
    await setSession('', 0);
    redirect('/login');
  }
  revalidatePath('/profile');
}
export async function revokeOtherSessionsAction(): Promise<void> {
  const current = await requireUser();
  await requestDetails();
  getAuthStore().revokeOthers(current.user.id, current.session.id);
  revalidatePath('/profile');
}
