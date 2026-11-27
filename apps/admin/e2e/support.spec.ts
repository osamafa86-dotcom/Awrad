import { addDays, toHijri, todayIn, weekStartFor } from '@awrad/domain';
import { expect, test, type Page } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { authFile, hasStack } from './helpers';
import { resetSupportFixtures, serviceClient } from './seed';
import { DELETION_REQUESTER, SEEDED_SUPPORT, TEST_GROUP_NAME, TEST_TIMEZONE, TEST_USERS } from './users';

const t = ar.support;

// ───────────── Tier (a): signed out — runs everywhere ─────────────

test.describe('support, signed out', () => {
  test('/support redirects to the login page with next=/support', async ({ page }) => {
    await page.goto('/support');
    await expect(page).toHaveURL(/\/login\?next=%2Fsupport$/);
  });
});

// ───────────── Tier (b): signed in — needs a Supabase stack ─────────────

/** «26 نوفمبر 2026», as the dashboard writes a `YYYY-MM-DD` day. */
function gregorian(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return ar.dates.gregorian(y ?? 0, m ?? 1, d ?? 1);
}

const p1 = TEST_USERS[SEEDED_SUPPORT.user];
const p4 = TEST_USERS[DELETION_REQUESTER];

function tab(page: Page, name: string) {
  return page.getByRole('tab', { name: new RegExp(name) });
}

/** A request card in the visible tab, by its student's name. */
function card(page: Page, name: string) {
  return page.getByRole('tabpanel').getByRole('article', { name, exact: true });
}

/** Opens /support on a tab (`?tab=`, server-rendered: no click racing hydration). */
async function openSupport(page: Page, which: 'open' | 'handled' | 'deletion' = 'open') {
  await page.goto(`/support?tab=${which}`);
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  await expect(tab(page, t.tabs[which])).toHaveAttribute('aria-selected', 'true');
}

/**
 * p1's seeded request (this week's log): a stack kept across weeks may also hold earlier weeks' requests of
 * p1, so the card is told apart by its week.
 */
function p1Card(page: Page) {
  const week = weekStartFor(todayIn(TEST_TIMEZONE), 0);
  return card(page, p1.fullName).filter({ hasText: t.week(toHijri(week).formatted, gregorian(week)) });
}

async function profileId(email: string): Promise<string | undefined> {
  const db = serviceClient();
  if (!db) throw new Error('needs a Supabase stack');
  const listed = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  return listed.data.users.find((u) => u.email?.toLowerCase() === email)?.id;
}

test.describe('support, signed in', () => {
  test.skip(!hasStack, 'needs a Supabase stack');
  // Both projects (desktop, mobile) run this file and each handles p1's request and deletes p4: every run of
  // it starts from the seeded state again — p1's request reopened, p4 re-created with an open request
  // (service role; resetSupportFixtures in e2e/seed.ts) — and puts it back when done.
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => resetSupportFixtures());
  test.afterAll(async () => resetSupportFixtures());

  test.describe('as the admin', () => {
    test.use({ storageState: authFile('admin') });

    test("p1's request shows in «المفتوحة» with the name, the group, the week and both texts", async ({ page }) => {
      await openSupport(page);
      const item = p1Card(page);
      await expect(item).toBeVisible();
      await expect(item.getByRole('link', { name: p1.fullName, exact: true })).toHaveAttribute(
        'href',
        /\/students\/[0-9a-f-]{36}$/,
      );
      await expect(item.getByText(TEST_GROUP_NAME, { exact: true })).toBeVisible();
      // The week: its first day in Hijri and in Gregorian (week_starts_on of the test group = Sunday).
      const week = weekStartFor(todayIn(TEST_TIMEZONE), 0);
      await expect(item.getByText(t.week(toHijri(week).formatted, gregorian(week)), { exact: true })).toBeVisible();
      await expect(item.getByText(SEEDED_SUPPORT.review, { exact: true })).toBeVisible();
      await expect(item.getByText(SEEDED_SUPPORT.request, { exact: true })).toBeVisible();
    });

    test('«تمّت المعالجة» with a note moves it from «المفتوحة» to «المعالَجة», with the note', async ({ page }) => {
      const note = 'تواصلتُ معه هاتفيًا';
      await openSupport(page);
      await p1Card(page).getByRole('button', { name: t.handle.open }).click();
      const dialog = page.getByRole('dialog', { name: t.handle.title });
      await expect(dialog.getByText(SEEDED_SUPPORT.request, { exact: true })).toBeVisible();
      await dialog.getByLabel(t.handle.note).fill(note);
      await dialog.getByRole('button', { name: t.handle.submit }).click();
      await expect(dialog).toHaveCount(0, { timeout: 20_000 });
      await expect(p1Card(page)).toHaveCount(0);

      await tab(page, t.tabs.handled).click();
      const item = p1Card(page);
      await expect(item.getByText(SEEDED_SUPPORT.request, { exact: true })).toBeVisible();
      await expect(item.getByText(note, { exact: true })).toBeVisible();
      await expect(item.getByText(t.handledBy(TEST_USERS.admin.fullName, gregorian(todayIn(TEST_TIMEZONE))))).toBeVisible();
    });

    test('«حذف نهائي» on p4\'s request deletes the account after a confirmation naming them', async ({ page }) => {
      const id = await profileId(p4.email);
      expect(id).toBeTruthy();
      await openSupport(page, 'deletion');
      const item = card(page, p4.fullName);
      await expect(item).toBeVisible();
      // Requested today: the deadline is 30 days on, not passed.
      await expect(item.getByText(t.deletion.deadline(gregorian(addDays(todayIn(TEST_TIMEZONE), 30))))).toBeVisible();
      await expect(item.getByText(t.deletion.overdue, { exact: true })).toHaveCount(0);

      await item.getByRole('button', { name: t.deletion.delete }).click();
      const dialog = page.getByRole('dialog', { name: t.deletion.confirmTitle(p4.fullName) });
      await dialog.getByRole('button', { name: t.deletion.confirm }).click();
      await expect(dialog).toHaveCount(0, { timeout: 20_000 });
      await expect(card(page, p4.fullName)).toHaveCount(0);

      await page.goto(`/students/${id}`);
      await expect(page.getByText(ar.students.detail.notFound)).toBeVisible();
      await page.goto('/students');
      await expect(page.getByRole('heading', { level: 1, name: ar.students.title })).toBeVisible();
      await expect(page.getByRole('link', { name: p1.fullName, exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: p4.fullName, exact: true })).toHaveCount(0);
    });
  });

  test.describe('as the other group\'s supervisor', () => {
    test.use({ storageState: authFile('sup2') });

    test('sees no request from p1 and no deletion tab', async ({ page }) => {
      await openSupport(page);
      await expect(page.getByRole('tab')).toHaveCount(2);
      await expect(tab(page, t.tabs.deletion)).toHaveCount(0);
      await expect(page.getByRole('article', { name: p1.fullName, exact: true })).toHaveCount(0);
      await tab(page, t.tabs.handled).click();
      await expect(page.getByRole('article', { name: p1.fullName, exact: true })).toHaveCount(0);
    });
  });
});
