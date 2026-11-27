// Pure helpers for the sign-in Server Actions (the same rules as the mobile login screens).

import { ar } from '@/messages/ar';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const OTP_PATTERN = /^\d{6}$/;
export const RESEND_SECONDS = 60;

/** Why a sign-in step failed. The Server Actions return these; the forms map them to ar.auth.errors. */
export type AuthErrorCode = 'INVALID_EMAIL' | 'UNKNOWN_EMAIL' | 'SEND_FAILED' | 'INVALID_CODE' | 'VERIFY_FAILED';

/** Outcome of a sign-in Server Action that did not redirect. */
export type AuthResult = { ok: true } | { ok: false; code: AuthErrorCode };

interface AuthErrorLike {
  code?: string;
  message?: string;
}

/** Supabase answers a not-yet-invited email with `otp_disabled` / "Signups not allowed". */
export function isUnknownEmailError(error: AuthErrorLike): boolean {
  return error.code === 'otp_disabled' || /signups? not allowed/i.test(error.message ?? '');
}

/** GoTrue reports a bad/stale code as otp_expired / invalid_otp-style errors; anything else is a failure. */
export function isInvalidCodeError(error: AuthErrorLike): boolean {
  if (error.code) return /invalid|expired/i.test(error.code);
  return /invalid|expired/i.test(error.message ?? '');
}

// Typed so a new AuthErrorCode without a message fails to compile.
const ERROR_TEXT: Record<AuthErrorCode, string> = ar.auth.errors;

/** The message to show for a failed action result; null when there is nothing to show. */
export function authErrorText(result: AuthResult | null): string | null {
  return result && !result.ok ? ERROR_TEXT[result.code] : null;
}
