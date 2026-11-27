// Fixture data for the jest suites and the dev-only preview mode (PREVIEW-2). It mirrors
// supabase/seed.sql; habit names and people are data, allowed in fixtures (AGENTS.md §3). Fictional names only.
import { addDays, type EntryStatus, type HabitDef, type HabitItemDef } from '@awrad/domain';

import type { FakeDb, FakeLogRow } from './fakeSupabase';

const id = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const ADHKAR_ITEMS = [
  'أذكار الصباح',
  'أذكار المساء',
  'سبحان الله ×30',
  'الحمد لله ×30',
  'لا إله إلا الله ×30',
  'الله أكبر ×30',
  'سبحان الله وبحمده ×30',
  'سبحان الله العظيم ×30',
  'سبحان الله العظيم وبحمده ×30',
  'الاستغفار ×30',
  'الحوقلة ×30',
  'الصلاة على النبي ﷺ ×30',
  'أذكار الصلوات',
];

const items: HabitItemDef[] = ADHKAR_ITEMS.map((name, i) => ({
  id: id(String(101 + i)),
  name,
  sortOrder: i + 1,
  activeFrom: '2020-01-01',
  activeTo: null,
}));

const base = { frequency: 'daily' as const, activeFrom: '2020-01-01', activeTo: null };

export const quran: HabitDef = {
  ...base,
  id: id('a1'),
  slug: 'quran_wird',
  name: 'قراءة ورد القرآن',
  targetText: 'ست أرباع يوميًا',
  kind: 'tristate',
  sortOrder: 1,
  items: [],
};
export const adhkar: HabitDef = {
  ...base,
  id: id('a2'),
  slug: 'adhkar',
  name: 'ورد الأذكار',
  targetText: '13 بندًا، كلٌّ على حدة',
  kind: 'checklist',
  sortOrder: 2,
  items,
};
export const qiyam: HabitDef = {
  ...base,
  id: id('a3'),
  slug: 'qiyam',
  name: 'ورد القيام',
  targetText: 'خمس ركعات على الأقل',
  kind: 'tristate',
  sortOrder: 3,
  items: [],
};
export const tafsir: HabitDef = {
  ...base,
  id: id('a4'),
  slug: 'tafsir_ibn_juzayy',
  name: 'تفسير ابن جُزَي',
  targetText: 'ست صفحات يوميًا',
  kind: 'tristate',
  sortOrder: 4,
  items: [],
};
export const sahihayn: HabitDef = {
  ...base,
  id: id('a5'),
  slug: 'sahihayn',
  name: 'الجمع بين الصحيحين',
  targetText: 'خمس عشرة صفحة يوميًا',
  kind: 'tristate',
  sortOrder: 5,
  items: [],
};

/** The five seeded daily habits, in sort order. */
export const dailyHabits: HabitDef[] = [quran, adhkar, qiyam, tafsir, sahihayn];
export const tristateHabits: HabitDef[] = dailyHabits.filter((h) => h.kind === 'tristate');


const weeklyBase = { frequency: 'weekly' as const, activeFrom: '2020-01-01', activeTo: null };
const weeklyTristate = (suffix: string, slug: string, name: string, sortOrder: number): HabitDef => ({
  ...weeklyBase,
  id: id(suffix),
  slug,
  name,
  targetText: null,
  kind: 'tristate',
  sortOrder,
  items: [],
});
export const memorization = weeklyTristate('a6', 'quran_memorization', 'حفظ أو مراجعة حفظ القرآن', 1);
export const fiqh = weeklyTristate('a7', 'fiqh_lesson', 'درس الفقه', 2);
export const tazkiyah = weeklyTristate('a8', 'tazkiyah_hikam', 'الاستماع لدروس التزكية (الحكم العطائية)', 3);
export const lessonPrep: HabitDef = {
  ...weeklyBase,
  id: id('a9'),
  slug: 'lesson_prep',
  name: 'تحضير الدرس الأسبوعي',
  targetText: 'بندان: قراءة المتن المعيّن، سماع الشرح المعيّن',
  kind: 'checklist',
  sortOrder: 4,
  items: [
    { id: id('201'), name: 'قراءة المتن المعيّن', sortOrder: 1, activeFrom: '2020-01-01', activeTo: null },
    { id: id('202'), name: 'سماع الشرح المعيّن', sortOrder: 2, activeFrom: '2020-01-01', activeTo: null },
  ],
};
/** The four seeded weekly habits, in sort order. */
export const weeklyHabits: HabitDef[] = [memorization, fiqh, tazkiyah, lessonPrep];
export const weeklyTristateHabits: HabitDef[] = [memorization, fiqh, tazkiyah];

// ───────────────────────────── preview data set ─────────────────────────────

/** The preview's fixed "today" in the student's zone (Asia/Riyadh) — a Thursday. */
export const PREVIEW_TODAY = '2026-11-26';
/** Noon in Riyadh on PREVIEW_TODAY. */
export const PREVIEW_NOW = new Date('2026-11-26T09:00:00Z');
export const PREVIEW_USER_ID = '00000000-0000-4000-8000-0000000000c1';
export const PREVIEW_GROUP_ID = '00000000-0000-4000-8000-0000000000b1';
const PREVIEW_JOINED = '2026-10-12';
/** The review saved for the current week (2026-11-22), shown on the weekly preview. */
export const PREVIEW_WEEK_REVIEW = 'أحتاج وقتًا أطول لدروس التزكية.';

