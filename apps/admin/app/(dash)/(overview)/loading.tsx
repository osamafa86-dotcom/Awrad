import { Skeleton } from '@/components/Skeleton';
import { ar } from '@/messages/ar';

// why: the overview lives in the (overview) route group so this loading state wraps `/` alone; at the
// (dash) level it would also stand in for every other section while it loads.

/** a01 while the grid loads: the title, the filter, three KPI cards and grid rows as token-coloured blocks. */
export default function OverviewLoading() {
  return (
    <div className="flex flex-col gap-24" aria-busy="true">
      <div className="flex flex-wrap items-end justify-between gap-16">
        <h1 className="t-display-title text-fg-primary">{ar.overview.title}</h1>
        <Skeleton className="h-44 w-192" />
      </div>
      <div className="flex flex-col gap-16 md:flex-row">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-1 flex-col gap-12 rounded-2xl border border-line-subtle bg-surface p-24">
            <Skeleton className="h-20 w-1/2" />
            <Skeleton className="h-32 w-64" />
            <Skeleton className="h-16 w-2/3" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-8 rounded-2xl border border-line-subtle bg-surface p-16">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}
