import type { DayState } from '@awrad/domain';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Avatar } from '@/components/Avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatGregorian, formatHijri } from '@/lib/format';
import type { GroupOption } from '@/lib/students';
import type {
  AttendanceRow,
  Loaded,
  LogRow,
  StudentProfile,
  StudentSummary,
} from '@/lib/supabase/students';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

import { MonthCalendar, type CalendarDay } from './MonthCalendar';
import { StatusChip } from './StatusChip';
import { StudentEditPanel } from './StudentEditPanel';

const t = ar.students.detail;
const EXCERPT = 140;

export interface StudentDetailProps {
  student: StudentProfile;
  /** The student's today, `YYYY-MM-DD`. */
  today: string;
  /** `YYYY-MM` shown by the calendar (the current month). */
  month: string;
  hijriAdjustment: number;
  summary: Loaded<StudentSummary>;
  calendar: Loaded<Map<string, CalendarDay>>;
  logs: Loaded<LogRow[]>;
  attendance: Loaded<AttendanceRow[]>;
  /** Admins: the edit panel, activate/deactivate and delete. Supervisors read only. */
  canEdit: boolean;
  /** The viewer is looking at their own profile (no deactivate or delete). */
  isSelf?: boolean;
  groups: GroupOption[];
}

/** a02 — the student page: header, summary, this month, latest logs, attendance (and the admin's tools). */
export function StudentDetail(props: StudentDetailProps) {
  const { student, today, month, hijriAdjustment, summary, calendar, logs, attendance, canEdit, isSelf, groups } = props;
  return (
    <div className="flex flex-col gap-32">
      <header className="flex flex-col gap-16">
        <Link
          href="/students"
          className="inline-flex w-fit items-center gap-4 rounded-sm t-label-md text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-line-focus"
        >
          {/* «back» points to the start side under RTL (DESIGN.md §7 rule 3). */}
          <ChevronRight aria-hidden="true" className="size-16 ltr:-scale-x-100" />
          {t.back}
        </Link>
        <div className="flex flex-wrap items-center gap-16">
          <Avatar name={student.fullName} className="size-48 t-title-md" />
          <div className="flex flex-col gap-4">
            <h1 className="t-display-title text-fg-primary">{student.fullName}</h1>
            <dl className="flex flex-wrap items-center gap-x-16 gap-y-4 t-body-sm text-fg-secondary">
              <Fact label={t.group}>{student.groupName ?? ar.students.noGroup}</Fact>
              {student.role !== 'student' ? <Fact label={t.role}>{ar.students.roles[student.role]}</Fact> : null}
              <Fact label={t.joinedAt}>
                {formatHijri(student.joinedAt, hijriAdjustment)} · {formatGregorian(student.joinedAt)}
              </Fact>
            </dl>
          </div>
          <StatusChip active={student.isActive} />
        </div>
      </header>

      <Section title={t.summaryTitle}>
        {summary.ok ? <SummaryCards summary={summary.data} /> : <Failed>{t.summaryFailed}</Failed>}
      </Section>

      <div className={cn('grid gap-24', canEdit && 'lg:grid-cols-2')}>
        <Section title={t.calendarTitle}>
          {calendar.ok ? (
            <MonthCalendar
              month={month}
              days={calendar.data}
              today={today}
              weekStartsOn={student.weekStartsOn}
              hijriAdjustment={hijriAdjustment}
            />
          ) : (
            <Failed>{t.calendarFailed}</Failed>
          )}
        </Section>
        {canEdit ? <StudentEditPanel student={student} groups={groups} today={today} isSelf={isSelf} /> : null}
      </div>

      <Section title={t.logsTitle}>
        {!logs.ok ? (
          <Failed>{t.logsFailed}</Failed>
        ) : logs.data.length === 0 ? (
          <Empty>{t.logsEmpty}</Empty>
        ) : (
          <LogsTable logs={logs.data} hijriAdjustment={hijriAdjustment} />
        )}
      </Section>

      <Section title={t.attendanceTitle}>
        {!attendance.ok ? (
          <Failed>{t.attendanceFailed}</Failed>
        ) : attendance.data.length === 0 ? (
          <Empty>{t.attendanceEmpty}</Empty>
        ) : (
          <AttendanceTable rows={attendance.data} />
        )}
      </Section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt>{label}:</dt>
      <dd className="text-fg-primary">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-12">
      <h2 className="t-display-section text-fg-primary">{title}</h2>
      {children}
    </section>
  );
}

