import { cn } from '@/lib/utils';

/** DESIGN.md §6 `Avatar`: the first letter of the name in a round tint (decorative; the name is beside it). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initial = Array.from(name.trim())[0] ?? '';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-32 shrink-0 items-center justify-center rounded-full bg-action-tint t-label-md text-link',
        className,
      )}
    >
      {initial}
    </span>
  );
}
