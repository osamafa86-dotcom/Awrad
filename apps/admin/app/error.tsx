'use client';

import { useEffect } from 'react';

import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/ui/button';
import { ar } from '@/messages/ar';

const t = ar.boundaries;

/**
 * An uncaught render error below the root layout (final review admin M-2). The raw message never reaches the page
 * (production sends only a digest anyway); the browser console keeps it for whoever debugs.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <AuthCard title={t.errorTitle} subtitle={t.errorBody}>
      <Button type="button" variant="secondary" onClick={() => retry()}>
        {t.retry}
      </Button>
    </AuthCard>
  );
}
