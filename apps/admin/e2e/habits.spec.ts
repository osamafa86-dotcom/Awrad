import { addDays, todayIn } from '@awrad/domain';
import { expect, test, type Page } from '@playwright/test';

import { formatGregorian } from '../src/lib/format';
import { ar } from '../src/messages/ar';

import { authFile, hasStack } from './helpers';
import { serviceClient } from './seed';
import { TEST_TIMEZONE } from './users';

const t = ar.habits;

// ───────────── Tier (a): signed out — runs everywhere ─────────────

test.describe('habits, signed out', () => {
  test('/habits redirects to the login page with next=/habits', async ({ page }) => {
    await page.goto('/habits');
    await expect(page).toHaveURL(/\/login\?next=%2Fhabits$/);
  });
});

// ───────────── Tier (b): signed in — needs a Supabase stack ─────────────

/**
 * Every habit this file creates is named with this prefix (Ruling HAB-2: the spec only works on its own
 * habits), so the hooks can remove them and any leftovers of an interrupted run. They are all weekly: a
 * daily habit would change the completion of the days the overview spec reads.
 */
const PREFIX = 'e2e-عادة';

async function removeTestHabits() {
  const db = serviceClient();
  if (!db) return;
  // No logs refer to them, so the delete guard allows it; items go with their habit (on delete cascade).
  const removed = await db.from('habits').delete().like('name', `${PREFIX}%`);
  if (removed.error) throw removed.error;
}

function weeklyTable(page: Page) {
  return page.getByRole('table', { name: t.tableLabel.weekly });
}

/** The sortable <tbody> of an active weekly habit. */
function habitRow(page: Page, name: string) {
  return weeklyTable(page)
    .locator('tbody')
    .filter({ has: page.getByRole('button', { name: t.reorder.handle(name), exact: true }) });
}

/** Opens /habits on the weekly tab (`?tab=weekly`, server-rendered: no click racing hydration). */
async function openWeekly(page: Page) {
  await page.goto('/habits?tab=weekly');
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  await expect(weeklyTable(page)).toBeVisible();
}

/** «عادة جديدة» → a weekly habit; resolves once it shows in the weekly table. */
async function createWeeklyHabit(page: Page, name: string, items: string[] = []) {
  await page.getByRole('button', { name: t.newHabit }).click();
  const dialog = page.getByRole('dialog', { name: t.form.title });
  await dialog.getByLabel(t.form.name).fill(name);
  await dialog.getByLabel(t.form.target).fill('هدف تجريبي');
  await dialog.getByRole('radio', { name: t.form.frequencies.weekly }).check();
  if (items.length > 0) {
    await dialog.getByRole('radio', { name: t.form.kinds.checklist }).check();
    await dialog.getByLabel(t.form.items).fill(items.join('\n'));
  }
  await expect(dialog.getByLabel(t.form.activeFrom)).toHaveValue(todayIn(TEST_TIMEZONE));
  await dialog.getByRole('button', { name: t.form.submit }).click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole('tab', { name: new RegExp(t.tabs.weekly) })).toHaveAttribute('aria-selected', 'true');
  await expect(habitRow(page, name)).toBeVisible();
}

/** The names of the active weekly habits, in table order (from their rows' drag handles, not the item chips'). */
async function weeklyOrder(page: Page): Promise<string[]> {
  const labels = await weeklyTable(page)
    .locator('tbody > tr:first-child > td:first-child')
    .getByRole('button', { name: /^إعادة ترتيب/ })
    .evaluateAll((handles) => handles.map((h) => h.getAttribute('aria-label') ?? ''));
  return labels.map((label) => label.replace(/^إعادة ترتيب «(.*)»$/, '$1'));
}

