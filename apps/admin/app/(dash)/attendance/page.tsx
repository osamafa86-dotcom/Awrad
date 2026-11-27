import { todayIn } from '@awrad/domain';

import { SessionList } from '@/components/attendance/SessionList';
import type { SessionRow } from '@/lib/attendance';
import type { GroupOption } from '@/lib/students';
import { listSessions, markableGroups, viewerTimezone } from '@/lib/supabase/attendance';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { hijriAdjustment } from '@/lib/supabase/students';
import { ar } from '@/messages/ar';

/** a03 — F-62: the sessions the viewer may see, newest first, and «مجلس جديد». */
export default async function AttendancePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null; // the (dash) layout already sent a signed-out visitor to /login
  const viewer = { id: profile.id, role: profile.role };

  let sessions: SessionRow[];
  let groups: GroupOption[];
  let adjustment: number;
  let timezone: string;
  try {
    const supabase = await createClient();
    [sessions, groups, adjustment, timezone] = await Promise.all([
      listSessions(supabase, viewer),
      markableGroups(supabase, viewer),
      hijriAdjustment(supabase),
      viewerTimezone(supabase, profile.id),
    ]);
  } catch (error) {
    // Server log only (CI shows it through Playwright's webServer pipe); the page shows the generic message.
    console.error('attendance: load failed', error);
    return (
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{ar.attendance.title}</h1>
        <p role="alert" className="t-body-md text-status-notdone">
          {ar.attendance.loadFailed}
        </p>
      </div>
    );
  }

  const isAdmin = profile.role === 'admin';
  // A supervisor without a group to supervise has nothing to create a session for.
  const create = isAdmin || groups.length > 0 ? { groups, allowShared: isAdmin, today: todayIn(timezone) } : null;
  return <SessionList sessions={sessions} create={create} hijriAdjustment={adjustment} />;
}
