import type { Metadata } from 'next';
import AuthForm from '@/src/components/AuthForm';

export const metadata: Metadata = { title: '登录 · 个人账本' };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
