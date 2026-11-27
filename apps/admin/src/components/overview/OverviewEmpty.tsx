import { UserPlus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ar } from '@/messages/ar';

const t = ar.overview.empty;

/** «لا طلاب بعد» (not drawn in Figma: the students page's empty state, in the same tokens). */
export function OverviewEmpty({ canInvite }: { canInvite: boolean }) {
  return (
    <div className="flex flex-col items-center gap-12 rounded-2xl border border-line-subtle bg-surface px-24 py-48 text-center">
      <h2 className="t-title-lg text-fg-primary">{t.title}</h2>
      <p className="t-body-md text-fg-secondary">{t.body}</p>
      {canInvite ? (
        <>
          <p className="t-body-sm text-fg-secondary">{t.inviteHint}</p>
          <Button asChild size="md" variant="secondary">
            <Link href="/students/new">
              <UserPlus aria-hidden="true" className="size-20" />
              {t.invite}
            </Link>
          </Button>
        </>
      ) : null}
    </div>
  );
}
