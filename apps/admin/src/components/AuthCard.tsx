import type { ReactNode } from 'react';

import { ar } from '@/messages/ar';

import { RubMark } from './RubMark';

export interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/** Shell of the sign-in pages and the refusal page: brand mark, app name and tagline, then the form. */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-16 py-48">
      <div className="flex w-full max-w-400 flex-col gap-24">
        <div className="flex flex-col items-center gap-8 text-center">
          <RubMark size={48} className="text-action" />
          <p className="t-display-brand text-fg-primary">{ar.app.name}</p>
          <p className="t-body-md text-fg-secondary">{ar.app.tagline}</p>
        </div>
        <div className="flex flex-col gap-8">
          <h1 className="t-display-title text-fg-primary">{title}</h1>
          {subtitle ? <p className="t-body-md text-fg-secondary">{subtitle}</p> : null}
        </div>
        <div className="flex flex-col gap-16">{children}</div>
      </div>
    </main>
  );
}