function Failed({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="t-body-md text-status-notdone">
      {children}
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-line-subtle bg-surface px-24 py-32 text-center t-body-md text-fg-secondary">
      {children}
    </p>
  );
}

function SummaryCards({ summary }: { summary: StudentSummary }) {
  const pct = (value: number | null) => (value === null ? t.none : t.pct(value));
  const cards: Array<[string, string]> = [
    [t.stats.daysLogged, String(summary.daysLogged)],
    [t.stats.completion, pct(summary.completionPct)],
    [t.stats.attendance, pct(summary.attendancePct)],
    [t.stats.longestStreak, String(summary.longestStreak)],
    [t.stats.currentStreak, String(summary.currentStreak)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-12 md:grid-cols-3 xl:grid-cols-5">
      {cards.map(([label, value]) => (
        // DESIGN.md §6 StatCard: a big number and a label that wraps rather than truncates.
        <div key={label} className="flex flex-col-reverse gap-4 rounded-xl border border-line-subtle bg-surface p-16">
          <dt className="t-body-sm text-fg-secondary">{label}</dt>
          <dd className="t-number-lg text-fg-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A day state in the logs table: the calendar's shape in small, then the word (never colour alone). */
function DayStateMark({ state }: { state: DayState }) {
  return (
    <span className="inline-flex items-center gap-8 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={cn(
          'size-12 rounded-sm',
          state === 'achieved' && 'bg-status-done-fill',
          state === 'failed' && 'cal-hatch border border-status-done-hatch',
          state === 'neutral' && 'border-2 border-status-neutral',
          state === 'missing' && 'mx-4 size-4 rounded-full bg-status-missing',
        )}
      />
      {t.state[state]}
    </span>
  );
}

function excerpt(text: string): string {
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT).trimEnd()}…` : text;
}

function LogsTable({ logs, hijriAdjustment }: { logs: LogRow[]; hijriAdjustment: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.logColumns.date}</TableHead>
          <TableHead>{t.logColumns.kind}</TableHead>
          <TableHead>{t.logColumns.state}</TableHead>
          <TableHead className="w-full">{t.logColumns.text}</TableHead>
          <TableHead>{t.logColumns.support}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={`${log.period}-${log.periodStart}`}>
            <TableCell className="whitespace-nowrap">
              <span className="flex flex-col">
                <span>{formatGregorian(log.periodStart)}</span>
                <span className="t-caption text-fg-secondary">{formatHijri(log.periodStart, hijriAdjustment)}</span>
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap">{t.period[log.period]}</TableCell>
            <TableCell>
              {log.state ? (
                <span className="flex flex-col">
                  <DayStateMark state={log.state} />
                  {log.completionPct !== null ? (
                    <span className="t-caption text-fg-secondary">{t.pct(log.completionPct)}</span>
                  ) : null}
                </span>
              ) : (
                t.weeklyLogged
              )}
            </TableCell>
            <TableCell className="min-w-240" title={log.text ?? undefined}>
              {log.text ? excerpt(log.text) : <span className="text-fg-tertiary">{t.none}</span>}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {log.supportStatus === 'none' ? (
                <span className="text-fg-tertiary">{t.none}</span>
              ) : (
                <span className={cn(log.supportStatus === 'open' ? 'text-status-notdone' : 'text-fg-secondary')}>
                  {t.supportFlag[log.supportStatus]}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.attendanceColumns.date}</TableHead>
          <TableHead className="w-full">{t.attendanceColumns.title}</TableHead>
          <TableHead>{t.attendanceColumns.status}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={`${row.date}-${i}`}>
            <TableCell className="whitespace-nowrap">{formatGregorian(row.date)}</TableCell>
            <TableCell>{row.title ?? t.untitledSession}</TableCell>
            <TableCell className="whitespace-nowrap">{t.attendanceStatus[row.status]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
