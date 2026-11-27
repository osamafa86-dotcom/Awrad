'use server';

import { parseRpcError, setAttendance } from '@awrad/supabase-client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  parseNewSession,
  parseSaveAttendance,
  type AttendanceErrorCode,
  type AttendanceResult,
  type AttendanceRowInput,
  type NewSession,
} from '@/lib/attendance';
import { isForbidden } from '@/lib/students';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';

// Actions return typed codes, never display text: the client components map them through ar.ts.
// Each checks the role for the experience; RLS and set_attendance's own checks stay the boundary.
const fail = (code: AttendanceErrorCode): AttendanceResult => ({ ok: false, code });

/** The signed-in active staff member (admin or supervisor), or null for anyone else. */
async function staff(): Promise<{ id: string; isAdmin: boolean } | null> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive || (profile.role !== 'admin' && profile.role !== 'supervisor')) return null;
  return { id: profile.id, isAdmin: profile.role === 'admin' };
}

/**
 * F-62 «مجلس جديد»: a session for one group, or shared (group_id null). sessions RLS decides: an admin
 * for anything, a supervisor for a group they supervise only. Opens the new session on success.
 */
export async function createSession(values: NewSession): Promise<AttendanceResult> {
  const me = await staff();
  if (!me) return fail('FORBIDDEN');
  const parsed = parseNewSession(values);
  if (!parsed.ok) return { ok: false, code: 'INVALID_INPUT', fields: parsed.fields };

  let sessionId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('sessions')
      .insert({ ...parsed.value, created_by: me.id })
      .select('id')
      .single();
    if (error || !data) return fail(error && isForbidden(error) ? 'FORBIDDEN' : 'CREATE_FAILED');
    sessionId = data.id;
  } catch {
    return fail('CREATE_FAILED');
  }
  revalidatePath('/attendance');
  redirect(`/attendance/${sessionId}`);
}

/** F-62 «حفظ»: the marked rows through set_attendance (BR-13), which checks the caller and each person. */
export async function saveAttendance(sessionId: string, rows: AttendanceRowInput[]): Promise<AttendanceResult> {
  if (!(await staff())) return fail('FORBIDDEN');
  const parsed = parseSaveAttendance(sessionId, rows);
  if (!parsed.ok) return fail('INVALID_INPUT');

  let saved: number;
  try {
    const supabase = await createClient();
    saved = await setAttendance(supabase, parsed.value.sessionId, parsed.value.rows);
  } catch (error) {
    const code = parseRpcError(error);
    return fail(code === 'FORBIDDEN' || code === 'INVALID_ITEM' ? code : 'SAVE_FAILED');
  }
  revalidatePath(`/attendance/${sessionId}`);
  revalidatePath('/attendance');
  // The attendance percentage and the attendance table on every marked person's page.
  revalidatePath('/students/[id]', 'page');
  return { ok: true, saved };
}

/** Deletes a session and its marks (sessions RLS: admin only). */
export async function deleteSession(sessionId: string): Promise<AttendanceResult> {
  const me = await staff();
  if (!me?.isAdmin) return fail('FORBIDDEN');
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
    if (error) return fail(isForbidden(error) ? 'FORBIDDEN' : 'DELETE_FAILED');
  } catch {
    return fail('DELETE_FAILED');
  }
  revalidatePath('/attendance');
  revalidatePath('/students/[id]', 'page');
  redirect('/attendance');
}
