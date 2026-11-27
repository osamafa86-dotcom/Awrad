'use client';

// A client component so the zone list and the candidates cross to the browser once, not once per row's dialog.
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { GroupRow, SupervisorOption } from '@/lib/settings';
import { ar } from '@/messages/ar';

import { GroupForm } from './GroupForm';

const t = ar.settings.groups;

export interface GroupsTableProps {
  rows: GroupRow[];
  /** The timezone picker's zones (computed on the server). */
  timezones: readonly string[];
  /** Active supervisor and admin profiles, for the supervisors multi-select. */
  candidates: readonly SupervisorOption[];
}

/** a11 «المجموعات»: every group with its zone, week start, supervisors and members; «مجموعة جديدة» and «تعديل». */
export function GroupsTable({ rows, timezones, candidates }: GroupsTableProps) {
  const names = rows.map((row) => row.name);
  const othersThan = (id: string) => rows.filter((row) => row.id !== id).map((row) => row.name);

  return (
    <section aria-labelledby="groups-title" className="flex flex-col gap-16">
      <div className="flex flex-wrap items-start justify-between gap-16">
        <div className="flex flex-col gap-4">
          <h2 id="groups-title" className="t-display-section text-fg-primary">
            {t.title}
          </h2>
          <p className="t-body-md text-fg-secondary">{t.subtitle}</p>
        </div>
        <GroupForm mode="create" timezones={timezones} candidates={candidates} takenNames={names} />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl border border-line-subtle bg-surface p-24">
          <p className="t-body-strong text-fg-primary">{t.empty.title}</p>
          <p className="t-body-md text-fg-secondary">{t.empty.body}</p>
        </div>
      ) : (
        <Table aria-label={t.tableLabel}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full min-w-160">{t.columns.name}</TableHead>
              <TableHead>{t.columns.timezone}</TableHead>
              <TableHead>{t.columns.weekStart}</TableHead>
              <TableHead className="min-w-160">{t.columns.supervisors}</TableHead>
              <TableHead>{t.columns.members}</TableHead>
              <TableHead>
                <span className="sr-only">{t.columns.actions}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="t-body-strong">{row.name}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <span dir="ltr">{row.timezone}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{ar.dates.weekdays[row.weekStartsOn]}</TableCell>
                <TableCell>
                  {row.supervisors.length > 0 ? (
                    <ul className="flex flex-col gap-4">
                      {row.supervisors.map((s) => (
                        <li key={s.id}>{s.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-fg-tertiary">{t.noSupervisors}</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{row.memberCount}</TableCell>
                <TableCell className="py-4">
                  <GroupForm
                    mode="edit"
                    group={row}
                    timezones={timezones}
                    candidates={candidates}
                    takenNames={othersThan(row.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
