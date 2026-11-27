import { Skeleton } from '@/components/Skeleton';
import { ar } from '@/messages/ar';

/** a03 while the sessions load: the title, the «مجلس جديد» button and list rows as token-coloured blocks. */
export default function AttendanceLoading() {
  return (
    <div className="flex flex-col gap-24" aria-busy="true">
      <div className="flex flex-wrap items-center justify-between gap-16">
        <h1 className="t-display-title text-fg-primary">{ar.attendance.title}</h1>
        <Skeleton className="h-44 w-160" />
      </div>
      <div className="flex flex-col gap-8 rounded-xl border border-line-subtle bg-surface p-16">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}
