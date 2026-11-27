import { AuthCard } from '@/components/AuthCard';
import { LoginForm } from '@/components/LoginForm';
import { ar } from '@/messages/ar';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  return (
    <AuthCard title={ar.auth.loginTitle} subtitle={ar.auth.loginSubtitle}>
      <LoginForm next={first(next)} />
    </AuthCard>
  );
}
