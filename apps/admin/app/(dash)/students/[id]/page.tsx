import { todayIn } from '@awrad/domain';
import { notFound } from 'next/navigation';

import { StudentDetail } from '@/components/students/StudentDetail';
import type { CalendarDay } from '@/components/students/MonthCalendar';
import { monthBounds, monthOf } from '@/lib/month';
import { DEFAULT_TIMEZONE, type GroupOption } from '@/lib/students';
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

/** a02 — F-61: one person's summary and full record (supervisors read only; RLS hides other groups). */
export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentProfile();
  const supabase = await createClient();
  const student = await getStudentProfile(supabase, id);
  if (!student) notFound();

  const canEdit = viewer?.role === 'admin';
  const today = todayIn(student.timezone ?? DEFAULT_TIMEZONE);
  const month = monthOf(today);
  const { from, to } = monthBounds(month);

  const [adjustment, summary, calendarRows, logs, attendance, groups] = await Promise.all([
    hijriAdjustment(supabase),
    loadSummary(supabase, id),
    loadCalendar(supabase, id, from, to),
    loadLogs(supabase, id),
    loadAttendance(supabase, id),
    canEdit ? listGroups(supabase).catch((): GroupOption[] => []) : Promise.resolve([]),
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
      groups={groups}
    />
  );
}
