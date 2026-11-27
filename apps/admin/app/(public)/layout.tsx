import Link from 'next/link';
import type { ReactNode } from 'react';

import { RubMark } from '@/components/RubMark';
import { ar } from '@/messages/ar';

const t = ar.publicPage;

/** Shell of the public pages (the privacy policy): brand header, one prose column, a way to the sign-in page. No session. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line-subtle bg-surface">
        <div className="mx-auto flex w-full max-w-720 items-center gap-12 px-16 py-16">
          <RubMark size={40} className="shrink-0 text-action" />
          <div className="flex flex-col">
            <p className="t-display-brand text-fg-primary">{ar.app.name}</p>
            <p className="t-body-sm text-fg-secondary">{t.program}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-720 flex-1 px-16 py-32 md:py-48">{children}</main>
      <footer className="border-t border-line-subtle">
        <div className="mx-auto w-full max-w-720 px-16 py-24">
          <Link
            href="/login"
            className="t-body-md text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-line-focus"
          >
            {t.backToLogin}
          </Link>
        </div>
      </footer>
    </div>
  );
}
