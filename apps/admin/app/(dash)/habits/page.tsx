import { todayIn } from '@awrad/domain';

import { HabitsView } from '@/components/habits/HabitsView';
import type { HabitView } from '@/lib/habits';
import { viewerTimezone } from '@/lib/supabase/attendance';
import { listHabits } from '@/lib/supabase/habits';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { hijriAdjustment } from '@/lib/supabase/students';
import { ar } from '@/messages/ar';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** a06 — F-63 (admin only: proxy.ts sends a supervisor to /): every habit by frequency, with BR-07's lifecycle. */
export default async function HabitsPage({ searchParams }: { searchParams: SearchParams }) {
  const initialTab = (await searchParams).tab === 'weekly' ? 'weekly' : 'daily';
  const profile = await getCurrentProfile();
  if (!profile) return null; // the (dash) layout already sent a signed-out visitor to /login

  let habits: HabitView[];
  let adjustment: number;
  let timezone: string;
  try {
    const supabase = await createClient();
    [habits, adjustment, timezone] = await Promise.all([
      listHabits(supabase),
      hijriAdjustment(supabase),
      viewerTimezone(supabase, profile.id),
    ]);
  } catch (error) {
    // Server log only (CI shows it through Playwright's webServer pipe); the page shows the generic message.
    console.error('habits: load failed', error);
    return (
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{ar.habits.title}</h1>
        <p role="alert" className="t-body-md text-status-notdone">
          {ar.habits.loadFailed}
        </p>
      </div>
    );
  }

  return <HabitsView habits={habits} today={todayIn(timezone)} hijriAdjustment={adjustment} initialTab={initialTab} />;
}
