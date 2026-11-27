'use server';

import { redirect } from 'next/navigation';

import { resolveAccess, safeNext } from '@/lib/access';
import { EMAIL_PATTERN, OTP_PATTERN, isInvalidCodeError, isUnknownEmailError } from '@/lib/auth';
import { fetchProfile, type CurrentProfile } from '@/lib/supabase/profile';
import { createClient } from '@/lib/supabase/server';
import { ar } from '@/messages/ar';

export interface AuthFormState {
  error: string | null;
  notice?: string | null;
}

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/** Email OTP, step 1: send a code to an invited address, then continue to /verify. */
export async function sendCode(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = field(form, 'email').toLowerCase();
  const next = field(form, 'next');
  if (!EMAIL_PATTERN.test(email)) return { error: ar.auth.invalidEmail };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // Accounts are created by invitation only: an unknown email must not self-register.
      options: { shouldCreateUser: false },
    });
    if (error) return { error: isUnknownEmailError(error) ? ar.auth.unknownEmail : ar.auth.sendFailed };
  } catch {
    return { error: ar.auth.sendFailed };
  }
  const query = new URLSearchParams({ email });
  if (next) query.set('next', next);
  redirect(`/verify?${query}`);
}

/** Email OTP, step 2: exchange the 6-digit code for a session cookie, then go where the user was headed. */
export async function verifyCode(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = field(form, 'email').toLowerCase();
  const token = field(form, 'token');
  if (!OTP_PATTERN.test(token)) return { error: ar.auth.invalidCode };
  let profile: CurrentProfile | null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.user) {
      return { error: error && isInvalidCodeError(error) ? ar.auth.invalidCode : ar.auth.verifyFailed };
    }
    profile = await fetchProfile(supabase, data.user.id);
  } catch {
    return { error: ar.auth.verifyFailed };
  }
  // why: a Server Action's redirect renders its target in the same request, without proxy.ts, so the
  // guard is applied here too: a student or an inactive account lands on /unauthorized, not on "/".
  const target = safeNext(field(form, 'next'));
  const access = resolveAccess({ pathname: target.split(/[?#]/)[0] ?? '/', signedIn: true, profile });
  redirect(access.kind === 'redirect' ? access.to : target);
}

/** Sends a fresh code to the same address (the verify page's countdown limits how often). */
export async function resendCode(email: string): Promise<AuthFormState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    return error ? { error: ar.auth.sendFailed } : { error: null, notice: ar.auth.resent };
  } catch {
    return { error: ar.auth.sendFailed };
  }
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Signing out of an unreachable server still leaves this browser; go to the login page anyway.
  }
  redirect('/login');
}
