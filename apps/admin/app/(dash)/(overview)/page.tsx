import { ActivityGrid } from '@/components/overview/ActivityGrid';
import { GroupFilter } from '@/components/overview/GroupFilter';
import { KpiCards } from '@/components/overview/KpiCards';
import { OverviewEmpty } from '@/components/overview/OverviewEmpty';
import { formatDayMonth, formatGregorian, formatHijriSpan } from '@/lib/format';
import { OVERVIEW_DAYS, periodDates } from '@/lib/overview';
import { parseFilters } from '@/lib/students';
import { getOverview, type Overview } from '@/lib/supabase/overview';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { hijriAdjustment } from '@/lib/supabase/students';
import { ar } from '@/messages/ar';

const t = ar.overview;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * a01 / a20 — F-60: who logs, who stopped, who asked for support. `?group=<id>` narrows to one group;
 * a supervisor only ever sees their own groups.
 */
export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const { group } = parseFilters(await searchParams);
  // The (dash) layout already sent everyone else away.
  const profile = await getCurrentProfile();
  if (!profile) return null;

  let overview: Overview;
  let adjustment: number;
  try {
    const supabase = await createClient();
    [overview, adjustment] = await Promise.all([
      getOverview(supabase, {
        groupId: group ?? 'all',
        days: OVERVIEW_DAYS,
        viewer: { id: profile.id, role: profile.role },
      }),
      hijriAdjustment(supabase),
    ]);
  } catch (error) {
    // Server log only (CI shows it through Playwright's webServer pipe); the page shows the generic message.
    console.error('overview: load failed', error);
    return (
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{t.title}</h1>
        <p role="alert" className="t-body-md text-status-notdone">
          {t.loadFailed}
        </p>
      </div>
    );
  }

  const { from, to } = overview.range;
  const selected = group && overview.groups.some((g) => g.id === group) ? group : 'all';

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-wrap items-end justify-between gap-16">
        <h1 className="t-display-title text-fg-primary">{t.title}</h1>
        <div className="flex flex-wrap items-end gap-16">
          <GroupFilter groups={overview.groups} value={selected} />
          <div className="flex flex-col">
            <p className="t-label-sm text-fg-primary">{t.periodLabel}</p>
            <p className="t-caption text-fg-secondary">
              {t.range(formatHijriSpan(from, to, adjustment), `${formatDayMonth(from)} – ${formatGregorian(to)}`)}
            </p>
          </div>
        </div>
      </div>

      <KpiCards kpis={overview.kpis} shown={overview.rows.length} />

      {overview.rows.length === 0 ? (
        <OverviewEmpty canInvite={profile.role === 'admin'} />
      ) : (
        <ActivityGrid rows={overview.rows} dates={periodDates(to, OVERVIEW_DAYS)} hijriAdjustment={adjustment} />
      )}
    </div>
  );
}
