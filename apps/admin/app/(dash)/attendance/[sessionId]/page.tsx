import { notFound } from 'next/navigation';

import { AttendanceGrid } from '@/components/attendance/AttendanceGrid';
import type { Mark, Member } from '@/lib/attendance';
import type { GroupOption } from '@/lib/students';
import { getSession, listMarks, listSessionMembers, viewerTimezone } from '@/lib/supabase/attendance';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { hijriAdjustment } from '@/lib/supabase/students';
import { ar } from '@/messages/ar';

/** a03/a21 — F-62: one session's marking grid (RLS hides sessions and people outside the viewer's groups). */
export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null; // the (dash) layout already sent a signed-out visitor to /login
  const supabase = await createClient();
  const session = await getSession(supabase, sessionId);
  if (!session) notFound();

  let groups: GroupOption[];
  let members: Member[];
  let marks: Mark[];
  let adjustment: number;
  let timezone: string;
  try {
    const viewer = { id: profile.id, role: profile.role };
    let people: { groups: GroupOption[]; members: Member[] };
    [people, marks, adjustment, timezone] = await Promise.all([
      listSessionMembers(supabase, session, viewer),
      listMarks(supabase, session.id),
      hijriAdjustment(supabase),
      viewerTimezone(supabase, profile.id),
    ]);
    ({ groups, members } = people);
  } catch (error) {
    // Server log only; the page shows the generic message.
    console.error('attendance: load session grid failed', error);
    return (
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title break-words text-fg-primary">{session.title ?? ar.attendance.untitled}</h1>
        <p role="alert" className="t-body-md text-status-notdone">
          {ar.attendance.loadFailed}
        </p>
      </div>
    );
  }

  return (
    <AttendanceGrid
      // The grid's marks live in state seeded from `marks`: a different session starts from its own.
      key={session.id}
      session={session}
      groups={groups}
      members={members}
      marks={marks}
      canDelete={profile.role === 'admin'}
      timezone={timezone}
      hijriAdjustment={adjustment}
    />
  );
}
