import { formatGregorian, formatHijri } from '@/lib/format';
import type { SupportRequest } from '@/lib/support';
import { ar } from '@/messages/ar';

const t = ar.support;

/** The log a request belongs to: its week (first day, Hijri · Gregorian), or its day with the «يومي» chip. */
export function RequestWhen({ request, hijriAdjustment }: { request: SupportRequest; hijriAdjustment: number }) {
  const hijri = formatHijri(request.periodStart, hijriAdjustment);
  const gregorian = formatGregorian(request.periodStart);
  return (
    <span className="inline-flex flex-wrap items-center gap-8">
      <span className="t-body-sm text-fg-secondary">
        {request.period === 'weekly' ? t.week(hijri, gregorian) : t.day(hijri, gregorian)}
      </span>
      {request.period === 'daily' ? (
        <span className="rounded-sm bg-sunken px-8 py-2 t-label-sm whitespace-nowrap text-fg-secondary">
          {t.frequency.daily}
        </span>
      ) : null}
    </span>
  );
}

/** A labelled block of the student's own words, shown whole: it wraps, never truncates (DESIGN.md §7 rule 9). */
export function QuotedText({ label, text, empty }: { label: string; text: string | null; empty?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="t-label-sm text-fg-secondary">{label}</p>
      {text ? (
        <p className="t-body-md break-words whitespace-pre-wrap text-fg-primary">{text}</p>
      ) : (
        <p className="t-body-md text-fg-tertiary">{empty}</p>
      )}
    </div>
  );
}
