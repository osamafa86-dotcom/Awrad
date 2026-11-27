import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

/** Account status in the students table and on the student page: «نشط» or «معطَّل» (shape + text, not colour alone). */
export function StatusChip({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-4 rounded-sm px-8 py-2 t-label-sm whitespace-nowrap',
        active ? 'bg-status-done-tint text-status-done' : 'bg-status-neutral-tint text-fg-secondary',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-8 rounded-full', active ? 'bg-status-done' : 'border border-status-neutral')}
      />
      {active ? ar.students.status.active : ar.students.status.inactive}
    </span>
  );
}
