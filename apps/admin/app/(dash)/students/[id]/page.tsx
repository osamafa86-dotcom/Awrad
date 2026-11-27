import { todayIn } from '@awrad/domain';
import { notFound } from 'next/navigation';

import { StudentDetail } from '@/components/students/StudentDetail';
import type { CalendarDay } from '@/components/students/MonthCalendar';
import { monthBounds, resolveStudentMonth } from '@/lib/month';
import { DEFAULT_TIMEZONE, LOGS_PAGE, parseLogsParam, studentHref, type GroupOption } from '@/lib/students';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import {
  getStudentProfile,
  hijriAdjustment,
  listGroups,
  loadAttendance,
  loadCalendar,
  loadLogs,
  loadSummary,
  type Loaded,
} from '@/lib/supabase/students';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * a02 — F-61: one person's summary and full record (supervisors read only; RLS hides other groups). Ruling FIN-1:
 * `?month=YYYY-MM` picks the calendar month (joined month … current month) and `?logs=N` how many logs are listed,
 * newest first, one more page per «عرض السجلّات الأقدم»; both are read on the server through the viewer's client.
 */
export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getCurrentProfile();
  const supabase = await createClient();
  const student = await getStudentProfile(supabase, id);
  if (!student) notFound();

  const canEdit = viewer?.role === 'admin';
  const today = todayIn(student.timezone ?? DEFAULT_TIMEZONE);
  const { month, prev, next } = resolveStudentMonth(query.month, today, student.joinedAt);
  const { from, to } = monthBounds(month);
  const logLimit = parseLogsParam(query.logs);
  // «عرض السجلّات الأقدم» keeps a month the viewer navigated to, and adds none otherwise.
  const shownMonth = query.month ? month : undefined;

  const [adjustment, summary, calendarRows, logs, attendance, groups] = await Promise.all([
    hijriAdjustment(supabase),
    loadSummary(supabase, id),
    loadCalendar(supabase, id, from, to),
    loadLogs(supabase, id, logLimit),
    loadAttendance(supabase, id),
    canEdit ? listGroups(supabase).catch((error: unknown): GroupOption[] => {
          console.error('students: load groups failed', error);
          return [];
        }) : Promise.resolve([]),
  ]);
  const calendar: Loaded<Map<string, CalendarDay>> = calendarRows.ok
    ? { ok: true, data: new Map(calendarRows.data.map((d) => [d.date, d])) }
    : calendarRows;

  return (
    <StudentDetail
      student={student}
      today={today}
      month={month}
      hijriAdjustment={adjustment}
      summary={summary}
      calendar={calendar}
      logs={logs}
      attendance={attendance}
      canEdit={canEdit}
      isSelf={viewer?.id === student.id}
      groups={groups}
      links={{
        prevMonth: prev ? studentHref(id, { month: prev, logs: logLimit }) : null,
        nextMonth: next ? studentHref(id, { month: next, logs: logLimit }) : null,
        olderLogs:
          logs.ok && logs.data.hasMore ? studentHref(id, { month: shownMonth, logs: logLimit + LOGS_PAGE }) : null,
      }}
    />
  );
}
