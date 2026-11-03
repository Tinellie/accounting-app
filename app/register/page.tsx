import type { Metadata } from 'next';
import AuthForm from '@/src/components/AuthForm';

export const metadata: Metadata = { title: '注册 · 个人账本' };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