test.describe('habits, signed in', () => {
  test.skip(!hasStack, 'needs a Supabase stack');
  // The steps build on each other: the habit created first is renamed, reordered, then replaced.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(removeTestHabits);
  test.afterAll(removeTestHabits);

  const stamp = () => `${test.info().project.name} ${Date.now()}`;
  let first = '';
  let second = '';

  test.describe('as the admin', () => {
    test.use({ storageState: authFile('admin') });

    test('a new weekly tristate habit appears in the weekly table', async ({ page }) => {
      first = `${PREFIX} أولى ${stamp()}`;
      await openWeekly(page);
      await createWeeklyHabit(page, first);
      await expect(habitRow(page, first)).toContainText(t.kind.tristate);
    });

    test('renaming in place shows the new name at once and keeps it after a reload', async ({ page }) => {
      await openWeekly(page);
      const renamed = `${first} مصحّحة`;
      await habitRow(page, first).getByRole('button', { name: first, exact: true }).click();
      const input = page.getByRole('textbox', { name: t.inline.name });
      await input.fill(renamed);
      await input.press('Enter');
      await expect(weeklyTable(page).getByRole('button', { name: renamed, exact: true })).toBeVisible();
      first = renamed;

      await openWeekly(page);
      await expect(weeklyTable(page).getByRole('button', { name: first, exact: true })).toBeVisible();
    });

    test('reordering with the keyboard (Space, ArrowUp, Space) persists after a reload', async ({ page }) => {
      second = `${PREFIX} ثانية ${stamp()}`;
      await openWeekly(page);
      await createWeeklyHabit(page, second);
      const before = await weeklyOrder(page);
      expect(before.indexOf(second)).toBe(before.indexOf(first) + 1);

      const handle = weeklyTable(page).getByRole('button', { name: t.reorder.handle(second), exact: true });
      await handle.focus();
      await expect(handle).toBeFocused();
      await page.keyboard.press('Space');
      // why: dnd-kit's keyboard sensor listens for the arrow keys only from the next tick after the pick-up;
      // an ArrowUp sent at once is dropped and the item never moves. Wait for the pick-up, then the move.
      await expect(handle).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('ArrowUp');
      const target = before.indexOf(first) + 1;
      await expect(page.getByText(t.reorder.moved(second, target, before.length), { exact: true })).toHaveCount(1);
      const saved = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/habits');
      await page.keyboard.press('Space');

      // The optimistic order (rendered on the next commit after the drop), then the server action's answer.
      await expect
        .poll(async () => {
          const moved = await weeklyOrder(page);
          return moved.indexOf(second) - moved.indexOf(first);
        })
        .toBe(-1);
      expect((await saved).ok()).toBe(true);

      await openWeekly(page);
      const after = await weeklyOrder(page);
      expect(after.indexOf(second)).toBe(after.indexOf(first) - 1);
    });

    test('«أرشفة واستبدال» archives the old habit today and starts the new one tomorrow', async ({ page }) => {
      const today = todayIn(TEST_TIMEZONE);
      const tomorrow = addDays(today, 1);
      const replacement = `${PREFIX} بديلة ${stamp()}`;
      await openWeekly(page);
      await habitRow(page, first).getByRole('button', { name: t.actions.replace }).click();

      const dialog = page.getByRole('dialog', { name: t.replace.title(first) });
      await expect(dialog.getByLabel(t.replace.name)).toHaveValue('');
      await expect(dialog.getByLabel(t.replace.target)).toBeVisible();
      await expect(dialog.getByLabel(t.replace.startDate)).toHaveValue(tomorrow);
      await dialog.getByLabel(t.replace.name).fill(replacement);
      await dialog.getByLabel(t.replace.target).fill('هدف جديد');
      await dialog.getByRole('button', { name: t.replace.submit }).click();
      await expect(dialog).toHaveCount(0, { timeout: 20_000 });

      // The new habit takes the old one's place, active from tomorrow.
      await expect(habitRow(page, replacement)).toContainText(t.startsOn(formatGregorian(tomorrow)));
      await expect(habitRow(page, first)).toHaveCount(0);

      // The old one is in «المؤرشفة», ending today.
      const archived = page.locator('details').filter({ has: page.locator('summary', { hasText: /^المؤرشفة/ }) });
      await archived.locator('summary').click();
      const oldRow = archived.getByRole('row').filter({ hasText: first });
      await expect(oldRow).toBeVisible();
      await expect(oldRow).toContainText(formatGregorian(today));
    });

    test('a checklist habit: two items, rename one, add a third', async ({ page }) => {
      const name = `${PREFIX} قائمة ${stamp()}`;
      await openWeekly(page);
      await createWeeklyHabit(page, name, ['بند أ', 'بند ب']);
      const items = page.getByRole('region', { name: `${t.items.title}: ${name}` });
      await expect(items.getByRole('button', { name: 'بند أ', exact: true })).toBeVisible();
      await expect(items.getByRole('button', { name: 'بند ب', exact: true })).toBeVisible();

      await items.getByRole('button', { name: 'بند أ', exact: true }).click();
      const input = items.getByRole('textbox', { name: t.inline.itemName });
      await input.fill('بند أ مصحّح');
      await input.press('Enter');
      await expect(items.getByRole('button', { name: 'بند أ مصحّح', exact: true })).toBeVisible();

      await items.getByRole('button', { name: t.items.add }).click();
      await items.getByRole('textbox', { name: t.items.addLabel }).fill('بند ج');
      await items.getByRole('button', { name: t.items.addSubmit }).click();
      await expect(items.getByRole('button', { name: 'بند ج', exact: true })).toBeVisible({ timeout: 20_000 });

      await openWeekly(page);
      await expect(habitRow(page, name)).toContainText(t.checklistCount(3));
    });
  });

  test.describe('as a supervisor', () => {
    test.use({ storageState: authFile('sup1') });

    test('/habits is for the admin only: a supervisor is sent to the overview (GUARD-1)', async ({ page }) => {
      await page.goto('/habits');
      await expect(page).toHaveURL(/:\d+\/$/);
    });
  });
});
