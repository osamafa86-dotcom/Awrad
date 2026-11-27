import Link from 'next/link';

import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/ui/button';
import { ar } from '@/messages/ar';

const t = ar.boundaries;

/** Any URL no route matches (final review admin M-2): Arabic, in the sign-in card shell, with a way back. */
export default function NotFound() {
  return (
    <AuthCard title={t.notFoundTitle} subtitle={t.notFoundBody}>
      <Button asChild variant="secondary">
        <Link href="/">{t.backHome}</Link>
      </Button>
    </AuthCard>
  );
}
