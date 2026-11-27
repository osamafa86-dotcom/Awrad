import { Skeleton } from '@/components/Skeleton';
import { ar } from '@/messages/ar';

/** a08 while the list loads: the title, the filter bar and table rows as token-coloured blocks. */
export default function StudentsLoading() {
  return (
    <div className="flex flex-col gap-24" aria-busy="true">
      <h1 className="t-display-title text-fg-primary">{ar.students.title}</h1>
      <div className="flex flex-wrap gap-12">
        <Skeleton className="h-44 min-w-240 flex-1" />
        <Skeleton className="h-44 w-192" />
        <Skeleton className="h-44 w-160" />
      </div>
      <div className="flex flex-col gap-8 rounded-xl border border-line-subtle bg-surface p-16">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}
