import { todayIn } from '@awrad/domain';
import { expect, test, type Page } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { authFile, hasStack } from './helpers';
import { serviceClient } from './seed';
import { OTHER_GROUP_NAME, TEST_GROUP_NAME, TEST_TIMEZONE, TEST_USERS } from './users';

const t = ar.attendance;

// ───────────── Tier (a): signed out — runs everywhere ─────────────

test.describe('attendance, signed out', () => {
  test('/attendance redirects to the login page with next=/attendance', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page).toHaveURL(/\/login\?next=%2Fattendance$/);
  });
});

// ───────────── Tier (b): signed in — needs a Supabase stack ─────────────

/** Every session this file creates starts with this, so the hooks can remove them (and leftovers of an interrupted run). */
const TITLE_PREFIX = 'e2e-مجلس';

async function removeTestSessions() {
  const db = serviceClient();
  if (!db) return;
  // Attendance rows go with their session (on delete cascade).
  const removed = await db.from('sessions').delete().like('title', `${TITLE_PREFIX}%`);
  if (removed.error) throw removed.error;
}

async function profileId(email: string): Promise<string> {
  const db = serviceClient();
  if (!db) throw new Error('needs a Supabase stack');
  const listed = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  const user = listed.data.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) throw new Error(`no seeded user ${email}`);
  return user.id;
}

/** Opens «مجلس جديد», fills it and submits; resolves on the new session's page. */
async function createSession(page: Page, title: string, group: string) {
  await page.goto('/attendance');
  await page.getByRole('button', { name: t.newSession }).click();
  const dialog = page.getByRole('dialog', { name: t.form.title });
  await expect(dialog.getByLabel(t.form.date)).toHaveValue(todayIn(TEST_TIMEZONE));
  await dialog.getByLabel(t.form.sessionTitle).fill(title);
  await dialog.getByLabel(t.form.group).click();
  await page.getByRole('option', { name: group, exact: true }).click();
  await dialog.getByRole('button', { name: t.form.submit }).click();
  await expect(page).toHaveURL(/\/attendance\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

function section(page: Page, groupName: string) {
  return page.getByRole('region', { name: groupName });
}

function mark(page: Page, groupName: string, person: string, status: string) {
  return section(page, groupName)
    .getByRole('radiogroup', { name: person, exact: true })
    .getByRole('radio', { name: status, exact: true });
}

/** The «نسبة الحضور» card on a student's page. */
async function attendanceKpi(page: Page, email: string) {
  await page.goto(`/students/${await profileId(email)}`);
  return page
    .locator('dl > div')
    .filter({ has: page.getByText(ar.students.detail.stats.attendance, { exact: true }) })
    .locator('dd');
}

test.describe('attendance, signed in', () => {
  test.skip(!hasStack, 'needs a Supabase stack');
  // The steps build on each other: the shared session the admin opens is the one sup2 marks.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(removeTestSessions);
  test.afterAll(removeTestSessions);

  const run = () => `${TITLE_PREFIX} ${test.info().project.name} ${Date.now()}`;
  let groupTitle = '';
  let sharedUrl = '';

  test.describe('as the admin', () => {
    test.use({ storageState: authFile('admin') });

    // First in the file: no other session exists yet, so the percentages below come from this one alone.
    test('a group session lists only that group; «الكل حاضر», one absent, save → 0% and 100%', async ({ page }) => {
      groupTitle = run();
      await createSession(page, groupTitle, TEST_GROUP_NAME);

      await expect(section(page, TEST_GROUP_NAME)).toBeVisible();
      await expect(section(page, OTHER_GROUP_NAME)).toHaveCount(0);
      for (const person of [TEST_USERS.p1, TEST_USERS.p3, TEST_USERS.sup1]) {
        await expect(section(page, TEST_GROUP_NAME).getByRole('radiogroup', { name: person.fullName, exact: true })).toBeVisible();
      }
      for (const person of [TEST_USERS.p2, TEST_USERS.sup2]) {
        await expect(page.getByRole('radiogroup', { name: person.fullName, exact: true })).toHaveCount(0);
      }

      await section(page, TEST_GROUP_NAME).getByRole('button', { name: t.allPresent }).click();
      await expect(mark(page, TEST_GROUP_NAME, TEST_USERS.p3.fullName, t.status.present)).toBeChecked();
      await mark(page, TEST_GROUP_NAME, TEST_USERS.p1.fullName, t.status.absent).check();
      await page.getByRole('button', { name: t.save, exact: true }).click();
      await expect(page.getByText(t.saved)).toBeVisible();

      await expect(await attendanceKpi(page, TEST_USERS.p1.email)).toHaveText(ar.students.detail.pct(0));
      await expect(await attendanceKpi(page, TEST_USERS.p3.email)).toHaveText(ar.students.detail.pct(100));
    });
  });

  test.describe('as the other group supervisor', () => {
    test.use({ storageState: authFile('sup2') });

    test('the list shows no session of a group sup2 does not supervise', async ({ page }) => {
      await page.goto('/attendance');
      await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
      await expect(page.getByRole('link', { name: new RegExp(groupTitle) })).toHaveCount(0);
      await expect(page.getByRole('link', { name: new RegExp(TEST_GROUP_NAME) })).toHaveCount(0);
    });
  });

  test.describe('as the admin, a shared session', () => {
    test.use({ storageState: authFile('admin') });

    test('a session for every group shows one section per group', async ({ page }) => {
      await createSession(page, run(), t.allGroups);
      sharedUrl = page.url();
      await expect(section(page, TEST_GROUP_NAME)).toBeVisible();
      await expect(section(page, OTHER_GROUP_NAME)).toBeVisible();
    });
  });

  test.describe('as the other group supervisor, the shared session', () => {
    test.use({ storageState: authFile('sup2') });

    test('sup2 sees only the supervised group section, marks p2 present and saves', async ({ page }) => {
      expect(sharedUrl).not.toBe('');
      await page.goto(sharedUrl);
      await expect(section(page, OTHER_GROUP_NAME)).toBeVisible();
      await expect(section(page, TEST_GROUP_NAME)).toHaveCount(0);
      await expect(page.getByRole('radiogroup', { name: TEST_USERS.p1.fullName, exact: true })).toHaveCount(0);

      await mark(page, OTHER_GROUP_NAME, TEST_USERS.p2.fullName, t.status.present).check();
      await page.getByRole('button', { name: t.save, exact: true }).click();
      await expect(page.getByText(t.saved)).toBeVisible();
      await expect(mark(page, OTHER_GROUP_NAME, TEST_USERS.p2.fullName, t.status.present)).toBeChecked();
    });
  });
});
