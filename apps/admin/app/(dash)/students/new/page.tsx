import { todayIn } from '@awrad/domain';
import { redirect } from 'next/navigation';

import { InviteForm } from '@/components/students/InviteForm';
import { DEFAULT_TIMEZONE, type GroupOption } from '@/lib/students';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { listGroups } from '@/lib/supabase/students';
import { ar } from '@/messages/ar';

/** a09 — F-01: invite a student (admins only; a supervisor is sent back to the list). */
export default async function NewStudentPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'admin') redirect('/students');

  let groups: GroupOption[] = [];
  let failed = false;
  try {
    groups = await listGroups(await createClient());
  } catch (error) {
    console.error('students: load groups failed', error);
    failed = true;
  }

  return (
    <div className="flex max-w-640 flex-col gap-24">
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{ar.students.inviteForm.title}</h1>
        <p className="t-body-md text-fg-secondary">{ar.students.inviteForm.subtitle}</p>
      </div>
      {failed ? (
        <p role="alert" className="t-body-md text-status-notdone">
          {ar.students.loadFailed}
        </p>
      ) : (
        <InviteForm groups={groups} today={todayIn(DEFAULT_TIMEZONE)} />
      )}
    </div>
  );
}
