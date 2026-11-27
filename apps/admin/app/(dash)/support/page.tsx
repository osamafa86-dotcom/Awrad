import { todayIn } from '@awrad/domain';

import { SupportList } from '@/components/support/SupportList';
import { SUPPORT_TABS, type DeletionRequest, type SupportRequest, type SupportTab } from '@/lib/support';
import { viewerTimezone } from '@/lib/supabase/attendance';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { hijriAdjustment } from '@/lib/supabase/students';
import { listDeletionRequests, listSupportRequests } from '@/lib/supabase/support';
import { ar } from '@/messages/ar';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * a04 — F-64: the support requests the viewer may see (RLS: the admin all, a supervisor their groups'),
 * open and handled, and for an admin the open account-deletion requests (§13).
 */
export default async function SupportPage({ searchParams }: { searchParams: SearchParams }) {
  const requested = (await searchParams).tab;
  const initialTab = SUPPORT_TABS.find((tab) => tab === requested) ?? ('open' satisfies SupportTab);
  const profile = await getCurrentProfile();
  if (!profile) return null; // the (dash) layout already sent a signed-out visitor to /login
  const isAdmin = profile.role === 'admin';

  let open: SupportRequest[];
  let handled: SupportRequest[];
  let deletions: DeletionRequest[] | null;
  let adjustment: number;
  let timezone: string;
  try {
    const supabase = await createClient();
    [open, handled, deletions, adjustment, timezone] = await Promise.all([
      listSupportRequests(supabase, 'open'),
      listSupportRequests(supabase, 'handled'),
      isAdmin ? listDeletionRequests(supabase) : null,
      hijriAdjustment(supabase),
      viewerTimezone(supabase, profile.id),
    ]);
  } catch (error) {
    // Server log only (CI shows it through Playwright's webServer pipe); the page shows the generic message.
    console.error('support: load failed', error);
    return (
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{ar.support.title}</h1>
        <p role="alert" className="t-body-md text-status-notdone">
          {ar.support.loadFailed}
        </p>
      </div>
    );
  }

  return (
    <SupportList
      open={open}
      handled={handled}
      deletions={deletions}
      today={todayIn(timezone)}
      timezone={timezone}
      hijriAdjustment={adjustment}
      initialTab={initialTab}
    />
  );
}
