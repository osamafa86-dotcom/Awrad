'use client';

import { useActionState, useState } from 'react';

import { sendCode } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authErrorText } from '@/lib/auth';
import { ar } from '@/messages/ar';

/** a-login: email field (LTR, design rule 5) and «أرسل رمز الدخول». */
export function LoginForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState(sendCode, null);
  const error = authErrorText(state);
  // Controlled so the address survives React's form reset after a failed attempt.
  const [email, setEmail] = useState('');

  return (
    <form action={action} noValidate className="flex flex-col gap-16">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="flex flex-col gap-8">
        <label htmlFor="email" className="t-label-md text-fg-primary">
          {ar.auth.emailLabel}
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          inputMode="email"
          placeholder={ar.auth.emailPlaceholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'email-error' : undefined}
        />
        {error ? (
          <p id="email-error" role="alert" className="t-body-sm text-status-notdone">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? ar.auth.sending : ar.auth.sendCode}
      </Button>
    </form>
  );
}
