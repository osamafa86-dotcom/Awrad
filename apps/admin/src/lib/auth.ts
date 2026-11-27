// Pure helpers for the sign-in Server Actions (the same rules as the mobile login screens).

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const OTP_PATTERN = /^\d{6}$/;
export const RESEND_SECONDS = 60;

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
