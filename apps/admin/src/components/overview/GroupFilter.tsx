'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { FilterSelect } from '@/components/FilterSelect';
import type { GroupOption } from '@/lib/students';
import { ar } from '@/messages/ar';

const ALL = 'all';

/** «المجموعة: [الكل ▾]» — the `group` search param; the server reads it and narrows the grid. */
export function GroupFilter({ groups, value }: { groups: GroupOption[]; value: string | 'all' }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === ALL) params.delete('group');
    else params.set('group', next);
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname);
  }

  return (
    <FilterSelect
      label={ar.overview.groupFilter}
      value={value}
      options={[{ value: ALL, label: ar.overview.allGroups }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
      onValueChange={select}
      className="min-w-192"
    />
  );
}
