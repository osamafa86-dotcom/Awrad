import { addDays, toHijri, todayIn } from '@awrad/domain';
import { expect, test, type Page } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { hasStack, signIn } from './helpers';
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

async function openOverviewAs(page: Page, email: string) {
  await signIn(page, email);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(grid(page)).toBeVisible();
}

test.describe('overview, signed in', () => {
  test.skip(!hasStack, 'needs a Supabase stack');

  test('an admin sees 14 day columns, each dated in Hijri and Gregorian, ending today', async ({ page }) => {
    await openOverviewAs(page, TEST_USERS.admin.email);
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
    await openOverviewAs(page, TEST_USERS.admin.email);
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
    await openOverviewAs(page, TEST_USERS.admin.email);
    const name = grid(page).getByRole('link', { name: TEST_USERS.p3.fullName, exact: true });
    await expect(name).toBeVisible();
    const box = await name.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        overflowX: style.overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        text: el.textContent,
      };
    });
    expect(box.whiteSpace).not.toBe('nowrap');
    expect(box.textOverflow).not.toBe('ellipsis');
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
    expect(box.text).toBe(TEST_USERS.p3.fullName);

    await name.click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: TEST_USERS.p3.fullName })).toBeVisible();
  });

  test('the admin may filter by every group; a supervisor only by the groups they supervise', async ({ page }) => {
    await openOverviewAs(page, TEST_USERS.admin.email);
    await page.getByLabel(t.groupFilter).click();
    await expect(page.getByRole('option', { name: OTHER_GROUP_NAME })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.context().clearCookies();
    await openOverviewAs(page, TEST_USERS.sup1.email);
    await page.getByLabel(t.groupFilter).click();
    await expect(page.getByRole('option')).toHaveText([t.allGroups, TEST_GROUP_NAME]);
    await page.getByRole('option', { name: TEST_GROUP_NAME }).click();
    await expect(page).toHaveURL(/\?group=[0-9a-f-]{36}$/);
    await expect(rowOf(page, TEST_USERS.p1.fullName)).toBeVisible();
  });

  test('on the phone the grid scrolls sideways inside its box and the name column stays in view', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'phone layout (a20)');
    await openOverviewAs(page, TEST_USERS.admin.email);
    const scroller = page.locator('[data-overview-scroll]');
    const sizes = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    // The page itself does not scroll sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // To the far end of the row (in RTL that is the physical left: negative scrollLeft in Chromium).
    const moved = await scroller.evaluate((el) => {
      el.scrollLeft = -el.scrollWidth;
      return el.scrollLeft;
    });
    expect(moved).not.toBe(0);
    const name = grid(page).getByRole('link', { name: TEST_USERS.p1.fullName, exact: true });
    await expect(name).toBeInViewport();
  });
});
