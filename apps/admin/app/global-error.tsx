'use client';

import { useEffect } from 'react';

import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/ui/button';
import { ar } from '@/messages/ar';

import './globals.css';

const t = ar.boundaries;

/**
 * An error in the root layout itself (final review admin M-2). It replaces that layout, so it renders its own
 * Arabic right-to-left document and imports the global styles; the tokens follow the system theme
 * (prefers-color-scheme) since the layout's theme script is not there.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-dvh bg-canvas text-fg-primary antialiased">
        <title>{ar.app.title}</title>
        <AuthCard title={t.errorTitle} subtitle={t.errorBody}>
          <Button type="button" variant="secondary" onClick={() => retry()}>
            {t.retry}
          </Button>
        </AuthCard>
      </body>
    </html>
  );
}
