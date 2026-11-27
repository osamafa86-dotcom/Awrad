'use client';

import { useActionState, useState } from 'react';

import { sendCode, type AuthFormState } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ar } from '@/messages/ar';

const initial: AuthFormState = { error: null };

/** a-login: email field (LTR, design rule 5) and «أرسل رمز الدخول». */
export function LoginForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState(sendCode, initial);
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
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'email-error' : undefined}
        />
        {state.error ? (
          <p id="email-error" role="alert" className="t-body-sm text-status-notdone">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? ar.auth.sending : ar.auth.sendCode}
      </Button>
    </form>
  );
}
