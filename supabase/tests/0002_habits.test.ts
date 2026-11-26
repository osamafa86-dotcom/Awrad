import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { adminDb, resetTestData } from './helpers';

let db: pg.Client;

beforeAll(async () => {
  await resetTestData();
  db = await adminDb();
});

afterAll(async () => {
  await db?.end();
});

async function activeSlugs(date: string, frequency: 'daily' | 'weekly'): Promise<string[]> {
  const result = await db.query<{ slug: string }>(
    'select slug from active_habits_on($1::date, $2::habit_frequency)',
    [date, frequency],
  );
  return result.rows.map((row) => row.slug);
}

async function itemCount(slug: string, date: string): Promise<number> {
  const result = await db.query<{ n: number }>(
    `select count(*)::int as n
     from active_items_on((select id from habits where slug = $1), $2::date)`,
    [slug, date],
  );
  return result.rows[0]!.n;
}

describe('0002_habits', () => {
  test('seed has 5 daily and 4 weekly habits in guide order', async () => {
    expect(await activeSlugs(new Date().toISOString().slice(0, 10), 'daily')).toEqual([
      'quran_wird',
      'adhkar',
      'qiyam',
      'tafsir_ibn_juzayy',
      'sahihayn',
    ]);
    expect(await activeSlugs(new Date().toISOString().slice(0, 10), 'weekly')).toEqual([
      'quran_memorization',
      'fiqh_lesson',
      'tazkiyah_hikam',
      'lesson_prep',
    ]);
  });

  test('adhkar has 13 active items, lesson_prep has 2', async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(await itemCount('adhkar', today)).toBe(13);
    expect(await itemCount('lesson_prep', today)).toBe(2);
  });

  describe('lifecycle window', () => {
    const slug = 'tmp_ended_habit';

    beforeAll(async () => {
      await db.query(
        `insert into habits (slug, name, frequency, sort_order, active_from, active_to)
         values ($1, 'عادة مؤقتة', 'daily', 99, '2026-01-01', '2026-01-31')`,
        [slug],
      );
    });

    afterAll(async () => {
      await db.query('delete from habits where slug = $1', [slug]);
    });

    test('active_habits_on excludes habit with active_to before date', async () => {
      expect(await activeSlugs('2026-02-01', 'daily')).not.toContain(slug);
    });

    test('active_habits_on includes habit on its active_to date (inclusive)', async () => {
      expect(await activeSlugs('2026-01-31', 'daily')).toContain(slug);
    });
  });

  test('habits check rejects active_to < active_from', async () => {
    await expect(
      db.query(
        `insert into habits (slug, name, frequency, active_from, active_to)
         values ('tmp_bad_window', 'x', 'daily', '2026-02-01', '2026-01-31')`,
      ),
    ).rejects.toThrow(/check/i);
  });
});
