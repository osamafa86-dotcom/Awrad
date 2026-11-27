import { Skeleton } from '@/components/Skeleton';
import { ar } from '@/messages/ar';

/** a10 while the groups load: the title and the form's fields as token-coloured blocks. */
export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-24" aria-busy="true">
      <h1 className="t-display-title text-fg-primary">{ar.reports.title}</h1>
      <div className="flex flex-col gap-24 rounded-xl border border-line-subtle bg-surface p-24">
        <div className="flex flex-wrap gap-16">
          <Skeleton className="h-52 w-192" />
          <Skeleton className="h-52 w-192" />
        </div>
        <Skeleton className="h-44 w-320" />
        <div className="flex flex-wrap gap-16">
          <Skeleton className="h-52 w-192" />
          <Skeleton className="h-52 w-192" />
        </div>
        <Skeleton className="h-44 w-160 self-end" />
      </div>
    </div>
  );
}
