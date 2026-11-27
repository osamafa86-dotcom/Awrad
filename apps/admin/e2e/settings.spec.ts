import { expect, test, type Page } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { authFile, hasStack } from './helpers';
import { serviceClient } from './seed';
import { TEST_USERS } from './users';

const t = ar.settings;

// ───────────── Tier (a): signed out — runs everywhere ─────────────

test.describe('settings, signed out', () => {
  test('/settings redirects to the login page with next=/settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
  });
});

// ───────────── Tier (b): signed in — needs a Supabase stack ─────────────

/** Every group this file creates starts with this; the hooks remove them (they never get members). */
const GROUP_PREFIX = 'مجموعة الإعدادات';
/** The seeded backfill window (BR-05) the other specs assume; restored before and after this file. */
const SEEDED_BACKFILL_DAYS = 2;

function db() {
  const client = serviceClient();
  if (!client) throw new Error('needs a Supabase stack');
  return client;
}

async function restoreSettings() {
  const updated = await db().from('app_settings').update({ value: SEEDED_BACKFILL_DAYS }).eq('key', 'backfill_days');
  if (updated.error) throw updated.error;
}

async function removeTestGroups() {
  // group_supervisors rows go with the group (on delete cascade).
  const removed = await db().from('groups').delete().like('name', `${GROUP_PREFIX}%`);
  if (removed.error) throw removed.error;
}

async function openSettings(page: Page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
}

function groupRow(page: Page, name: string) {
  return page.getByRole('table', { name: t.groups.tableLabel }).getByRole('row').filter({ hasText: name });
}

test.describe('settings, signed in', () => {
  test.skip(!hasStack, 'needs a Supabase stack');
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    await restoreSettings();
    await removeTestGroups();
  });
  test.afterAll(async () => {
    await restoreSettings();
    await removeTestGroups();
  });

  test.describe('as a supervisor', () => {
    test.use({ storageState: authFile('sup1') });

    test('/settings is for the admin only: a supervisor is sent to the overview (GUARD-1)', async ({ page }) => {
      await page.goto('/settings');
      await expect(page).toHaveURL(/:\d+\/$/);
    });
  });

  test.describe('as the admin', () => {
    test.use({ storageState: authFile('admin') });

    test('backfill_days → 5: saved notice, kept after a reload, stored with a settings.update audit row', async ({ page }) => {
      // A minute back: the runner's clock and the database's may differ a little.
      const since = new Date(Date.now() - 60_000).toISOString();
      await openSettings(page);
      const field = page.getByLabel(t.app.fields.backfill_days.label);
      await expect(field).toHaveValue(String(SEEDED_BACKFILL_DAYS));
      await field.fill('5');
      await page.getByRole('button', { name: t.app.save }).click();
      await expect(page.getByRole('status').filter({ hasText: t.app.saved })).toBeVisible({ timeout: 20_000 });

      await page.reload();
      await expect(page.getByLabel(t.app.fields.backfill_days.label)).toHaveValue('5');

      const stored = await db().from('app_settings').select('value').eq('key', 'backfill_days').single();
      expect(stored.error).toBeNull();
      expect(stored.data?.value).toBe(5);
      const audit = await db()
        .from('audit_log')
        .select('diff')
        .eq('action', 'settings.update')
        .gte('created_at', since);
      expect(audit.error).toBeNull();
      expect(audit.data).toContainEqual({ diff: { backfill_days: { old: SEEDED_BACKFILL_DAYS, new: 5 } } });
    });

    test('a new group with Asia/Amman, Monday and sup2, then edited to remove sup2', async ({ page }, testInfo) => {
      const name = `${GROUP_PREFIX} ${Date.now()}-${testInfo.project.name}`;
      const sup2 = TEST_USERS.sup2.fullName;
      const monday = ar.dates.weekdays[1]!;
      await openSettings(page);

      await page.getByRole('button', { name: t.groups.newGroup }).click();
      let dialog = page.getByRole('dialog', { name: t.groupForm.title });
      await dialog.getByLabel(t.groupForm.name).fill(name);
      await dialog.getByLabel(t.groupForm.timezone).selectOption('Asia/Amman');
      await dialog.getByLabel(t.groupForm.weekStart).click();
      await page.getByRole('option', { name: monday, exact: true }).click();
      await dialog.getByRole('checkbox', { name: sup2, exact: true }).check();
      await dialog.getByRole('button', { name: t.groupForm.submit }).click();
      await expect(dialog).toHaveCount(0, { timeout: 20_000 });

      const row = groupRow(page, name);
      await expect(row).toContainText(sup2);
      await expect(row).toContainText('Asia/Amman');
      await expect(row).toContainText(monday);

      await row.getByRole('button', { name: t.groups.edit(name) }).click();
      dialog = page.getByRole('dialog', { name: t.groupForm.editTitle });
      const box = dialog.getByRole('checkbox', { name: sup2, exact: true });
      await expect(box).toBeChecked();
      await box.uncheck();
      await dialog.getByRole('button', { name: t.groupForm.save }).click();
      await expect(dialog).toHaveCount(0, { timeout: 20_000 });

      await expect(row).toContainText(t.groups.noSupervisors);
      await expect(row).not.toContainText(sup2);

      const stored = await db().from('groups').select('timezone, week_starts_on').eq('name', name).single();
      expect(stored.data).toEqual({ timezone: 'Asia/Amman', week_starts_on: 1 });
    });
  });
});
