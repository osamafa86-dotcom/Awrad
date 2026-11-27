import { ar } from '@/messages/ar';

/** Placeholder for a section that a later Phase 3 task builds. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="t-display-title text-fg-primary">{title}</h1>
      <p className="t-body-md text-fg-secondary">{ar.common.comingSoon}</p>
    </div>
  );
}
