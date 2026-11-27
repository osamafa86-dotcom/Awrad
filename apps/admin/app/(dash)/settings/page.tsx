import { AppSettingsForm } from '@/components/settings/AppSettingsForm';
import { GroupsTable } from '@/components/settings/GroupsTable';
import { supportedTimezones, type AppSettings, type GroupRow, type SupervisorOption } from '@/lib/settings';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { getAppSettings, listGroupSettings } from '@/lib/supabase/settings';
import { ar } from '@/messages/ar';

const t = ar.settings;

/**
 * a11 — F-66 (admin only: proxy.ts sends a supervisor to /): the six app settings, and the groups with their
 * zone, week start and supervisors. Writes go through update_app_settings / upsert_group (0011).
 */
export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null; // the (dash) layout already sent a signed-out visitor to /login

  let settings: AppSettings;
  let groups: GroupRow[];
  let candidates: SupervisorOption[];
  try {
    const supabase = await createClient();
    [settings, { groups, candidates }] = await Promise.all([getAppSettings(supabase), listGroupSettings(supabase)]);
  } catch (error) {
    // Server log only (CI shows it through Playwright's webServer pipe); the page shows the generic message.
    console.error('settings: load failed', error);
    return (
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{t.title}</h1>
        <p role="alert" className="t-body-md text-status-notdone">
          {t.loadFailed}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-40">
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{t.title}</h1>
        <p className="t-body-md text-fg-secondary">{t.subtitle}</p>
      </div>

      <section aria-labelledby="app-settings-title" className="flex flex-col gap-16">
        <h2 id="app-settings-title" className="t-display-section text-fg-primary">
          {t.app.title}
        </h2>
        <AppSettingsForm settings={settings} />
      </section>

      <GroupsTable rows={groups} timezones={supportedTimezones()} candidates={candidates} />
    </div>
  );
}
