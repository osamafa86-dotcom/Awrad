import { expect, test, type Page } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { signIn } from './helpers';
import { TEST_USERS } from './users';

const SECTIONS = ['نظرة عامة', 'الطلاب', 'الحضور', 'طلبات الدعم', 'العادات', 'التقارير', 'الإعدادات'];

// ───────────── Tier (a): signed out — runs everywhere ─────────────

test.describe('signed out', () => {
  test('the overview redirects to the login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test('the document is Arabic with dir=rtl', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html[lang="ar"][dir="rtl"]')).toHaveCount(1);
  });

  test('the login form shows the brand and an LTR email field', async ({ page }) => {
    await page.goto('/login');
    // Scoped to <main>: Next's route announcer (role=alert) can repeat page text after a client navigation.
    const main = page.getByRole('main');
    await expect(main.getByText(ar.app.name, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
    await expect(main.getByText(ar.app.tagline)).toBeVisible();
    const email = page.getByLabel('البريد الإلكتروني');
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('button', { name: 'أرسل رمز الدخول' })).toBeVisible();
  });

  test('the token fonts resolve to the loaded Markazi Text and IBM Plex Sans Arabic', async ({ page }) => {
    await page.goto('/login');
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      const style = getComputedStyle(document.documentElement);
      const first = (stack: string) => stack.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
      const ui = style.getPropertyValue('--font-ui');
      const display = style.getPropertyValue('--font-display');
      const loaded = (family: string) =>
        [...document.fonts].some((face) => face.family.replace(/^['"]|['"]$/g, '') === family && face.status === 'loaded');
      return { ui, display, uiLoaded: loaded(first(ui)), displayLoaded: loaded(first(display)) };
    });
    expect(fonts.ui).toContain('IBM Plex');
    expect(fonts.display).toContain('Markazi');
    // The first family in each stack is the self-hosted next/font face, and it has actually loaded.
    expect(fonts.uiLoaded).toBe(true);
    expect(fonts.displayLoaded).toBe(true);
  });

  test('the theme follows the system colour scheme (D20)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('/unauthorized redirects to the login page', async ({ page }) => {
    await page.goto('/unauthorized');
    await expect(page).toHaveURL(/\/login\?next=%2Funauthorized$/);
  });
});

// ───────────── Tier (b): signed in — needs a Supabase stack ─────────────

/** On the phone the sidebar lives in a drawer: it is hidden until the header button opens it. */
async function openSidebar(page: Page) {
  if (test.info().project.name === 'mobile') {
    await expect(page.getByRole('navigation', { name: 'أقسام اللوحة' })).toBeHidden();
    await page.getByRole('button', { name: 'فتح القائمة' }).click();
  }
  const nav = page.getByRole('navigation', { name: 'أقسام اللوحة' });
  await expect(nav).toBeVisible();
  return nav;
}

test.describe('signed in', () => {
  test.skip(!process.env.E2E_SUPABASE_URL || !process.env.E2E_SERVICE_ROLE_KEY, 'needs a Supabase stack');

  test('a student is turned away to /unauthorized', async ({ page }) => {
    await signIn(page, TEST_USERS.p1.email);
    await expect(page).toHaveURL(/\/unauthorized$/);
    // A heading, not bare text: after the client navigation Next's route announcer repeats the title.
    await expect(page.getByRole('heading', { name: ar.unauthorized.staffOnlyTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: 'تسجيل الخروج' })).toBeVisible();
  });

  test('an admin sees the sidebar with the seven sections', async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    const nav = await openSidebar(page);
    await expect(nav.getByRole('link')).toHaveText(SECTIONS);
    await expect(nav.getByRole('link', { name: 'نظرة عامة' })).toHaveAttribute('aria-current', 'page');
  });

  test('a supervisor does not see habits or settings', async ({ page }) => {
    await signIn(page, TEST_USERS.sup1.email);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    const nav = await openSidebar(page);
    await expect(nav.getByRole('link')).toHaveText(['نظرة عامة', 'الطلاب', 'الحضور', 'طلبات الدعم', 'التقارير']);
    await expect(nav.getByRole('link', { name: 'العادات' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'الإعدادات' })).toHaveCount(0);
  });
});
