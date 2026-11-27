import { Skeleton } from '@/components/Skeleton';

/** a02 while the student loads: header, five stat cards, the calendar and a table as token blocks. */
export default function StudentLoading() {
  return (
    <div className="flex flex-col gap-32" aria-busy="true">
      <div className="flex items-center gap-16">
        <Skeleton className="size-48 rounded-full" />
        <div className="flex flex-col gap-8">
          <Skeleton className="h-32 w-240" />
          <Skeleton className="h-16 w-320" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-12 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-96 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-320 rounded-xl" />
      <Skeleton className="h-240 rounded-xl" />
    </div>
  );
}
