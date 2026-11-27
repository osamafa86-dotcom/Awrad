import { expect, test } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { hasStack, signIn } from './helpers';
import { serviceClient } from './seed';
import { TEST_GROUP_NAME, TEST_USERS } from './users';

// ───────────── Tier (a): signed out — runs everywhere ─────────────

test.describe('students, signed out', () => {
  test('/students redirects to the login page with next=/students', async ({ page }) => {
    await page.goto('/students');
    await expect(page).toHaveURL(/\/login\?next=%2Fstudents$/);
  });
});

// ───────────── Tier (b): signed in — needs a Supabase stack ─────────────

test.describe('students, signed in', () => {
  test.skip(!hasStack, 'needs a Supabase stack');

  /** Accounts this run invited; removed afterwards so the seed stays as it was. */
  const invited: string[] = [];

  test.afterAll(async () => {
    const db = serviceClient();
    if (!db || invited.length === 0) return;
    const listed = await db.auth.admin.listUsers({ perPage: 1000 });
    if (listed.error) throw listed.error;
    for (const user of listed.data.users) {
      if (user.email && invited.includes(user.email)) {
        const removed = await db.auth.admin.deleteUser(user.id);
        if (removed.error) throw removed.error;
      }
    }
    // Their invitations stay accepted rows pointing at nobody; drop them too.
    const cleared = await db.from('invitations').delete().in('email', invited);
    if (cleared.error) throw cleared.error;
  });

  test('an admin invites a student, who then appears in the list as active in the chosen group', async ({ page }) => {
    // Unique per run and per project, so a rerun never meets EMAIL_EXISTS.
    const email = `new-${Date.now()}-${test.info().project.name}@test.example`;
    const fullName = `طالب مدعو ${test.info().project.name}`;
    invited.push(email);

    await signIn(page, TEST_USERS.admin.email);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await page.goto('/students');
    await page.getByRole('link', { name: ar.students.invite }).click();
    await expect(page).toHaveURL(/\/students\/new$/);

    await page.getByLabel(ar.students.inviteForm.fullName).fill(fullName);
    const emailField = page.getByLabel(ar.students.inviteForm.email);
    await expect(emailField).toHaveAttribute('dir', 'ltr');
    await emailField.fill(email);
    await page.getByLabel(ar.students.inviteForm.group).click();
    await page.getByRole('option', { name: TEST_GROUP_NAME }).click();
    await page.getByRole('button', { name: ar.students.inviteForm.submit }).click();

    // The new student's page opens.
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: fullName })).toBeVisible();

    await page.goto('/students');
    const row = page.getByRole('row', { name: new RegExp(fullName) });
    await expect(row).toBeVisible();
    await expect(row.getByText(ar.students.status.active, { exact: true })).toBeVisible();
    await expect(row.getByText(TEST_GROUP_NAME, { exact: true })).toBeVisible();
  });

  test('a supervisor sees the list without the invite button', async ({ page }) => {
    await signIn(page, TEST_USERS.sup1.email);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await page.goto('/students');
    await expect(page.getByRole('heading', { level: 1, name: ar.students.title })).toBeVisible();
    await expect(page.getByRole('link', { name: TEST_USERS.p1.fullName })).toBeVisible();
    await expect(page.getByRole('link', { name: ar.students.invite })).toHaveCount(0);
  });

  test('typing a name in the search field filters the list', async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await page.goto('/students');
    await expect(page.getByRole('link', { name: TEST_USERS.sup1.fullName })).toBeVisible();
    await page.getByRole('searchbox', { name: ar.students.searchLabel }).fill(TEST_USERS.p1.fullName);
    await expect(page.getByRole('link', { name: TEST_USERS.p1.fullName })).toBeVisible();
    await expect(page.getByRole('link', { name: TEST_USERS.sup1.fullName })).toHaveCount(0);
  });
});
