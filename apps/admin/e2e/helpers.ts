import path from 'node:path';

import { expect, type Page } from '@playwright/test';

import { serviceClient } from './seed';

/** True when the signed-in tier (b) can run: a Supabase stack and its service-role key. */
export const hasStack = Boolean(process.env.E2E_SUPABASE_URL && process.env.E2E_SERVICE_ROLE_KEY);

/** Latest one-time code for `email`, minted with the service role (no inbox needed). */
export async function oneTimeCode(email: string): Promise<string> {
  const db = serviceClient();
  if (!db) throw new Error('needs a Supabase stack');
  // Fallback when generateLink is unavailable: read the last mail from Mailpit,
  // GET http://127.0.0.1:54324/api/v1/messages, and take the 6-digit code from its body.
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // why: GoTrue may refuse a new code within `max_frequency` (1s) of the one the form just sent.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
    if (!error && data.properties.email_otp) return data.properties.email_otp;
    lastError = error;
  }
  throw lastError ?? new Error(`no one-time code for ${email}`);
}

/** Signs in through the real OTP screens. */
export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByRole('button', { name: 'أرسل رمز الدخول' }).click();
  await expect(page).toHaveURL(/\/verify\?/);
  const code = await oneTimeCode(email);
  await page.getByLabel('رمز الدخول المكوّن من 6 أرقام').fill(code);
  await page.getByRole('button', { name: 'تأكيد الرمز' }).click();
}

/** The staff accounts the setup project signs in once per run (auth.setup.ts). */
export type SavedRole = 'admin' | 'sup1';

/**
 * Where the setup project saves a role's signed-in browser state (git-ignored). Specs load it with
 * `test.use({ storageState: authFile('admin') })` instead of signing in again (Ruling E2E-2).
 */
export function authFile(role: SavedRole): string {
  // why: Playwright runs from the admin app (pnpm --filter admin e2e, and CI's working directory).
  return path.resolve('e2e/.auth', `${role}.json`);
}
