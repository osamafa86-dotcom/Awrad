import { todayIn } from '@awrad/domain';
import Link from 'next/link';
import { useId } from 'react';

import { formatGregorian } from '@/lib/format';
import type { SupportRequest } from '@/lib/support';
import { ar } from '@/messages/ar';

import { HandleDialog } from './HandleDialog';
import { QuotedText, RequestWhen } from './RequestWhen';

const t = ar.support;

export interface SupportCardProps {
  request: SupportRequest;
  hijriAdjustment: number;
  /** The viewer's zone, for the day a request was handled. */
  timezone: string;
}

/**
 * a04 — one request: the student (to their page), the group, the week, the review and the request. Open:
 * «تمّت المعالجة»; handled: the internal note and who handled it, when.
 */
export function SupportCard({ request, hijriAdjustment, timezone }: SupportCardProps) {
  const nameId = useId();
  const name = request.studentName ?? t.unknownStudent;
  const handledOn = request.handledAt ? formatGregorian(todayIn(timezone, new Date(request.handledAt))) : null;

  return (
    <article aria-labelledby={nameId} className="flex flex-col gap-16 rounded-xl border border-line-subtle bg-surface p-16 md:p-24">
      <header className="flex flex-wrap items-start justify-between gap-12">
        <div className="flex min-w-0 flex-col gap-4">
          <Link
            id={nameId}
            href={`/students/${request.userId}`}
            className="w-fit break-words t-title-md text-fg-primary hover:text-link hover:underline focus-visible:outline-2 focus-visible:outline-line-focus"
          >
            {name}
          </Link>
          <span className="flex flex-wrap items-center gap-x-12 gap-y-4">
            <span className="t-body-sm text-fg-secondary">{request.groupName ?? t.noGroup}</span>
            <RequestWhen request={request} hijriAdjustment={hijriAdjustment} />
          </span>
        </div>
        {request.status === 'open' ? <HandleDialog request={request} hijriAdjustment={hijriAdjustment} /> : null}
      </header>

      <QuotedText label={t.review} text={request.reviewText} empty={t.noReview} />
      <QuotedText label={t.request} text={request.requestText} />

      {request.status === 'handled' ? (
        <div className="flex flex-col gap-8 rounded-md bg-sunken p-12">
          <QuotedText label={t.handledNote} text={request.handledNote} empty={t.noNote} />
          {handledOn ? (
            <p className="t-caption text-fg-secondary">
              {request.handledByName ? t.handledBy(request.handledByName, handledOn) : t.handledOn(handledOn)}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
