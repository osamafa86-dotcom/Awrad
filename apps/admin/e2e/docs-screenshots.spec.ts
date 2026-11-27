import path from 'node:path';

import { todayIn } from '@awrad/domain';
import { expect, test, type Page } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { authFile, hasStack } from './helpers';
import { serviceClient } from './seed';
import { TEST_GROUP_NAME, TEST_TIMEZONE, TEST_USERS } from './users';

// Ruling DOC-1: the admin manual's screenshots (docs/admin-manual.md), taken by the `docs` project on the
// seeded stack of .github/workflows/docs-screenshots.yml and saved to e2e/docs-out (git-ignored), which the
// workflow uploads as the `docs-screenshots` artifact. Not a test of behaviour: the waits only make sure each
// page has rendered its data before the shot. DOCS_SCREENSHOTS=1 turns it on, so the CI e2e job (which runs
// every project) skips it.

const OUT_DIR = path.resolve('e2e/docs-out');
const enabled = process.env.DOCS_SCREENSHOTS === '1';

/** A session made for the manual (fixture data, service role), found again by its title on later runs. */
const DOCS_SESSION_TITLE = 'درس الفقه';

/** Saves the page (the viewport, or the whole page with `fullPage`) once its web fonts have loaded. */
async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage, animations: 'disabled' });
}

/** A request card in the visible support tab, by its student's name (as support.spec.ts). */
function card(page: Page, name: string) {
  return page.getByRole('tabpanel').getByRole('article', { name, exact: true });
}

async function heading(page: Page, name: string) {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** The test group's session for the manual, created today if missing; returns its id. */
async function ensureDocsSession(): Promise<string> {
  const db = serviceClient();
  if (!db) throw new Error('needs a Supabase stack');
  const group = await db.from('groups').select('id').eq('name', TEST_GROUP_NAME).limit(1).single();
  if (group.error) throw group.error;
  const found = await db
    .from('sessions')
    .select('id')
    .eq('title', DOCS_SESSION_TITLE)
    .eq('group_id', group.data.id)
    .limit(1)
    .maybeSingle();
  if (found.error) throw found.error;
  if (found.data) return found.data.id as string;
  const created = await db
    .from('sessions')
    .insert({ title: DOCS_SESSION_TITLE, group_id: group.data.id, session_date: todayIn(TEST_TIMEZONE) })
    .select('id')
    .single();
  if (created.error) throw created.error;
  return created.data.id as string;
}

// ───────────── Signed out: the sign-in screens ─────────────

test.describe('docs screenshots, signed out', () => {
  test.skip(!enabled, 'DOCS_SCREENSHOTS=1 turns the manual screenshots on');

  test('sign-in screens', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: ar.auth.sendCode })).toBeVisible();
    await shot(page, 'login');

    await page.goto(`/verify?email=${encodeURIComponent('name@example.com')}`);
    await expect(page.getByLabel(ar.auth.otpLabel)).toBeVisible();
    await shot(page, 'verify');
  });
});

// ───────────── Signed in as the admin: every page of the manual ─────────────

test.describe('docs screenshots, signed in', () => {
  test.skip(!enabled || !hasStack, 'needs DOCS_SCREENSHOTS=1 and a Supabase stack');
  test.use({ storageState: authFile('admin') });

  test('overview', async ({ page }) => {
    await page.goto('/');
    const grid = page.getByRole('table', { name: ar.overview.gridTitle });
    await expect(grid).toBeVisible();
    await expect(grid.getByRole('link', { name: TEST_USERS.p1.fullName, exact: true })).toBeVisible();
    await shot(page, 'overview');
  });

  test('students, invitation and a student page', async ({ page }) => {
    await page.goto('/students');
    await heading(page, ar.students.title);
    const p1 = page.getByRole('link', { name: TEST_USERS.p1.fullName, exact: true });
    await expect(p1).toBeVisible();
    await shot(page, 'students');

    await p1.click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    await heading(page, TEST_USERS.p1.fullName);
    await expect(page.getByText(ar.students.detail.stats.completion, { exact: true })).toBeVisible();
    await shot(page, 'student-detail', true);

    await page.goto('/students/new');
    await heading(page, ar.students.inviteForm.title);
    await expect(page.getByLabel(ar.students.inviteForm.fullName)).toBeVisible();
    await shot(page, 'student-invite');
  });

  test('attendance list and a marked session', async ({ page }) => {
    const sessionId = await ensureDocsSession();
    const t = ar.attendance;

    await page.goto(`/attendance/${sessionId}`);
    await heading(page, DOCS_SESSION_TITLE);
    const section = page.getByRole('region', { name: TEST_GROUP_NAME });
    await section.getByRole('button', { name: t.allPresent }).click();
    await section
      .getByRole('radiogroup', { name: TEST_USERS.p3.fullName, exact: true })
      .getByRole('radio', { name: t.status.absent, exact: true })
      .check();
    await page.getByRole('button', { name: t.save, exact: true }).click();
    await expect(page.getByText(t.saved)).toBeVisible();
    await shot(page, 'attendance-session', true);

    await page.goto('/attendance');
    await heading(page, t.title);
    await expect(page.getByRole('link', { name: new RegExp(DOCS_SESSION_TITLE) })).toBeVisible();
    await shot(page, 'attendance');
  });

  test('habits and the archive-and-replace dialog', async ({ page }) => {
    const t = ar.habits;
    await page.goto('/habits');
    await heading(page, t.title);
    const daily = page.getByRole('table', { name: t.tableLabel.daily });
    await expect(daily).toBeVisible();
    await shot(page, 'habits');

    await daily.getByRole('button', { name: t.actions.replace, exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(t.replace.name)).toBeVisible();
    await shot(page, 'habits-replace');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('support requests and deletion requests', async ({ page }) => {
    const t = ar.support;
    await page.goto('/support?tab=open');
    await heading(page, t.title);
    await expect(card(page, TEST_USERS.p1.fullName).first()).toBeVisible();
    await shot(page, 'support');

    await page.goto('/support?tab=deletion');
    await heading(page, t.title);
    await expect(card(page, TEST_USERS.p4.fullName)).toBeVisible();
    await shot(page, 'support-deletion');
  });

  test('reports', async ({ page }) => {
    await page.goto('/reports');
    await heading(page, ar.reports.title);
    await expect(page.getByRole('link', { name: ar.reports.download })).toBeVisible();
    await shot(page, 'reports');
  });

  test('settings', async ({ page }) => {
    await page.goto('/settings');
    await heading(page, ar.settings.title);
    await expect(page.getByRole('table', { name: ar.settings.groups.tableLabel })).toBeVisible();
    await shot(page, 'settings', true);
  });
});
