import { expect, test } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { authFile, hasStack } from './helpers';
import { resetPermanentDeletionFixture, serviceClient } from './seed';
import { PERMANENT_DELETION, TEST_USERS } from './users';

// F-80 (spec §13): the four sections, in order, of docs/privacy-policy.md.
const HEADINGS = ['ما نجمعه', 'من يرى بياناتك', 'حذف حسابك', 'التواصل'];

// ───────────── Tier (a): signed out — runs everywhere ─────────────

test.describe('privacy policy, signed out', () => {
  test('/privacy opens without signing in, in Arabic RTL, with the four sections and the 30-day deadline', async ({
    page,
  }) => {
    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.locator('html[lang="ar"][dir="rtl"]')).toHaveCount(1);
    const headings = page.getByRole('heading', { level: 2 });
    await expect(headings).toHaveText(HEADINGS);
    for (const name of HEADINGS) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText(/30 يومًا/)).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('link')).toHaveAttribute('href', '/login');
  });
});

// ───────────── Tier (b): signed in — needs a Supabase stack ─────────────

const p5 = TEST_USERS[PERMANENT_DELETION.user];
const t = ar.deleteAccount;

function db() {
  const client = serviceClient();
  if (!client) throw new Error('needs a Supabase stack');
  return client;
}

async function profileId(email: string): Promise<string | undefined> {
  const listed = await db().auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  return listed.data.users.find((u) => u.email?.toLowerCase() === email)?.id;
}

/** Rows of `table` whose `column` is `id`, counted with the service role. */
async function countRows(table: 'profiles' | 'logs' | 'attendance', column: 'id' | 'user_id', id: string) {
  const { count, error } = await db().from(table).select('*', { count: 'exact', head: true }).eq(column, id);
  if (error) throw error;
  return count;
}

test.describe('privacy policy and permanent deletion, signed in', () => {
  test.skip(!hasStack, 'needs a Supabase stack');
  // Both projects (desktop, mobile) run this file and each deletes p5: every run starts with p5 re-created with
  // its log (service role; resetPermanentDeletionFixture in e2e/seed.ts) and puts it back when done.
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => resetPermanentDeletionFixture());
  test.afterAll(async () => resetPermanentDeletionFixture());
  test.use({ storageState: authFile('admin') });

  test('/privacy still renders for a signed-in admin (no redirect)', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);
  });

  test('«حذف نهائي» needs the full name typed, then removes the account, its logs and its attendance', async ({
    page,
  }) => {
    const id = await profileId(p5.email);
    expect(id).toBeTruthy();
    if (!id) return;
    expect(await countRows('logs', 'user_id', id)).toBeGreaterThan(0);

    await page.goto(`/students/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: p5.fullName })).toBeVisible();
    await page.getByRole('button', { name: ar.students.edit.delete }).click();
    const dialog = page.getByRole('dialog', { name: t.title(p5.fullName) });
    const confirm = dialog.getByRole('button', { name: t.confirm });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(t.typeName(p5.fullName)).fill(p5.fullName);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/students$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: ar.students.title })).toBeVisible();
    await expect(page.getByRole('link', { name: TEST_USERS.p1.fullName, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: p5.fullName, exact: true })).toHaveCount(0);

    expect(await countRows('profiles', 'id', id)).toBe(0);
    expect(await countRows('logs', 'user_id', id)).toBe(0);
    expect(await countRows('attendance', 'user_id', id)).toBe(0);
  });
});
