'use server';

import { parseRpcError } from '@awrad/supabase-client';
import { revalidatePath } from 'next/cache';

import { isForbidden } from '@/lib/students';
import { parseHandleSupport, parseRequestId, type SupportErrorCode, type SupportResult } from '@/lib/support';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';

// Actions return typed codes, never display text: the client components map them through ar.ts.
// Each re-checks the role for the experience; handle_support_request's own checks and RLS stay the boundary.
const fail = (code: SupportErrorCode): SupportResult => ({ ok: false, code });

/** The signed-in active staff member (admin or supervisor), or null for anyone else. */
async function staff(): Promise<{ id: string; isAdmin: boolean } | null> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive || (profile.role !== 'admin' && profile.role !== 'supervisor')) return null;
  return { id: profile.id, isAdmin: profile.role === 'admin' };
}

/**
 * F-64 «تمّت المعالجة» (a05): handle_support_request checks the caller (admin, or the supervisor of the
 * student's group) and that the log still carries a request.
 */
export async function handleSupportRequest(logId: string, note: string | null): Promise<SupportResult> {
  if (!(await staff())) return fail('FORBIDDEN');
  const parsed = parseHandleSupport(logId, note);
  if (!parsed.ok) return fail('INVALID_INPUT');
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('handle_support_request', {
      p_log_id: parsed.value.logId,
      // The RPC stores an empty note as null.
      p_note: parsed.value.note ?? '',
    });
    if (error) {
      const code = parseRpcError(error);
      return fail(code === 'FORBIDDEN' || code === 'INVALID_ITEM' ? code : 'SAVE_FAILED');
    }
  } catch {
    return fail('SAVE_FAILED');
  }
  revalidatePath('/support');
  // The overview's «طلبات دعم مفتوحة» and the support flag in the student's logs.
  revalidatePath('/');
  revalidatePath('/students/[id]', 'page');
  return { ok: true };
}

/** §13 «رفض الطلب»: closes an open deletion request without deleting the account (deletion_requests RLS: admin). */
export async function dismissDeletionRequest(id: string): Promise<SupportResult> {
  const me = await staff();
  if (!me?.isAdmin) return fail('FORBIDDEN');
  const parsed = parseRequestId(id);
  if (!parsed.ok) return fail('INVALID_INPUT');
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('deletion_requests')
      .update({ handled_at: new Date().toISOString(), handled_by: me.id })
      .eq('id', parsed.value)
      .is('handled_at', null)
      .select('id');
    if (error) return fail(isForbidden(error) ? 'FORBIDDEN' : 'SAVE_FAILED');
    // Nothing updated: already handled (or removed) since the page loaded.
    if (!data || data.length === 0) return fail('INVALID_ITEM');
  } catch {
    return fail('SAVE_FAILED');
  }
  revalidatePath('/support');
  return { ok: true };
}
