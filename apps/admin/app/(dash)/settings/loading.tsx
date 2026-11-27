import { Skeleton } from '@/components/Skeleton';
import { ar } from '@/messages/ar';

/** a11 while the settings load: the title, the settings form's fields and the groups table as token-coloured blocks. */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-40" aria-busy="true">
      <h1 className="t-display-title text-fg-primary">{ar.settings.title}</h1>
      <div className="grid gap-20 rounded-xl border border-line-subtle bg-surface p-24 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-8">
            <Skeleton className="h-20 w-160" />
            <Skeleton className="h-52 w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-8 rounded-xl border border-line-subtle bg-surface p-16">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}
