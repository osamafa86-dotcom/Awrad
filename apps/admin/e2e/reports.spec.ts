import fs from 'node:fs/promises';

import { addDays, todayIn } from '@awrad/domain';
import { expect, test, type Page } from '@playwright/test';

import { ar } from '../src/messages/ar';

import { authFile, hasStack } from './helpers';
import { serviceClient } from './seed';
import { OTHER_GROUP_NAME, TEST_TIMEZONE, TEST_USERS } from './users';

const t = ar.reports;
const h = t.csv.headers;
const BOM = '\uFEFF';

// ───────────── Tier (a): signed out — runs everywhere ─────────────

test.describe('reports, signed out', () => {
  test('the page redirects to the login page, remembering where', async ({ page }) => {
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/login\?next=%2Freports$/);
  });

  test('the export endpoint answers 401 JSON instead of redirecting', async ({ request }) => {
    const res = await request.get('/api/export?kind=daily&from=2026-11-01&to=2026-11-30', { maxRedirects: 0 });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });
});

// ───────────── Tier (b): signed in — needs a Supabase stack ─────────────

/** Fields of a CSV whose every field is quoted (src/lib/csv.ts), one array per CRLF-ended line. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    }
  }
  return rows;
}

/** The CSV as rows of header → value. */
function records(rows: string[][]): Array<Record<string, string>> {
  const [headers = [], ...body] = rows;
  return body.map((cells) => Object.fromEntries(headers.map((name, i) => [name, cells[i] ?? ''])));
}

const today = todayIn(TEST_TIMEZONE);
const from = addDays(today, -9);

/** Picks the report on /reports and downloads it through «تنزيل CSV»; returns the file's text. */
async function download(page: Page, kind: 'daily' | 'weekly' | 'attendance'): Promise<string> {
  await page.goto('/reports');
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  const link = page.getByRole('link', { name: t.download });
  // why: the form is a client component; input before hydration is lost, so retry until the link shows it.
  await expect(async () => {
    if (kind !== 'daily') {
      await page.keyboard.press('Escape'); // a list left open by a failed attempt
      await page.getByLabel(t.kind).click();
      await page.getByRole('option', { name: t.kinds[kind] }).click({ timeout: 2_000 });
    }
    await page.getByLabel(t.from, { exact: true }).fill(from);
    await page.getByLabel(t.to, { exact: true }).fill(today);
    await expect(link).toHaveAttribute('href', new RegExp(`kind=${kind}&from=${from}&to=${today}`), {
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  const [file] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(file.suggestedFilename()).toBe(`awrad-${kind}-${from}_${today}.csv`);
  return fs.readFile((await file.path())!, 'utf8');
}

test.describe('reports, signed in', () => {
  test.skip(!hasStack, 'needs a Supabase stack');

  test.describe('as the admin', () => {
    test.use({ storageState: authFile('admin') });

    test('the daily CSV starts with the BOM, has the Arabic headers, both groups and the seeded day states', async ({
      page,
    }) => {
      const text = await download(page, 'daily');
      expect(text.startsWith(BOM)).toBe(true);
      const rows = parseCsv(text.slice(1));
      expect(rows[0]!.slice(0, 4)).toEqual([h.student, h.group, h.date, h.hijri]);
      expect(rows[0]!.slice(-3)).toEqual([h.dayPct, h.state, h.note]);

      const lines = records(rows);
      const p1 = lines.filter((line) => line[h.student] === TEST_USERS.p1.fullName);
      const p2 = lines.filter((line) => line[h.student] === TEST_USERS.p2.fullName);
      // Ten days each (both joined a month ago).
      expect(p1).toHaveLength(10);
      expect(p2).toHaveLength(10);
      expect(p2.every((line) => line[h.group] === OTHER_GROUP_NAME)).toBe(true);
      expect(p1.find((line) => line[h.date] === addDays(today, -5))?.[h.state]).toBe(ar.dayState.achieved);
      expect(p1.find((line) => line[h.date] === addDays(today, -6))?.[h.state]).toBe(ar.dayState.failed);
      expect(p1.find((line) => line[h.date] === addDays(today, -5))?.[h.dayPct]).toBe('100');
    });

    test('the attendance CSV has its header', async ({ page }) => {
      const text = await download(page, 'attendance');
      expect(text.startsWith(BOM)).toBe(true);
      // Rows depend on what earlier specs marked; the header is fixed.
      expect(parseCsv(text.slice(1))[0]).toEqual([
        h.student,
        h.group,
        h.sessionDate,
        h.hijriShort,
        h.sessionTitle,
        h.state,
        h.recordedBy,
      ]);
    });
  });

  test.describe('as sup1', () => {
    test.use({ storageState: authFile('sup1') });

    test('the daily CSV holds their group only', async ({ page }) => {
      const lines = records(parseCsv((await download(page, 'daily')).slice(1)));
      expect(lines.some((line) => line[h.student] === TEST_USERS.p1.fullName)).toBe(true);
      expect(lines.some((line) => line[h.student] === TEST_USERS.p2.fullName)).toBe(false);
      expect(lines.some((line) => line[h.group] === OTHER_GROUP_NAME)).toBe(false);
    });

    test('asking for the other group by id still returns none of its people (RLS, not the query)', async ({
      page,
    }) => {
      const db = serviceClient()!;
      const other = await db.from('groups').select('id').eq('name', OTHER_GROUP_NAME).limit(1).single();
      if (other.error) throw other.error;
      const res = await page.request.get(
        `/api/export?kind=daily&from=${from}&to=${today}&group=${(other.data as { id: string }).id}`,
      );
      expect(res.status()).toBe(200);
      const text = await res.text();
      expect(text.startsWith(BOM)).toBe(true);
      const rows = parseCsv(text.slice(1));
      // The header alone: sup1 may see none of the other group's people, so the group filter leaves nobody.
      expect(rows[0]?.slice(0, 4)).toEqual([h.student, h.group, h.date, h.hijri]);
      expect(records(rows)).toHaveLength(0);
    });
  });
});
