import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/AuthCard';
import { VerifyForm } from '@/components/VerifyForm';
import { ar } from '@/messages/ar';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const email = first(params.email);
  if (!email) redirect('/login');
  return (
    <AuthCard
      title={ar.auth.verifyTitle}
      subtitle={
        <>
          {ar.auth.verifySubtitle}{' '}
          {/* The address is LTR text inside RTL prose; isolate it so it is not reordered. */}
          <bdi dir="ltr">{email}</bdi>
        </>
      }
    >
      <VerifyForm email={email} next={first(params.next)} />
    </AuthCard>
  );
}
