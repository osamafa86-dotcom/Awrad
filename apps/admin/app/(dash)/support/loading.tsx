import { Skeleton } from '@/components/Skeleton';
import { ar } from '@/messages/ar';

/** a04 while the requests load: the title, the tabs and request cards as token-coloured blocks. */
export default function SupportLoading() {
  return (
    <div className="flex flex-col gap-24" aria-busy="true">
      <h1 className="t-display-title text-fg-primary">{ar.support.title}</h1>
      <Skeleton className="h-44 w-320" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex flex-col gap-12 rounded-xl border border-line-subtle bg-surface p-16">
          <Skeleton className="h-24 w-192" />
          <Skeleton className="h-16 w-240" />
          <Skeleton className="h-48 w-full" />
        </div>
      ))}
    </div>
  );
}
