'use server';

import { todayIn } from '@awrad/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  DEFAULT_TIMEZONE,
  inviteErrorCode,
  isForbidden,
  parseInviteForm,
  parseStudentUpdate,
  type StudentErrorCode,
  type StudentResult,
  type StudentUpdate,
} from '@/lib/students';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';

// Actions return typed codes, never display text: the client components map them through ar.ts.
// Each re-checks the role for the experience; RLS, is_admin() in the function and the RPC stay the boundary.
const fail = (code: StudentErrorCode): StudentResult => ({ ok: false, code });

/** The signed-in active admin's id, or null for anyone else. */
async function adminId(): Promise<string | null> {
  const profile = await getCurrentProfile();
  return profile?.role === 'admin' && profile.isActive ? profile.id : null;
}

async function isAdmin(): Promise<boolean> {
  return (await adminId()) !== null;
}

/** F-01/F-61: invite a student through the invite-user Edge Function, then open their page. */
export async function inviteStudent(_previous: StudentResult | null, form: FormData): Promise<StudentResult> {
  if (!(await isAdmin())) return fail('FORBIDDEN');
  const parsed = parseInviteForm(form, todayIn(DEFAULT_TIMEZONE));
  if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', fields: parsed.fields };

  let profileId: string;
  try {
    const supabase = await createClient();
    // The cookie client forwards the admin's JWT; the function checks is_admin() with it.
    const { data, error } = await supabase.functions.invoke<{ profile_id: string }>('invite-user', {
      body: parsed.value,
    });
    if (error || !data?.profile_id) return fail(await inviteErrorCode(error));
    profileId = data.profile_id;
  } catch {
    return fail('INVITE_FAILED');
  }
  revalidatePath('/students');
  redirect(`/students/${profileId}`);
}

/** F-61: edit name, group, joined date, tracking, and activate/deactivate (profiles RLS: admin only). */
export async function updateStudent(id: string, values: StudentUpdate): Promise<StudentResult> {
  const me = await adminId();
  if (!me) return fail('FORBIDDEN');
  // An admin must not lock themselves out (admin_delete_user refuses self-deletion for the same reason).
  if (id === me && !values.is_active) return fail('SELF_FORBIDDEN');
  const parsed = parseStudentUpdate(values);
  if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', fields: parsed.fields };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('profiles').update(parsed.value).eq('id', id);
    if (error) return fail(isForbidden(error) ? 'FORBIDDEN' : 'SAVE_FAILED');
  } catch {
    return fail('SAVE_FAILED');
  }
  revalidatePath(`/students/${id}`);
  revalidatePath('/students');
  return { ok: true };
}

/** §13: delete the account for good (admin_delete_user cascades and writes the audit row). */
export async function deleteStudent(id: string): Promise<StudentResult> {
  if (!(await isAdmin())) return fail('FORBIDDEN');
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: id });
    if (error) return fail(isForbidden(error) ? 'FORBIDDEN' : 'DELETE_FAILED');
  } catch {
    return fail('DELETE_FAILED');
  }
  revalidatePath('/students');
  redirect('/students');
}
