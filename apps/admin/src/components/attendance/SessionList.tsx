import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import type { SessionRow } from '@/lib/attendance';
import { formatGregorian, formatHijri } from '@/lib/format';
import { ar } from '@/messages/ar';

import { NewSessionDialog, type NewSessionDialogProps } from './NewSessionDialog';

const t = ar.attendance;

export interface SessionListProps {
  /** Newest first (RLS already scoped them to the viewer). */
  sessions: SessionRow[];
  /** «مجلس جديد», or null when the viewer has no group to create a session for. */
  create: NewSessionDialogProps | null;
  hijriAdjustment?: number;
}

/** a03 — F-62: the sessions the viewer may see; each row opens its attendance grid. */
export function SessionList({ sessions, create, hijriAdjustment = 0 }: SessionListProps) {
  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-wrap items-center justify-between gap-16">
        <h1 className="t-display-title text-fg-primary">{t.title}</h1>
        {create ? <NewSessionDialog {...create} /> : null}
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-8 rounded-xl border border-line-subtle bg-surface px-24 py-48 text-center">
          <p className="t-title-md text-fg-primary">{t.empty.title}</p>
          <p className="t-body-md text-fg-secondary">{t.empty.body}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line-subtle rounded-xl border border-line-subtle bg-surface">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/attendance/${session.id}`}
                className="flex items-center gap-16 px-16 py-12 outline-none hover:bg-action-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-line-focus"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-16">
                  <span className="flex shrink-0 flex-col sm:w-192">
                    <span className="t-body-strong text-fg-primary">{formatHijri(session.date, hijriAdjustment)}</span>
                    <span className="t-caption text-fg-secondary">{formatGregorian(session.date)}</span>
                  </span>
                  <span className="min-w-0 flex-1 break-words t-body-md text-fg-primary">
                    {session.title ?? <span className="text-fg-tertiary">{t.untitled}</span>}
                  </span>
                  <span className="t-body-sm text-fg-secondary">{session.groupName ?? t.allGroups}</span>
                  <span className="whitespace-nowrap t-body-sm text-fg-secondary tabular-nums">
                    {t.markedLabel(session.marked, session.total)}
                  </span>
                </span>
                {/* «open» points to the end side under RTL. */}
                <ChevronLeft aria-hidden="true" className="size-20 shrink-0 text-fg-secondary ltr:-scale-x-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
