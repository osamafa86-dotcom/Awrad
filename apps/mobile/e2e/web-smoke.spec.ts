import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';

import { formatDayMonth } from '../src/lib/format';
import { ar } from '../src/messages/ar';
import { PREVIEW_WEEK_REVIEW, previewProfile } from '../src/preview/fixtures';

// Task 2.8 web smoke test, against the preview export (PREVIEW-2: fake data client, fixed "today"
// 2026-11-26, student «أحمد محمد» with a 12-day streak). Screenshots go to e2e/screenshots (git-ignored,
// uploaded by CI).

const SCREENSHOTS = path.join(__dirname, 'screenshots');
/** The fixture week (Sunday start) around the preview's today. */
const WEEK_TITLE = ar.weekly.title(formatDayMonth('2026-11-22'), formatDayMonth('2026-11-28'));

/** Collects console errors and uncaught page errors from the moment it is attached. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/**
 * Nothing sticks out sideways. RN-web's ScrollView clips its content (`overflow-x: hidden`), so the
 * document width alone proves nothing: every visible element must sit inside the viewport, and no
 * vertical scroll container may hide wider content.
 */
async function expectNoHorizontalOverflow(page: Page) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    const describe = (el: Element) =>
      `<${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? ` data-testid=${el.getAttribute('data-testid')}` : ''}> ${(el.textContent ?? '').trim().slice(0, 40)}`;
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden') continue;
      if (rect.left < -1 || rect.right > vw + 1) {
        out.push(`outside viewport [${Math.round(rect.left)}, ${Math.round(rect.right)}] of ${vw}: ${describe(el)}`);
      }
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollWidth > el.clientWidth + 1) {
        out.push(`scroll container wider than its box (${el.scrollWidth} > ${el.clientWidth}): ${describe(el)}`);
      }
    }
    return out;
  });
  expect(problems, 'content overflows sideways').toEqual([]);
}

// expo-router keeps the anchor `(tabs)` stack mounted (hidden) under a /__preview route, so every
// lookup is narrowed to the visible copy.
const visibleTestId = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

/** The element's text fits its box (nothing clipped on the inline axis). */
async function expectNotClipped(page: Page, testId: string) {
  const el = visibleTestId(page, testId);
  await expect(el).toBeVisible();
  const { scrollWidth, clientWidth } = await el.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  expect(scrollWidth, `${testId} is clipped`).toBeLessThanOrEqual(clientWidth);
}

/**
 * Route, DESIGN.md §8 frame, a piece of Arabic copy proving the screen rendered, and one fixture DATA
 * value proving the fake client's data arrived (src/preview/fixtures.ts).
 */
const SCREENS: ReadonlyArray<{ name: string; frame: string; key(p: Page): Locator; data(p: Page): Promise<void> }> = [
  {
    name: 'today',
    frame: 'm10-today-new',
    key: (p) => visibleTestId(p, 'date-header-title'),
    data: (p) => expect(p.getByLabel(ar.today.streak(12), { exact: true }).filter({ visible: true })).toBeVisible(),
  },
  {
    name: 'weekly',
    frame: 'm20-weekly',
    key: (p) => visibleTestId(p, 'week-title').filter({ hasText: WEEK_TITLE }),
    data: (p) => expect(p.getByLabel(ar.weekly.reviewLabel, { exact: true }).filter({ visible: true })).toHaveValue(PREVIEW_WEEK_REVIEW),
  },
  {
    name: 'summary',
    frame: 'm21-summary',
    key: (p) => p.getByText(ar.summary.stats.currentStreak, { exact: true }).filter({ visible: true }),
    data: (p) => expect(visibleTestId(p, 'stat-days')).toHaveAccessibleName(`${ar.summary.stats.daysLogged}: 28`),
  },
  {
    name: 'history',
    frame: 'm22-history',
    key: (p) => p.getByRole('heading', { name: ar.tabs.history }).filter({ visible: true }),
    data: (p) => expect(visibleTestId(p, 'history-row-2026-11-25')).toBeVisible(),
  },
  {
    name: 'settings',
    frame: 'm24-settings',
    key: (p) => p.getByText(ar.settings.dailyReminder, { exact: true }).filter({ visible: true }).first(),
    data: (p) =>
      expect(p.getByLabel(ar.settings.reminderTime, { exact: true }).filter({ visible: true })).toHaveValue(
        previewProfile.reminder_time?.slice(0, 5) ?? '',
      ),
  },
];

test.describe('login', () => {
  test('is Arabic (lang=ar, dir=rtl), branded, and logs no errors', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/__preview/login');
    await expect(page.getByRole('heading', { name: ar.auth.loginTitle }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(ar.app.name, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(ar.app.tagline, { exact: true }).filter({ visible: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ar');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: path.join(SCREENSHOTS, `login-${test.info().project.name.replace('mobile-', '')}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
});

for (const screen of SCREENS) {
  test(`${screen.name} (${screen.frame}) renders the fixture data without errors or overflow`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/__preview/${screen.name}`);
    await expect(screen.key(page)).toBeVisible();
    await screen.data(page);
    await expectNoHorizontalOverflow(page);
    const scheme = test.info().project.name.replace('mobile-', '');
    await page.screenshot({ path: path.join(SCREENSHOTS, `${screen.name}-${scheme}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

// Large-text check (limitation): RN-web sizes text in px, so browser font scaling cannot emulate the
// OS "larger text" setting. The pragmatic proxy is the smallest phone (320×568): nothing may scroll
// sideways and the date / week titles must wrap rather than clip. The 150% check stays manual (brief step 6).
test.describe('smallest phone', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('today: header title is not clipped', async ({ page }) => {
    await page.goto('/__preview/today');
    await expectNotClipped(page, 'date-header-title');
    await expectNoHorizontalOverflow(page);
  });

  test('weekly: week title is not clipped', async ({ page }) => {
    await page.goto('/__preview/weekly');
    await expect(visibleTestId(page, 'week-title')).toHaveText(WEEK_TITLE);
    await expectNotClipped(page, 'week-title');
    await expectNoHorizontalOverflow(page);
  });

  test('summary: stat cards fit the width (no sideways scroll)', async ({ page }) => {
    await page.goto('/__preview/summary');
    await expect(page.getByText(ar.summary.stats.currentStreak, { exact: true }).filter({ visible: true })).toBeVisible();
    for (const card of ['stat-days', 'stat-completion', 'stat-attendance']) await expectNotClipped(page, card);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('accessibility (axe)', () => {
  for (const route of ['/__preview/login', '/__preview/today']) {
    test(`${route} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading').filter({ visible: true }).first()).toBeVisible();
      if (route.endsWith('today')) await expect(visibleTestId(page, 'date-header-title')).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      for (const v of violations.filter((x) => !blocking.includes(x))) {
        console.log(`[axe ${v.impact ?? 'n/a'}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
      }
      expect(
        blocking.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} node(s), e.g. ${v.nodes[0]?.html.slice(0, 160) ?? ''})`),
      ).toEqual([]);
    });
  }
});
