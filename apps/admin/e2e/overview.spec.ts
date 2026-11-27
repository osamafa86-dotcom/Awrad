import { addDays, toHijri, todayIn } from '@awrad/domain';
import { expect, test, type Page } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { authFile, hasStack } from './helpers';
import { OTHER_GROUP_NAME, TEST_GROUP_NAME, TEST_TIMEZONE, TEST_USERS } from './users';

const t = ar.overview;

// Tier (a) has nothing to add here: auth.spec.ts already checks that `/` signed out goes to /login.

// ───────────── Tier (b): signed in — needs a Supabase stack ─────────────

function grid(page: Page) {
  return page.getByRole('table', { name: t.gridTitle });
}

/** The grid row whose name link is exactly `name`. */
function rowOf(page: Page, name: string) {
  return grid(page)
    .locator('tbody tr')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
}

async function openOverview(page: Page) {
  await page.goto('/');
  await expect(grid(page)).toBeVisible();
}

test.describe('overview, signed in', () => {
  test.skip(!hasStack, 'needs a Supabase stack');

  test.describe('as the admin', () => {
    test.use({ storageState: authFile('admin') });

    test('14 day columns, each dated in Hijri and Gregorian, ending today', async ({ page }) => {
      await openOverview(page);
      await expect(page.getByText(t.periodLabel)).toBeVisible();

      const headers = grid(page).locator('thead th[data-date]');
      await expect(headers).toHaveCount(14);
      const today = todayIn(TEST_TIMEZONE);
      const last = headers.last();
      await expect(last).toHaveAttribute('data-date', today);
      await expect(last).toHaveAttribute('data-today', 'true');
      const [, month, day] = today.split('-').map(Number);
      await expect(last.locator('[data-calendar="hijri"]')).toHaveText(String(toHijri(today).day));
      await expect(last.locator('[data-calendar="gregorian"]')).toContainText(`${day}/${month}`);
      await expect(headers.first()).toHaveAttribute('data-date', addDays(today, -13));
    });

    test('a student silent for three days carries ⚠ and «منقطعون» counts the ⚠ rows', async ({ page }) => {
      await openOverview(page);
      const today = todayIn(TEST_TIMEZONE);

      const p1 = rowOf(page, TEST_USERS.p1.fullName);
      await expect(p1.getByRole('img', { name: t.inactiveMark })).toBeVisible();
      await expect(p1.locator(`[data-date="${addDays(today, -5)}"]`)).toHaveAttribute('data-state', 'achieved');
      await expect(p1.locator(`[data-date="${addDays(today, -6)}"]`)).toHaveAttribute('data-state', 'failed');
      await expect(p1.locator(`[data-date="${addDays(today, -1)}"]`)).toHaveAttribute('data-state', 'missing');

      const p3 = rowOf(page, TEST_USERS.p3.fullName);
      await expect(p3.locator(`[data-date="${addDays(today, -1)}"]`)).toHaveAttribute('data-state', 'achieved');
      await expect(p3.getByRole('img', { name: t.inactiveMark })).toHaveCount(0);

      const flagged = await grid(page).locator('tbody tr[data-inactive="true"]').count();
      expect(flagged).toBeGreaterThan(0);
      const kpi = page.getByRole('group', { name: t.kpis.inactive });
      await expect(kpi.locator('[data-kpi-value]')).toHaveText(String(flagged));
      await expect(kpi).toHaveAttribute('data-variant', 'alert');
    });

    test('a 40+ character name wraps instead of being clipped, and opens the student page', async ({ page }) => {
      await openOverview(page);
      const name = grid(page).getByRole('link', { name: TEST_USERS.p3.fullName, exact: true });
      await expect(name).toBeVisible();
      const box = await name.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          height: el.getBoundingClientRect().height,
          lineHeight: parseFloat(style.lineHeight),
          text: el.textContent,
        };
      });
      expect(box.whiteSpace).not.toBe('nowrap');
      expect(box.textOverflow).not.toBe('ellipsis');
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
      expect(box.text).toBe(TEST_USERS.p3.fullName);
      if (test.info().project.name === 'mobile') {
        // The phone's name column is narrow: the name must take two lines or more, not run on.
        expect(box.height).toBeGreaterThanOrEqual(2 * box.lineHeight);
      }

      await name.click();
      await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
      await expect(page.getByRole('heading', { level: 1, name: TEST_USERS.p3.fullName })).toBeVisible();
    });

    test('the group filter lists every group', async ({ page }) => {
      await openOverview(page);
      await page.getByLabel(t.groupFilter).click();
      await expect(page.getByRole('option', { name: TEST_GROUP_NAME })).toBeVisible();
      await expect(page.getByRole('option', { name: OTHER_GROUP_NAME })).toBeVisible();
    });

    test('on the phone the grid scrolls sideways inside its box and the name column stays in view', async ({
      page,
    }) => {
      test.skip(test.info().project.name !== 'mobile', 'phone layout (a20)');
      await openOverview(page);
      const scroller = page.locator('[data-overview-scroll]');
      const sizes = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(sizes.scroll).toBeGreaterThan(sizes.client);
      // The page itself does not scroll sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      // The stacked KPI cards push the rows below the fold: bring p1's row up first.
      const row = rowOf(page, TEST_USERS.p1.fullName);
      await row.scrollIntoViewIfNeeded();
      const nameCell = row.locator('th');
      // The oldest day sits at the start edge, next to the names, before scrolling.
      const firstDay = row.locator('td [data-date]').first();
      const area = (await scroller.boundingBox())!;
      const before = (await firstDay.boundingBox())!;
      expect(before.x).toBeGreaterThanOrEqual(area.x - 1);
      expect(before.x + before.width).toBeLessThanOrEqual(area.x + area.width + 1);

      // To the far end of the row (in RTL that is the physical left: negative scrollLeft in Chromium).
      const moved = await scroller.evaluate((el) => {
        el.scrollLeft = -el.scrollWidth;
        return el.scrollLeft;
      });
      expect(moved).not.toBe(0);

      const name = (await nameCell.boundingBox())!;
      expect(name.x).toBeGreaterThanOrEqual(area.x - 1);
      expect(name.x + name.width).toBeLessThanOrEqual(area.x + area.width + 1);
      await expect(row.getByRole('link', { name: TEST_USERS.p1.fullName, exact: true })).toBeVisible();
      // …while the day that was at the start edge has scrolled out past it.
      const after = (await firstDay.boundingBox())!;
      expect(after.x).toBeGreaterThanOrEqual(area.x + area.width - 1);
    });
  });

  test.describe('as a supervisor', () => {
    test.use({ storageState: authFile('sup1') });

    test('the group filter offers only the supervised group', async ({ page }) => {
      await openOverview(page);
      await page.getByLabel(t.groupFilter).click();
      await expect(page.getByRole('option')).toHaveText([t.allGroups, TEST_GROUP_NAME]);
      await page.getByRole('option', { name: TEST_GROUP_NAME }).click();
      await expect(page).toHaveURL(/\?group=[0-9a-f-]{36}$/);
      await expect(rowOf(page, TEST_USERS.p1.fullName)).toBeVisible();
    });
  });
});
