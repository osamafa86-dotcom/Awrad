import { expect, test as setup } from '@playwright/test';

import { authFile, hasStack, signIn, type SavedRole } from './helpers';
import { TEST_USERS } from './users';

// Ruling E2E-2: one real sign-in per staff role per run; the signed-in specs reuse the saved state, so
// a run asks GoTrue for a handful of one-time codes instead of one per test. auth.spec.ts keeps its own
// sign-ins: the flow is what it tests. Without a Supabase stack this project skips and saves nothing.
setup.skip(!hasStack, 'needs a Supabase stack');

for (const role of ['admin', 'sup1'] as const satisfies readonly SavedRole[]) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await signIn(page, TEST_USERS[role].email);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await page.context().storageState({ path: authFile(role) });
  });
}
