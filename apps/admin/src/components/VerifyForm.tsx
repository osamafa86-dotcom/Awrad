'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState, useTransition } from 'react';

import { resendCode, verifyCode } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RESEND_SECONDS, authErrorText, type AuthResult } from '@/lib/auth';
import { ar } from '@/messages/ar';

/** a-verify: the 6-digit code (LTR, design rule 5), resend after a countdown, change email. */
export function VerifyForm({ email, next }: { email: string; next: string | null }) {
  const [state, action, verifying] = useActionState(verifyCode, null);
  const [resent, setResent] = useState<AuthResult | null>(null);
  const [resending, startResend] = useTransition();
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [cooldown, setCooldown] = useState(0);

  // One interval per cooldown (restarted by `cooldown`), as on the mobile verify screen.
  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const resend = () => {
    if (secondsLeft > 0) return;
    setSecondsLeft(RESEND_SECONDS);
    setCooldown((c) => c + 1);
    startResend(async () => setResent(await resendCode(email)));
  };

  // The latest outcome wins: a verify attempt clears the resend notice and vice versa.
  const error = authErrorText(resent ?? state);
  const notice = resent?.ok ? ar.auth.resent : null;

  return (
    <div className="flex flex-col gap-16">
      <form action={action} onSubmit={() => setResent(null)} noValidate className="flex flex-col gap-16">
        <input type="hidden" name="email" value={email} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="flex flex-col gap-8">
          <label htmlFor="token" className="t-label-md text-fg-primary">
            {ar.auth.otpLabel}
          </label>
          <Input
            id="token"
            name="token"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            className="t-number-md tracking-[0.5em]"
            aria-invalid={error ? true : undefined}
            aria-describedby={error || notice ? 'token-message' : undefined}
          />
          {error ? (
            <p id="token-message" role="alert" className="t-body-sm text-status-notdone">
              {error}
            </p>
          ) : notice ? (
            <p id="token-message" aria-live="polite" className="t-body-sm text-fg-secondary">
              {notice}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={verifying} aria-busy={verifying}>
          {verifying ? ar.auth.verifying : ar.auth.verify}
        </Button>
      </form>
      <div className="flex flex-col items-center gap-4">
        <Button type="button" variant="secondary" size="md" disabled={secondsLeft > 0 || resending} onClick={resend}>
          {secondsLeft > 0 ? ar.auth.resendIn(secondsLeft) : ar.auth.resend}
        </Button>
        <Button asChild variant="quiet" size="md">
          <Link href={next ? `/login?${new URLSearchParams({ next })}` : '/login'}>{ar.auth.changeEmail}</Link>
        </Button>
      </div>
    </div>
  );
}
