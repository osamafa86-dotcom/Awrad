'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Avatar } from '@/components/Avatar';
import { FilterSelect } from '@/components/FilterSelect';
import { SearchField } from '@/components/SearchField';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatGregorian, formatHijri } from '@/lib/format';
import type { GroupOption, StudentFilters, StudentRow } from '@/lib/students';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

import { StatusChip } from './StatusChip';

const t = ar.students;
const ALL = 'all';

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, StudentRow>();

function columnsFor(hijriAdjustment: number) {
  return helper.columns([
    helper.accessor('fullName', {
      id: 'name',
      header: t.columns.name,
      cell: ({ row }) => (
        <span className="flex items-center gap-12">
          <Avatar name={row.original.fullName} />
          <Link
            href={`/students/${row.original.id}`}
            className="rounded-sm t-body-strong text-fg-primary outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-line-focus"
          >
            {row.original.fullName}
          </Link>
        </span>
      ),
    }),
    helper.accessor('groupName', {
      id: 'group',
      header: t.columns.group,
      cell: ({ getValue }) => getValue() ?? <span className="text-fg-tertiary">{t.noGroup}</span>,
    }),
    helper.accessor('isActive', {
      id: 'status',
      header: t.columns.status,
      cell: ({ getValue }) => <StatusChip active={getValue()} />,
    }),
    helper.accessor('joinedAt', {
      id: 'joinedAt',
      header: t.columns.joinedAt,
      cell: ({ getValue }) => (
        <span className="flex flex-col">
          <span>{formatHijri(getValue(), hijriAdjustment)}</span>
          <span className="t-caption text-fg-secondary">{formatGregorian(getValue())}</span>
        </span>
      ),
    }),
    helper.accessor('isTracked', {
      id: 'tracked',
      header: t.columns.tracked,
      cell: ({ getValue }) => (getValue() ? t.tracked.yes : t.tracked.no),
    }),
  ]);
}

/** The name column takes the free width (a08); the others keep to their content and never wrap mid-value. */
const COLUMN_CLASS: Record<string, string> = { name: 'w-full min-w-192' };
const fixed = 'whitespace-nowrap';

export interface StudentsTableProps {
  /** The rows the server loaded for the current group/status filters (RLS already scoped them). */
  rows: StudentRow[];
  groups: GroupOption[];
  /** Admins only: the «دعوة طالب» button. */
  canInvite: boolean;
  filters: StudentFilters;
  hijriAdjustment?: number;
}

/** a08: search by name (client side), filter by group and status (URL params, applied on the server). */
export function StudentsTable({ rows, groups, canInvite, filters, hijriAdjustment = 0 }: StudentsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');

  const columns = useMemo(() => columnsFor(hijriAdjustment), [hijriAdjustment]);
  const data = useMemo(() => {
    const needle = query.trim();
    return needle ? rows.filter((row) => row.fullName.includes(needle)) : rows;
  }, [rows, query]);
  const table = useTable({ features, columns, data, getRowId: (row) => row.id });

  function setFilter(key: 'group' | 'status', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) params.delete(key);
    else params.set(key, value);
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname);
  }

  const filtered = Boolean(filters.group || filters.status);

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-wrap items-center justify-between gap-16">
        <h1 className="t-display-title text-fg-primary">{t.title}</h1>
        {canInvite ? (
          <Button asChild size="md">
            <Link href="/students/new">
              <UserPlus aria-hidden="true" className="size-20" />
              {t.invite}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-12">
        <SearchField
          label={t.searchLabel}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-240 flex-1"
        />
        <FilterSelect
          label={t.groupFilter}
          value={filters.group ?? ALL}
          options={[{ value: ALL, label: t.allGroups }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
          onValueChange={(value) => setFilter('group', value)}
          className="min-w-192"
        />
        <FilterSelect
          label={t.statusFilter}
          value={filters.status ?? ALL}
          options={[
            { value: ALL, label: t.allStatuses },
            { value: 'active', label: t.status.active },
            { value: 'inactive', label: t.status.inactive },
          ]}
          onValueChange={(value) => setFilter('status', value)}
          className="min-w-160"
        />
      </div>

      {rows.length === 0 && !filtered ? (
        <div className="flex flex-col items-center gap-8 rounded-xl border border-line-subtle bg-surface px-24 py-48 text-center">
          <p className="t-title-md text-fg-primary">{t.empty.title}</p>
          <p className="t-body-md text-fg-secondary">{t.empty.body}</p>
        </div>
      ) : (
        <>
          <p className="t-body-sm text-fg-secondary" aria-live="polite">
            {t.count(data.length, rows.length)}
          </p>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id} className={COLUMN_CLASS[header.column.id] ?? fixed}>
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(COLUMN_CLASS[cell.column.id] ?? fixed)}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.length === 0 ? (
            <p className="t-body-md text-fg-secondary">{query.trim() ? t.emptyFiltered : t.emptyForFilters}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
