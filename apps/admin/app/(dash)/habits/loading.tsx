import { Skeleton } from '@/components/Skeleton';
import { ar } from '@/messages/ar';

/** a06 while the habits load: the title, «عادة جديدة», the tabs and table rows as token-coloured blocks. */
export default function HabitsLoading() {
  return (
    <div className="flex flex-col gap-24" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-16">
        <h1 className="t-display-title text-fg-primary">{ar.habits.title}</h1>
        <Skeleton className="h-44 w-160" />
      </div>
      <Skeleton className="h-44 w-240" />
      <div className="flex flex-col gap-8 rounded-xl border border-line-subtle bg-surface p-16">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}
