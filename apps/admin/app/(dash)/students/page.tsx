import { StudentsTable } from '@/components/students/StudentsTable';
import { parseFilters, type GroupOption, type StudentRow } from '@/lib/students';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { hijriAdjustment, listGroups, listStudents, supervisedGroupIds } from '@/lib/supabase/students';
import { ar } from '@/messages/ar';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** a08 — F-61: everyone the viewer may follow (RLS scopes a supervisor to their groups). */
export default async function StudentsPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(await searchParams);
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === 'admin';

  let rows: StudentRow[];
  let groups: GroupOption[];
  let adjustment: number;
  try {
    const supabase = await createClient();
    [rows, groups, adjustment] = await Promise.all([
      listStudents(supabase, filters),
      listGroups(supabase),
      hijriAdjustment(supabase),
    ]);
    if (!isAdmin && profile) {
      const supervised = await supervisedGroupIds(supabase, profile.id);
      groups = groups.filter((group) => supervised.has(group.id));
    }
  } catch (error) {
    // Server log only (CI shows it through Playwright's webServer pipe); the page shows the generic message.
    console.error('students: load failed', error);
    return (
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{ar.students.title}</h1>
        <p role="alert" className="t-body-md text-status-notdone">
          {ar.students.loadFailed}
        </p>
      </div>
    );
  }

  return (
    <StudentsTable rows={rows} groups={groups} canInvite={isAdmin} filters={filters} hijriAdjustment={adjustment} />
  );
}