export const previewProfile = {
  id: PREVIEW_USER_ID,
  full_name: 'أحمد محمد',
  role: 'student' as const,
  group_id: PREVIEW_GROUP_ID,
  joined_at: PREVIEW_JOINED,
  created_at: '2026-10-10T08:00:00Z',
  timezone: null as string | null,
  reminder_time: '21:00:00' as string | null,
  weekly_reminder: true,
  is_active: true,
  is_tracked: true,
};

export const previewGroup = {
  id: PREVIEW_GROUP_ID,
  name: 'المجموعة الأولى',
  timezone: 'Asia/Riyadh',
  week_starts_on: 0,
};

/** The app_settings defaults (migration 0001). */
export const defaultSettings = (): Array<{ key: string; value: unknown }> => [
  { key: 'backfill_days', value: 2 },
  { key: 'streak_threshold_pct', value: 100 },
  { key: 'hijri_adjustment_days', value: 0 },
  { key: 'weekly_grace_days', value: 3 },
  { key: 'default_reminder_time', value: '21:00' },
];

/**
 * One letter per day from PREVIEW_JOINED: A achieved, P nearly (adhkar short), F failed,
 * N neutral (nothing required), M missing (no log). The last 12 days before today are all A,
 * which gives the 12-day current streak; today itself is not logged yet (m10-today-new).
 */
const DAY_PATTERN = 'AAAAAANAAAFAAMAAAAAAAAPFAAAMAAAAF' + 'AAAAAAAAAAAA';

const NOTES: Record<string, string> = {
  N: 'كنت مسافرًا هذا اليوم.',
  F: 'انشغلت بالاختبارات.',
};

function dailyLog(date: string, kind: string): FakeLogRow {
  const logId = `log-daily-${date}`;
  const status = (habit: HabitDef): EntryStatus => {
    if (kind === 'N') return 'not_required';
    if (kind === 'F' && (habit === quran || habit === qiyam)) return 'not_done';
    return 'done';
  };
  const checked = kind === 'A' ? 13 : kind === 'P' ? 9 : kind === 'F' ? 7 : 0;
  return {
    id: logId,
    user_id: PREVIEW_USER_ID,
    period: 'daily',
    period_start: date,
    note: NOTES[kind] ?? null,
    updated_at: `${date}T19:30:00Z`,
    log_entries: dailyHabits.map((habit) => ({
      id: `${logId}-${habit.slug}`,
      habit_id: habit.id,
      status: status(habit),
      log_entry_items:
        habit.kind === 'checklist' && kind !== 'N'
          ? habit.items.slice(0, checked).map((item) => ({ entry_id: `${logId}-${habit.slug}`, habit_item_id: item.id }))
          : [],
    })),
  };
}

function weeklyLog(weekStart: string, statuses: EntryStatus[], itemsChecked: number, review: string | null): FakeLogRow {
  const logId = `log-weekly-${weekStart}`;
  return {
    id: logId,
    user_id: PREVIEW_USER_ID,
    period: 'weekly',
    period_start: weekStart,
    note: null,
    review_text: review,
    support_request_text: null,
    updated_at: `${addDays(weekStart, 6)}T18:00:00Z`,
    log_entries: weeklyHabits.map((habit, i) => ({
      id: `${logId}-${habit.slug}`,
      habit_id: habit.id,
      status: statuses[i] ?? 'done',
      log_entry_items:
        habit.kind === 'checklist'
          ? habit.items.slice(0, itemsChecked).map((item) => ({ entry_id: `${logId}-${habit.slug}`, habit_item_id: item.id }))
          : [],
    })),
  };
}

/** Fills the fake tables with the preview student's ~45 days of history (PREVIEW-2). */
export function seedPreviewDb(db: FakeDb): void {
  db.settings = defaultSettings();
  db.group = { ...previewGroup };
  db.profile = { ...previewProfile };
  db.habits = [...dailyHabits, ...weeklyHabits];
  db.logs = {};
  for (let i = 0; i < DAY_PATTERN.length; i += 1) {
    const kind = DAY_PATTERN[i] ?? 'M';
    if (kind === 'M') continue;
    const date = addDays(PREVIEW_JOINED, i);
    db.logs[`daily:${date}`] = dailyLog(date, kind);
  }
  const weeks: Array<[string, EntryStatus[], number, string | null]> = [
    ['2026-10-18', ['done', 'done', 'done'], 2, 'أسبوع طيّب، أتممت المراجعة.'],
    ['2026-10-25', ['done', 'not_done', 'done'], 1, null],
    ['2026-11-01', ['done', 'done', 'not_required'], 2, null],
    ['2026-11-15', ['done', 'done', 'done'], 2, 'ثبّتُّ حفظ جزء عمّ.'],
    ['2026-11-22', ['done', 'done', 'not_done'], 1, PREVIEW_WEEK_REVIEW],
  ];
  for (const [start, statuses, items, review] of weeks) db.logs[`weekly:${start}`] = weeklyLog(start, statuses, items, review);
  db.attendance = [
    { session_date: '2026-10-19', status: 'present' },
    { session_date: '2026-10-26', status: 'present' },
    { session_date: '2026-11-02', status: 'absent' },
    { session_date: '2026-11-09', status: 'present' },
    { session_date: '2026-11-16', status: 'excused' },
    { session_date: '2026-11-23', status: 'present' },
  ];
  db.pushTokens = [];
  db.deletionRequests = [];
  db.session = {
    access_token: 'preview-access-token',
    refresh_token: 'preview-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4102444800,
    user: {
      id: PREVIEW_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'ahmad@example.com',
      app_metadata: {},
      user_metadata: {},
      created_at: previewProfile.created_at,
    },
  };
}
