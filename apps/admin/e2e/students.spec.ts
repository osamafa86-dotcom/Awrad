import { addDays, todayIn } from '@awrad/domain';
import { expect, test } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { authFile, hasStack } from './helpers';
import { serviceClient } from './seed';
import { OTHER_GROUP_NAME, TEST_GROUP_NAME, TEST_TIMEZONE, TEST_USERS } from './users';

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

  test.describe('as the admin', () => {
    test.use({ storageState: authFile('admin') });

    test('an admin invites a student, who then appears in the list as active in the chosen group', async ({ page }) => {
      // Unique per run and per project, so a rerun never meets EMAIL_EXISTS.
      const email = `new-${Date.now()}-${test.info().project.name}@test.example`;
      const fullName = `طالب مدعو ${test.info().project.name}`;
      invited.push(email);

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
      await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/, {
        timeout: 20_000,
      });
      await expect(page.getByRole('heading', { level: 1, name: fullName })).toBeVisible();

      await page.goto('/students');
      const row = page.getByRole('row', { name: new RegExp(fullName) });
      await expect(row).toBeVisible();
      await expect(row.getByText(ar.students.status.active, { exact: true })).toBeVisible();
      await expect(row.getByText(TEST_GROUP_NAME, { exact: true })).toBeVisible();
    });

    test('typing a name in the search field filters the list', async ({ page }) => {
      await page.goto('/students');
      await expect(page.getByRole('link', { name: TEST_USERS.sup1.fullName })).toBeVisible();
      await page.getByRole('searchbox', { name: ar.students.searchLabel }).fill(TEST_USERS.p1.fullName);
      await expect(page.getByRole('link', { name: TEST_USERS.p1.fullName })).toBeVisible();
      await expect(page.getByRole('link', { name: TEST_USERS.sup1.fullName })).toHaveCount(0);
    });
  });

  test.describe('as a supervisor', () => {
    test.use({ storageState: authFile('sup1') });

    test('a supervisor sees the list without the invite button', async ({ page }) => {
      await page.goto('/students');
      await expect(page.getByRole('heading', { level: 1, name: ar.students.title })).toBeVisible();
      await expect(page.getByRole('link', { name: TEST_USERS.p1.fullName })).toBeVisible();
      await expect(page.getByRole('link', { name: ar.students.invite })).toHaveCount(0);
    });

    // Final review admin M-1: RLS is DB-tested, but these pages rely on it alone, so the boundary is asserted here
    // too — the other group's people are absent from the list, their page is «not found», and an export has none.
    test('sup1 cannot see the other group: not in the list, no page by URL, none in an export', async ({ page }) => {
      const db = serviceClient()!;
      const p2 = await db.auth.admin.listUsers({ perPage: 1000 });
      if (p2.error) throw p2.error;
      const p2Id = p2.data.users.find((user) => user.email === TEST_USERS.p2.email)?.id;
      expect(p2Id).toBeTruthy();

      await page.goto('/students');
      await expect(page.getByRole('link', { name: TEST_USERS.p1.fullName })).toBeVisible();
      await expect(page.getByRole('link', { name: TEST_USERS.p2.fullName })).toHaveCount(0);
      await expect(page.getByRole('link', { name: TEST_USERS.sup2.fullName })).toHaveCount(0);
      await expect(page.getByText(OTHER_GROUP_NAME, { exact: true })).toHaveCount(0);

      await page.goto(`/students/${p2Id}`);
      await expect(page.getByText(ar.students.detail.notFound)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: TEST_USERS.p2.fullName })).toHaveCount(0);

      const today = todayIn(TEST_TIMEZONE);
      const res = await page.request.get(`/api/export?kind=daily&from=${addDays(today, -9)}&to=${today}`);
      expect(res.status()).toBe(200);
      const csv = await res.text();
      expect(csv).toContain(TEST_USERS.p1.fullName);
      expect(csv).not.toContain(TEST_USERS.p2.fullName);
      expect(csv).not.toContain(OTHER_GROUP_NAME);
    });
  });
});
