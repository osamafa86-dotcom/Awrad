import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
};
const fetchProfile = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth }) }));
vi.mock('@/lib/supabase/profile', () => ({ fetchProfile: (...args: unknown[]) => fetchProfile(...args) }));
// redirect() never returns in Next; model it as a throw carrying the target.
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

import { resendCode, sendCode, signOut, verifyCode } from '@/actions/auth';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('sendCode', () => {
  it('rejects a malformed address without calling Supabase', async () => {
    expect(await sendCode(null, form({ email: 'nope' }))).toEqual({ ok: false, code: 'INVALID_EMAIL' });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('reports an address that was never invited', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { code: 'otp_disabled', message: 'Signups not allowed for otp' } });
    expect(await sendCode(null, form({ email: 'x@y.co' }))).toEqual({ ok: false, code: 'UNKNOWN_EMAIL' });
  });

  it('reports any other failure as SEND_FAILED, thrown or returned', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', message: 'rate' } });
    expect(await sendCode(null, form({ email: 'x@y.co' }))).toEqual({ ok: false, code: 'SEND_FAILED' });
    auth.signInWithOtp.mockRejectedValue(new Error('fetch failed'));
    expect(await sendCode(null, form({ email: 'x@y.co' }))).toEqual({ ok: false, code: 'SEND_FAILED' });
  });

  it('sends without creating users and continues to /verify with the email and next', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    await expect(sendCode(null, form({ email: ' Admin@Y.co ', next: '/students?g=1' }))).rejects.toThrow(
      'REDIRECT /verify?email=admin%40y.co&next=%2Fstudents%3Fg%3D1',
    );
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'admin@y.co', options: { shouldCreateUser: false } });
  });
});

describe('verifyCode', () => {
  const user = { id: 'u1' };

  it('rejects a code that is not six digits without calling Supabase', async () => {
    expect(await verifyCode(null, form({ email: 'a@b.co', token: '12a456' }))).toEqual({ ok: false, code: 'INVALID_CODE' });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('maps an expired or wrong code to INVALID_CODE and other failures to VERIFY_FAILED', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: 'otp_expired', message: 'Token has expired' } });
    expect(await verifyCode(null, form({ email: 'a@b.co', token: '123456' }))).toEqual({ ok: false, code: 'INVALID_CODE' });
    auth.verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: 'unexpected_failure', message: 'boom' } });
    expect(await verifyCode(null, form({ email: 'a@b.co', token: '123456' }))).toEqual({ ok: false, code: 'VERIFY_FAILED' });
    auth.verifyOtp.mockRejectedValue(new Error('fetch failed'));
    expect(await verifyCode(null, form({ email: 'a@b.co', token: '123456' }))).toEqual({ ok: false, code: 'VERIFY_FAILED' });
  });

  it('sends staff to a safe next', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });
    fetchProfile.mockResolvedValue({ role: 'admin', isActive: true });
    await expect(verifyCode(null, form({ email: 'a@b.co', token: '123456', next: '/reports?w=2' }))).rejects.toThrow(
      'REDIRECT /reports?w=2',
    );
  });

  it('never follows an off-site next', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });
    fetchProfile.mockResolvedValue({ role: 'admin', isActive: true });
    await expect(verifyCode(null, form({ email: 'a@b.co', token: '123456', next: '/\t/evil.example' }))).rejects.toThrow(
      /^REDIRECT \/$/,
    );
  });

  it('sends a student to /unauthorized and a supervisor away from /habits', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });
    fetchProfile.mockResolvedValue({ role: 'student', isActive: true });
    await expect(verifyCode(null, form({ email: 'a@b.co', token: '123456' }))).rejects.toThrow('REDIRECT /unauthorized');
    fetchProfile.mockResolvedValue({ role: 'supervisor', isActive: true });
    await expect(verifyCode(null, form({ email: 'a@b.co', token: '123456', next: '/habits' }))).rejects.toThrow(
      /^REDIRECT \/$/,
    );
  });
});

describe('resendCode', () => {
  it('returns ok on success and SEND_FAILED otherwise', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    expect(await resendCode('a@b.co')).toEqual({ ok: true });
    auth.signInWithOtp.mockResolvedValue({ error: { message: 'x' } });
    expect(await resendCode('a@b.co')).toEqual({ ok: false, code: 'SEND_FAILED' });
  });
});

describe('signOut', () => {
  it('goes to /login even when Supabase is unreachable', async () => {
    auth.signOut.mockRejectedValue(new Error('fetch failed'));
    await expect(signOut()).rejects.toThrow('REDIRECT /login');
  });
});

describe('authErrorText', () => {
  it('maps each failure code to its message and shows nothing otherwise', async () => {
    const { authErrorText } = await import('@/lib/auth');
    expect(authErrorText({ ok: false, code: 'UNKNOWN_EMAIL' })).toBe('هذا البريد غير مسجَّل لدينا. تواصل مع المشرف.');
    expect(authErrorText({ ok: false, code: 'INVALID_CODE' })).toBe('الرمز غير صحيح أو انتهت صلاحيته. حاول مرة أخرى.');
    expect(authErrorText({ ok: true })).toBeNull();
    expect(authErrorText(null)).toBeNull();
  });
});
