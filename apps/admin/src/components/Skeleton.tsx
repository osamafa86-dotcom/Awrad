import { cn } from '@/lib/utils';

/** A loading placeholder on the sunken token colour (skeletons are not drawn in Figma: DESIGN.md §11 Q4). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-sunken motion-reduce:animate-none', className)} />;
}
