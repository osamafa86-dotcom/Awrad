import { todayIn } from '@awrad/domain';

import { ReportForm } from '@/components/reports/ReportForm';
import type { GroupOption } from '@/lib/students';
import { viewerTimezone } from '@/lib/supabase/attendance';
import { viewerGroups } from '@/lib/supabase/overview';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { hijriAdjustment } from '@/lib/supabase/students';
import { ar } from '@/messages/ar';

/** a10 — F-65: pick a report, a period and a group, then download it as CSV from /api/export. No preview. */
export default async function ReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null; // the (dash) layout already sent a signed-out visitor to /login

  let groups: GroupOption[];
  let adjustment: number;
  let timezone: string;
  try {
    const supabase = await createClient();
    const [visible, adj, zone] = await Promise.all([
      viewerGroups(supabase, { id: profile.id, role: profile.role }),
      hijriAdjustment(supabase),
      viewerTimezone(supabase, profile.id),
    ]);
    groups = visible.map((group) => ({ id: group.id, name: group.name }));
    adjustment = adj;
    timezone = zone;
  } catch (error) {
    // Server log only (CI shows it through Playwright's webServer pipe); the page shows the generic message.
    console.error('reports: load failed', error);
    return (
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{ar.reports.title}</h1>
        <p role="alert" className="t-body-md text-status-notdone">
          {ar.reports.loadFailed}
        </p>
      </div>
    );
  }

  return <ReportForm groups={groups} today={todayIn(timezone)} hijriAdjustment={adjustment} />;
}
