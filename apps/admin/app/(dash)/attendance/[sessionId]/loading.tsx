import { Skeleton } from '@/components/Skeleton';

/** a03 while a session loads: the header and a section of rows as token-coloured blocks. */
export default function SessionLoading() {
  return (
    <div className="flex flex-col gap-24" aria-busy="true">
      <div className="flex flex-col gap-12">
        <Skeleton className="h-20 w-64" />
        <Skeleton className="h-40 w-240" />
        <Skeleton className="h-20 w-320" />
      </div>
      <div className="flex flex-col gap-12 rounded-xl border border-line-subtle bg-surface p-16">
        <Skeleton className="h-32 w-192" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-52 w-full" />
        ))}
      </div>
    </div>
  );
}
