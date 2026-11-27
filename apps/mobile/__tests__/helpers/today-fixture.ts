// Test fixture mirroring supabase/seed.sql (habit names are data, allowed in fixtures — AGENTS.md §3).
import type { HabitDef, HabitItemDef } from '@awrad/domain';

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

export interface FakeLogRow {
  id: string;
  user_id: string;
  period: 'daily' | 'weekly';
  period_start: string;
  note: string | null;
  review_text?: string | null;
  support_request_text?: string | null;
  log_entries: Array<{
    id: string;
    habit_id: string;
    status: 'done' | 'not_done' | 'not_required';
    log_entry_items: Array<{ entry_id: string; habit_item_id: string }>;
  }>;
}

/** In-memory tables read by the fake `supabase.from(...)` builder. */
export const fakeDb: {
  settings: Array<{ key: string; value: unknown }>;
  group: { timezone: string; week_starts_on: number } | null;
  logs: Record<string, FakeLogRow>;
  calls: Array<{
    table: string;
    filters: Record<string, unknown>;
    select?: string;
    order?: [string, unknown];
    range?: [number, number];
  }>;
  /** Make list reads of `logs` (order/range) fail. */
  failLogList: boolean;
} = { settings: [], group: null, logs: {}, calls: [], failLogList: false };

export function resetFakeDb(): void {
  fakeDb.settings = [
    { key: 'backfill_days', value: 2 },
    { key: 'streak_threshold_pct', value: 100 },
    { key: 'hijri_adjustment_days', value: 0 },
    { key: 'weekly_grace_days', value: 3 },
  ];
  fakeDb.group = { timezone: 'Asia/Riyadh', week_starts_on: 0 };
  fakeDb.logs = {};
  fakeDb.calls = [];
  fakeDb.failLogList = false;
}

type Result = { data: unknown; error: unknown };

/** Minimal chainable stand-in for the PostgREST query builder (select/eq/in/maybeSingle/await). */
function builder(table: string) {
  const call: (typeof fakeDb.calls)[number] = {
    table,
    filters: {},
  };
  fakeDb.calls.push(call);
  const result = (): Result => {
    switch (table) {
      case 'app_settings':
        return { data: fakeDb.settings, error: null };
      case 'groups':
        return { data: fakeDb.group, error: null };
      case 'logs':
        if (call.range) {
          if (fakeDb.failLogList) return { data: null, error: { message: 'boom' } };
          const [from, to] = call.range;
          const rows = Object.values(fakeDb.logs)
            .filter((l) => l.period === call.filters.period)
            .sort((a, b) => b.period_start.localeCompare(a.period_start))
            .slice(from, to + 1);
          return { data: rows, error: null };
        }
        return { data: fakeDb.logs[String(call.filters.period_start)] ?? null, error: null };
      default:
        return { data: null, error: { message: `unexpected table ${table}` } };
    }
  };
  const b = {
    select(columns?: string) {
      call.select = columns;
      return b;
    },
    eq(column: string, value: unknown) {
      call.filters[column] = value;
      return b;
    },
    in(column: string, values: unknown) {
      call.filters[column] = values;
      return b;
    },
    order(column: string, options?: unknown) {
      call.order = [column, options];
      return b;
    },
    range(from: number, to: number) {
      call.range = [from, to];
      return b;
    },
    maybeSingle: async () => result(),
    single: async () => result(),
    then<T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) {
      return Promise.resolve(result()).then(resolve, reject);
    },
  };
  return b;
}

export const fakeSupabase = { from: (table: string) => builder(table) };

export const USER_ID = 'u-1';
export const fakeProfile = {
  id: USER_ID,
  full_name: 'طالب تجريبي',
  role: 'student',
  group_id: 'g-1',
  timezone: null,
  is_active: true,
  is_tracked: true,
};

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
