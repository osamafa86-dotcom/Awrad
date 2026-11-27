import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildMapping,
  levenshtein,
  normalizeArabicName,
  planImport,
  toMappingFile,
  type GroupInfo,
  type HabitInfo,
  type LegacyData,
  type MappingFile,
  type ProfileInfo,
} from '../map.ts';
import { parseAttendanceCsv, parseDailyCsv, parseWeeklyCsv } from '../parse.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const always = { activeFrom: '2020-01-01', activeTo: null };

// A catalogue shaped like supabase/seed.sql (fixture data: habit names are allowed here).
const habits: HabitInfo[] = [
  {
    id: id(0xa1),
    slug: 'quran_wird',
    name: 'قراءة ورد القرآن',
    kind: 'tristate',
    frequency: 'daily',
    ...always,
    items: [],
  },
  {
    id: id(0xa2),
    slug: 'adhkar',
    name: 'ورد الأذكار',
    kind: 'checklist',
    frequency: 'daily',
    ...always,
    items: [
      { id: id(0x101), name: 'أذكار الصباح', ...always },
      { id: id(0x102), name: 'أذكار المساء', ...always },
      { id: id(0x113), name: 'أذكار الصلوات', ...always },
    ],
  },
  {
    id: id(0xa3),
    slug: 'qiyam',
    name: 'ورد القيام',
    kind: 'tristate',
    frequency: 'daily',
    ...always,
    items: [],
  },
  {
    id: id(0xa4),
    slug: 'tafsir_ibn_juzayy',
    name: 'تفسير ابن جُزَي',
    kind: 'tristate',
    frequency: 'daily',
    ...always,
    items: [],
  },
  {
    id: id(0xa5),
    slug: 'sahihayn',
    name: 'الجمع بين الصحيحين',
    kind: 'tristate',
    frequency: 'daily',
    ...always,
    items: [],
  },
  {
    id: id(0xa6),
    slug: 'quran_memorization',
    name: 'حفظ أو مراجعة حفظ القرآن',
    kind: 'tristate',
    frequency: 'weekly',
    ...always,
    items: [],
  },
  {
    id: id(0xa7),
    slug: 'fiqh_lesson',
    name: 'درس الفقه',
    kind: 'tristate',
    frequency: 'weekly',
    ...always,
    items: [],
  },
  {
    id: id(0xa8),
    slug: 'tazkiyah_hikam',
    name: 'الاستماع لدروس التزكية (الحكم العطائية)',
    kind: 'tristate',
    frequency: 'weekly',
    ...always,
    items: [],
  },
  {
    id: id(0xa9),
    slug: 'lesson_prep',
    name: 'تحضير الدرس الأسبوعي',
    kind: 'checklist',
    frequency: 'weekly',
    ...always,
    items: [
      { id: id(0x201), name: 'قراءة المتن المعيّن', ...always },
      { id: id(0x202), name: 'سماع الشرح المعيّن', ...always },
    ],
  },
];

const G1 = id(0xc1);
const groups: GroupInfo[] = [{ id: G1, name: 'G1', weekStartsOn: 0 }];
const AHMAD = id(0xd1);
const KHALID = id(0xd2);
const profiles: ProfileInfo[] = [
  { id: AHMAD, fullName: 'أحمد التجريبي', groupId: G1, weekStartsOn: 0 },
  { id: KHALID, fullName: 'خالد المثالي', groupId: G1, weekStartsOn: 0 },
];

const file: MappingFile = {
  blankPolicy: 'not_required',
  dateOrder: 'dmy',
  daily: {
    'قراءة ورد القرآن (ست أرباع)': 'quran_wird',
    'ورد الأذكار': { slug: 'adhkar' },
    'ورد القيام': 'qiyam',
    'تفسير ابن جزي': 'tafsir_ibn_juzayy',
    'الجمع بين الصحيحين': 'sahihayn',
  },
  weekly: {
    'حفظ أو مراجعة حفظ القرآن': 'quran_memorization',
    'درس الفقه': 'fiqh_lesson',
    'الاستماع لدروس التزكية': 'tazkiyah_hikam',
    'تحضير الدرس الأسبوعي': {
      slug: 'lesson_prep',
      items: { 'قراءة المتن': 'قراءة المتن المعيّن', 'سماع الشرح': 'سماع الشرح المعيّن' },
    },
  },
  students: {
    'أحمد التجريبي': AHMAD,
    'خالد المثالي': KHALID,
    'يوسف النموذجي': { createMissingAsInactive: true, groupId: G1 },
  },
};

const data: LegacyData = {
  daily: parseDailyCsv(fixture('daily.sample.csv')),
  weekly: parseWeeklyCsv(fixture('weekly.sample.csv')),
  attendance: parseAttendanceCsv(fixture('attendance.sample.csv')),
};

const mapping = () => buildMapping(data, habits, profiles, { file, groups });

describe('normalizeArabicName', () => {
  it('drops tashkeel and tatweel, unifies hamzat alef, taa marbuta and alef maqsura', () => {
    expect(normalizeArabicName('أَحْمَدُ')).toBe('احمد');
    expect(normalizeArabicName('إبراهيم آدم')).toBe('ابراهيم ادم');
    expect(normalizeArabicName('فاطمة')).toBe('فاطمه');
    expect(normalizeArabicName('مصطفى')).toBe('مصطفي');
    expect(normalizeArabicName('خالـــد')).toBe('خالد');
  });

  it('drops a leading «ال» from each word and collapses spaces', () => {
    expect(normalizeArabicName('  عبد   الرحمن  التجريبي ')).toBe('عبد رحمن تجريبي');
  });
});

describe('levenshtein', () => {
  it('counts insertions, deletions and substitutions', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('خالد', 'خلد')).toBe(1);
  });
});

describe('buildMapping without a mapping file (the draft to review)', () => {
  const rows: LegacyData = {
    daily: parseDailyCsv(
      'الطابع الزمني,اسمك,التاريخ,قراءة ورد القرآن (ست أرباع),ورد القيام,ملاحظات\n' +
        '1/3/2025 9:00:00,أحمد التجريبي,1/3/2025,تم,تم,\n' +
        '1/3/2025 9:00:00,خالد المثالى,1/3/2025,تم,تم,\n' +
        '1/3/2025 9:00:00,احمد التجريبى,1/3/2025,تم,تم,\n' +
        '1/3/2025 9:00:00,سالم المجهول,1/3/2025,تم,تم,\n',
    ),
  };
  const draft = buildMapping(rows, habits, profiles, { groups });

  it('accepts only an exact name match', () => {
    expect(draft.students['أحمد التجريبي']).toEqual({
      kind: 'profile',
      profileId: AHMAD,
      weekStartsOn: 0,
    });
  });

  it('never auto-accepts a near match: it becomes a suggestion', () => {
    expect(draft.students['خالد المثالى']).toBeNull();
    expect(draft.suggestions['خالد المثالى']).toEqual([
      { profileId: KHALID, fullName: 'خالد المثالي', distance: 0 },
    ]);
    expect(draft.suggestions['احمد التجريبى']).toEqual([
      { profileId: AHMAD, fullName: 'أحمد التجريبي', distance: 0 },
    ]);
    expect(draft.suggestions['سالم المجهول']).toEqual([]);
  });

  it('guesses habit columns by name and leaves the rest out', () => {
    expect(draft.daily.map((c) => [c.header, c.habit.slug])).toEqual([
      ['قراءة ورد القرآن (ست أرباع)', 'quran_wird'],
      ['ورد القيام', 'qiyam'],
    ]);
  });

  it('serialises to a mapping file with null for every name still to decide', () => {
    // «ملاحظات» is guessed as the daily note column (Ruling FIN-2), to review like the habit guesses.
    expect(toMappingFile(draft)).toEqual({
      blankPolicy: 'not_required',
      dateOrder: 'dmy',
      daily: { 'قراءة ورد القرآن (ست أرباع)': 'quran_wird', 'ورد القيام': 'qiyam', ملاحظات: { text: 'note' } },
      weekly: {},
      students: {
        'أحمد التجريبي': AHMAD,
        'خالد المثالى': null,
        'احمد التجريبى': null,
        'سالم المجهول': null,
      },
    });
  });
});

describe('buildMapping with a reviewed mapping file', () => {
  it('resolves habits, items, students and accounts to create', () => {
    const m = mapping();
    expect(m.students['يوسف النموذجي']).toEqual({
      kind: 'create',
      name: 'يوسف النموذجي',
      groupId: G1,
      weekStartsOn: 0,
    });
    const prep = m.weekly.find((c) => c.header === 'تحضير الدرس الأسبوعي');
    expect(prep?.itemLabels).toEqual({
      'قراءة المتن': 'قراءة المتن المعيّن',
      'سماع الشرح': 'سماع الشرح المعيّن',
    });
    expect(m.suggestions['سالم المجهول']).toEqual([]);
  });

  it('rejects unknown slugs, profiles, groups and item names, listing them all', () => {
    const bad: MappingFile = {
      daily: { 'ورد القيام': 'no_such_habit' },
      weekly: { 'تحضير الدرس الأسبوعي': { slug: 'lesson_prep', items: { x: 'بند غير موجود' } } },
      students: {
        'أحمد التجريبي': '00000000-0000-4000-8000-00000000dead',
        'يوسف النموذجي': {
          createMissingAsInactive: true,
          groupId: '00000000-0000-4000-8000-00000000beef',
        },
      },
    };
    expect(() => buildMapping(data, habits, profiles, { file: bad, groups })).toThrow(
      /no_such_habit[\s\S]*بند غير موجود[\s\S]*00000000dead[\s\S]*00000000beef/,
    );
  });

  it('rejects a habit mapped under the wrong frequency', () => {
    const bad: MappingFile = { daily: { 'درس الفقه': 'fiqh_lesson' }, students: {} };
    expect(() => buildMapping(data, habits, profiles, { file: bad, groups })).toThrow(
      /fiqh_lesson/,
    );
  });
});

describe('planImport', () => {
  const plan = planImport(data, mapping());
  const daily = plan.toImport.filter((l) => l.period === 'daily');
  const find = (period: string, name: string, start: string) =>
    plan.toImport.find((l) => l.period === period && l.name === name && l.periodStart === start);
  const statusOf = (log: ReturnType<typeof find>, slug: string) =>
    log?.entries.find((e) => e.habit_id === habits.find((h) => h.slug === slug)!.id);

  it('imports one log per student and day: 8 daily logs from the 12 sample rows', () => {
    expect(daily.map((l) => `${l.name} ${l.periodStart}`).sort()).toEqual([
      'أحمد التجريبي 2025-03-01',
      'أحمد التجريبي 2025-03-02',
      'أحمد التجريبي 2025-03-03',
      'خالد المثالي 2025-03-01',
      'خالد المثالي 2025-03-02',
      'خالد المثالي 2025-03-03',
      'يوسف النموذجي 2025-03-01',
      'يوسف النموذجي 2025-03-02',
    ]);
  });

  it('keeps the newest response by timestamp and lists the older one as resolved', () => {
    expect(plan.duplicatesResolved).toEqual([
      { source: 'daily', row: 3, name: 'أحمد التجريبي', periodStart: '2025-03-02', keptRow: 4 },
      { source: 'daily', row: 11, name: 'أحمد التجريبي', periodStart: '2025-03-03', keptRow: 13 },
    ]);
    expect(find('daily', 'أحمد التجريبي', '2025-03-02')?.row).toBe(4);
  });

  it('breaks a timestamp tie by the later row', () => {
    expect(find('daily', 'أحمد التجريبي', '2025-03-03')?.row).toBe(13);
  });

  it('skips unmapped names, counting their rows in every file', () => {
    expect(plan.unmappedNames).toEqual([{ name: 'سالم المجهول', rows: 2, suggestions: [] }]);
    expect(plan.toImport.some((l) => l.name === 'سالم المجهول')).toBe(false);
    expect(plan.attendance.some((a) => a.name === 'سالم المجهول')).toBe(false);
  });

  it('lists invalid dates and does not import them', () => {
    expect(plan.invalidDates).toEqual([
      { source: 'daily', row: 7, name: 'خالد المثالي', value: '30/02/2025' },
    ]);
  });

  it('builds a save_log entry for every active habit, checklists carrying item ids', () => {
    const log = find('daily', 'أحمد التجريبي', '2025-03-02');
    expect(log?.entries).toEqual([
      { habit_id: id(0xa1), status: 'done' },
      { habit_id: id(0xa2), status: 'done', checked_item_ids: [id(0x101), id(0x102), id(0x113)] },
      { habit_id: id(0xa3), status: 'done' },
      { habit_id: id(0xa4), status: 'done' },
      { habit_id: id(0xa5), status: 'done' },
    ]);
  });

  it('imports a blank cell as not_required by default (BR-14)', () => {
    const khalid = find('daily', 'خالد المثالي', '2025-03-01');
    expect(statusOf(khalid, 'adhkar')).toEqual({ habit_id: id(0xa2), status: 'not_required' });
    expect(statusOf(khalid, 'qiyam')).toEqual({ habit_id: id(0xa3), status: 'not_required' });
    const yusuf = find('daily', 'يوسف النموذجي', '2025-03-02');
    expect(statusOf(yusuf, 'sahihayn')?.status).toBe('not_required');
  });

  it("imports a blank cell as not_done with blankPolicy 'not_done'", () => {
    const strict = planImport(
      data,
      buildMapping(data, habits, profiles, { file: { ...file, blankPolicy: 'not_done' }, groups }),
    );
    const yusuf = strict.toImport.find(
      (l) => l.name === 'يوسف النموذجي' && l.periodStart === '2025-03-02',
    );
    expect(yusuf?.entries.find((e) => e.habit_id === id(0xa5))?.status).toBe('not_done');
    const khalid = strict.toImport.find(
      (l) => l.name === 'خالد المثالي' && l.periodStart === '2025-03-01',
    );
    expect(khalid?.entries.find((e) => e.habit_id === id(0xa2))).toEqual({
      habit_id: id(0xa2),
      status: 'not_done',
      checked_item_ids: [],
    });
  });

  it('fills habits that have no column with the blank policy', () => {
    const noQiyam = buildMapping(data, habits, profiles, {
      file: { ...file, daily: { 'ورد القيام': 'qiyam' } },
      groups,
    });
    const log = planImport(data, noQiyam).toImport.find((l) => l.period === 'daily');
    expect(log?.entries.map((e) => e.status)).toEqual([
      'not_required',
      'not_required',
      'done',
      'not_required',
      'not_required',
    ]);
  });

  it('plans weekly logs on the week start of the student group', () => {
    const weekly = plan.toImport.filter((l) => l.period === 'weekly');
    expect(weekly.map((l) => `${l.name} ${l.periodStart}`)).toEqual([
      'أحمد التجريبي 2025-03-02',
      'خالد المثالي 2025-03-02',
      'يوسف النموذجي 2025-03-02',
      'أحمد التجريبي 2025-03-09',
    ]);
    const khalid = find('weekly', 'خالد المثالي', '2025-03-02');
    expect(statusOf(khalid, 'fiqh_lesson')?.status).toBe('not_required');
    // One of the two items ticked: not_done (save_log derives the same from the items).
    expect(statusOf(khalid, 'lesson_prep')).toEqual({
      habit_id: id(0xa9),
      status: 'not_done',
      checked_item_ids: [id(0x201)],
    });
  });

  it('plans attendance marks, skipping blank cells', () => {
    expect(plan.attendance.map((a) => `${a.name} ${a.date} ${a.status}`)).toEqual([
      'أحمد التجريبي 2025-03-02 present',
      'أحمد التجريبي 2025-03-09 absent',
      'خالد المثالي 2025-03-02 excused',
      'خالد المثالي 2025-03-09 present',
      'يوسف النموذجي 2025-03-02 present',
    ]);
  });

  it('lists the accounts to create', () => {
    expect(plan.accountsToCreate).toEqual([{ name: 'يوسف النموذجي', groupId: G1 }]);
  });

  it('lists columns that map to no habit', () => {
    expect(plan.ignoredColumns).toEqual([{ source: 'daily', header: 'ملاحظات' }]);
  });

  it('uses the timestamp day when the form had no date question', () => {
    const rows: LegacyData = {
      daily: parseDailyCsv('الطابع الزمني,اسمك,ورد القيام\n05/03/2025 23:00:00,أحمد التجريبي,تم\n'),
    };
    const p = planImport(rows, buildMapping(rows, habits, profiles, { file, groups }));
    expect(p.toImport[0]?.periodStart).toBe('2025-03-05');
  });
});

describe('planImport row errors (what the dry-run reports instead of failing later)', () => {
  const archived: HabitInfo = {
    id: id(0xaa),
    slug: 'old_book',
    name: 'كتاب قديم',
    kind: 'tristate',
    frequency: 'daily',
    activeFrom: '2020-01-01',
    activeTo: '2025-03-01',
    items: [],
  };
  const rows: LegacyData = {
    daily: parseDailyCsv(
      'الطابع الزمني,اسمك,التاريخ,كتاب قديم,ورد القيام,ورد الأذكار\n' +
        '01/03/2025 9:00:00,أحمد التجريبي,01/03/2025,تم,تم,أذكار الصباح\n' +
        '02/03/2025 9:00:00,أحمد التجريبي,02/03/2025,تم,تم,أذكار الصباح\n' +
        '03/03/2025 9:00:00,أحمد التجريبي,03/03/2025,,تم,أذكار الصباح\n' +
        '04/03/2025 9:00:00,أحمد التجريبي,04/03/2025,,ربما,أذكار الصباح\n' +
        '05/03/2025 9:00:00,أحمد التجريبي,05/03/2025,,تم,أذكار الظهيرة\n',
    ),
  };
  const m = buildMapping(rows, [...habits, archived], profiles, {
    file: {
      daily: { 'كتاب قديم': 'old_book', 'ورد القيام': 'qiyam', 'ورد الأذكار': 'adhkar' },
      students: { 'أحمد التجريبي': AHMAD },
    },
    groups,
  });
  const p = planImport(rows, m);

  it('flags an answer for a habit archived on that date as INACTIVE_HABIT', () => {
    expect(p.rowErrors).toContainEqual({
      source: 'daily',
      row: 3,
      name: 'أحمد التجريبي',
      date: '2025-03-02',
      code: 'INACTIVE_HABIT',
      column: 'كتاب قديم',
      value: 'تم',
    });
  });

  it('includes the archived habit while it was active, and ignores its blank cells after', () => {
    expect(p.toImport.map((l) => l.periodStart)).toEqual(['2025-03-01', '2025-03-03']);
    expect(p.toImport[0]?.entries.some((e) => e.habit_id === id(0xaa))).toBe(true);
    expect(p.toImport[1]?.entries.some((e) => e.habit_id === id(0xaa))).toBe(false);
  });

  it('flags unreadable answers and unknown checklist items', () => {
    expect(p.rowErrors.map((e) => [e.row, e.code, e.value])).toEqual([
      [3, 'INACTIVE_HABIT', 'تم'],
      [5, 'INVALID_VALUE', 'ربما'],
      [6, 'INVALID_ITEM', 'أذكار الظهيرة'],
    ]);
  });
});

describe('planImport checks weekly activity on the week start, as save_log does', () => {
  // 2025-03-02 is a Sunday (the G1 week start); 2025-03-04 a Tuesday, 2025-03-06 a Thursday.
  const newHabit: HabitInfo = {
    id: id(0xab),
    slug: 'new_book',
    name: 'كتاب جديد',
    kind: 'tristate',
    frequency: 'weekly',
    activeFrom: '2025-03-04',
    activeTo: null,
    items: [],
  };
  const oldHabit: HabitInfo = {
    id: id(0xac),
    slug: 'old_weekly_book',
    name: 'كتاب أسبوعي قديم',
    kind: 'tristate',
    frequency: 'weekly',
    activeFrom: '2020-01-01',
    activeTo: '2025-03-03',
    items: [],
  };
  const prep = habits.find((h) => h.slug === 'lesson_prep')!;
  const prepMidWeek: HabitInfo = {
    ...prep,
    items: [
      { id: id(0x201), name: 'قراءة المتن المعيّن', ...always },
      { id: id(0x203), name: 'بند يبدأ وسط الأسبوع', activeFrom: '2025-03-04', activeTo: null },
    ],
  };
  const catalog = [
    ...habits.filter((h) => h.frequency === 'daily' || h.slug === 'fiqh_lesson'),
    prepMidWeek,
    newHabit,
    oldHabit,
  ];
  const rows: LegacyData = {
    weekly: parseWeeklyCsv(
      'الطابع الزمني,اسمك,الأسبوع,درس الفقه,كتاب جديد,كتاب أسبوعي قديم,تحضير الدرس الأسبوعي\n' +
        '06/03/2025 9:00:00,أحمد التجريبي,06/03/2025,تم,تم,,قراءة المتن المعيّن\n' +
        '06/03/2025 9:00:00,خالد المثالي,06/03/2025,تم,,تم,بند يبدأ وسط الأسبوع\n',
    ),
  };
  const p = planImport(
    rows,
    buildMapping(rows, catalog, profiles, {
      file: {
        weekly: {
          'درس الفقه': 'fiqh_lesson',
          'كتاب جديد': 'new_book',
          'كتاب أسبوعي قديم': 'old_weekly_book',
          'تحضير الدرس الأسبوعي': 'lesson_prep',
        },
        students: { 'أحمد التجريبي': AHMAD, 'خالد المثالي': KHALID },
      },
      groups,
    }),
  );

  it('flags an answer for a habit that starts mid-week (inactive on the week start)', () => {
    expect(p.rowErrors).toContainEqual({
      source: 'weekly',
      row: 2,
      name: 'أحمد التجريبي',
      date: '2025-03-02',
      code: 'INACTIVE_HABIT',
      column: 'كتاب جديد',
      value: 'تم',
    });
  });

  it('expects an entry for a habit archived mid-week (still active on the week start)', () => {
    expect(p.toImport).toHaveLength(0);
    const fresh = planImport(
      {
        weekly: [
          { ...rows.weekly![0]!, answers: { ...rows.weekly![0]!.answers, 'كتاب جديد': '' } },
        ],
      },
      buildMapping(rows, catalog, profiles, {
        file: {
          weekly: { 'كتاب أسبوعي قديم': 'old_weekly_book' },
          students: { 'أحمد التجريبي': AHMAD },
        },
        groups,
      }),
    );
    expect(fresh.toImport[0]?.periodStart).toBe('2025-03-02');
    expect(fresh.toImport[0]?.entries.map((e) => e.habit_id)).toContain(id(0xac));
    expect(fresh.toImport[0]?.entries.map((e) => e.habit_id)).not.toContain(id(0xab));
  });

  it('checks checklist items on the week start too', () => {
    expect(p.rowErrors).toContainEqual({
      source: 'weekly',
      row: 3,
      name: 'خالد المثالي',
      date: '2025-03-02',
      code: 'INVALID_ITEM',
      column: 'تحضير الدرس الأسبوعي',
      value: 'بند يبدأ وسط الأسبوع',
    });
  });
});

// Ruling FIN-2 (D11 «نعم، كل ما يمكن»): the daily note, the weekly review and the weekly support request travel with
// the log through save_log; a mapping file names their columns as { "text": "note" | "review" | "support" }.
describe('text columns (daily note, weekly review and support request)', () => {
  const withTexts: MappingFile = {
    ...file,
    daily: { ...file.daily, ملاحظات: { text: 'note' } },
    weekly: { ...file.weekly, مراجعتك: { text: 'review' }, 'ما تحتاج فيه دعمًا': { text: 'support' } },
  };
  const weeklyCsv =
    'الطابع الزمني,اسمك,الأسبوع,درس الفقه,مراجعتك,ما تحتاج فيه دعمًا\n' +
    '07/03/2025 21:00:00,أحمد التجريبي,02/03/2025,تم,"  أسبوع جيد  ","أحتاج مساعدة"\n' +
    '07/03/2025 20:00:00,خالد المثالي,02/03/2025,تم,,\n';
  const rows: LegacyData = { daily: data.daily, weekly: parseWeeklyCsv(weeklyCsv) };
  const plan = planImport(rows, buildMapping(rows, habits, profiles, { file: withTexts, groups }));
  const log = (period: string, name: string, start: string) =>
    plan.toImport.find((l) => l.period === period && l.name === name && l.periodStart === start);

  it('carries the daily note, trimmed, with its line breaks', () => {
    expect(log('daily', 'أحمد التجريبي', '2025-03-02')?.note).toBe('تصحيح\nلسجلّ اليوم');
    expect(log('daily', 'أحمد التجريبي', '2025-03-01')?.note).toBeUndefined();
  });

  it('carries the weekly review and support request; empty cells carry nothing', () => {
    expect(log('weekly', 'أحمد التجريبي', '2025-03-02')).toMatchObject({
      reviewText: 'أسبوع جيد',
      supportRequestText: 'أحتاج مساعدة',
    });
    const khalid = log('weekly', 'خالد المثالي', '2025-03-02');
    expect(khalid).not.toHaveProperty('reviewText');
    expect(khalid).not.toHaveProperty('supportRequestText');
  });

  it('a mapped text column is no longer reported as ignored', () => {
    expect(plan.ignoredColumns).toEqual([]);
  });

  it('the draft guesses note, review and support columns by their headers', () => {
    const draft = buildMapping(rows, habits, profiles, { groups });
    const written = toMappingFile(draft);
    expect(written.daily?.['ملاحظات']).toEqual({ text: 'note' });
    expect(written.weekly?.['مراجعتك']).toEqual({ text: 'review' });
    expect(written.weekly?.['ما تحتاج فيه دعمًا']).toEqual({ text: 'support' });
  });

  it('rejects a text kind that does not fit the file (a review in the daily sheet)', () => {
    const bad: MappingFile = { ...file, daily: { ملاحظات: { text: 'review' } } };
    expect(() => buildMapping(rows, habits, profiles, { file: bad, groups })).toThrow(/ملاحظات/);
  });
});

// Final review ops M6: a weekly sheet without «الأسبوع» took the week from the timestamp's day, so a review sent in the
// grace days after its week (BR-06) landed in the next week and lost to that week's own review as a "duplicate".
describe('weekly rows without a week column (M6)', () => {
  const csv = (rowsText: string) => parseWeeklyCsv(`الطابع الزمني,اسمك,درس الفقه\n${rowsText}`);

  it('a review sent within the grace days after the week ends belongs to that week, and is reported', () => {
    // Sun 2025-03-09 starts a week; Mon 2025-03-10 is day 1 of it, inside the 3 grace days of the week of 03-02.
    const rows: LegacyData = { weekly: csv('10/03/2025 09:00:00,أحمد التجريبي,تم\n') };
    const plan = planImport(rows, buildMapping(rows, habits, profiles, { file, groups }));
    expect(plan.toImport.map((l) => l.periodStart)).toEqual(['2025-03-02']);
    expect(plan.weeksInferred).toEqual([
      { row: 2, name: 'أحمد التجريبي', sentOn: '2025-03-10', periodStart: '2025-03-02' },
    ]);
  });

  it('a late review and the next week own review no longer collide', () => {
    const rows: LegacyData = {
      weekly: csv('10/03/2025 09:00:00,أحمد التجريبي,تم\n15/03/2025 21:00:00,أحمد التجريبي,لم يتم\n'),
    };
    const plan = planImport(rows, buildMapping(rows, habits, profiles, { file, groups }));
    expect(plan.toImport.map((l) => l.periodStart).sort()).toEqual(['2025-03-02', '2025-03-09']);
    expect(plan.duplicatesResolved).toEqual([]);
  });

  it('after the grace days the timestamp week is used, and the grace length follows the setting', () => {
    const rows: LegacyData = { weekly: csv('12/03/2025 09:00:00,أحمد التجريبي,تم\n') };
    expect(
      planImport(rows, buildMapping(rows, habits, profiles, { file, groups })).toImport[0]?.periodStart,
    ).toBe('2025-03-09');
    const strict = buildMapping(rows, habits, profiles, { file, groups, weeklyGraceDays: 0 });
    const early: LegacyData = { weekly: csv('10/03/2025 09:00:00,أحمد التجريبي,تم\n') };
    expect(planImport(early, { ...strict }).toImport[0]?.periodStart).toBe('2025-03-09');
  });

  it('an explicit week column is never second-guessed', () => {
    const rows: LegacyData = {
      weekly: parseWeeklyCsv('الطابع الزمني,اسمك,الأسبوع,درس الفقه\n10/03/2025 09:00:00,أحمد التجريبي,09/03/2025,تم\n'),
    };
    const plan = planImport(rows, buildMapping(rows, habits, profiles, { file, groups }));
    expect(plan.toImport[0]?.periodStart).toBe('2025-03-09');
    expect(plan.weeksInferred).toEqual([]);
  });
});

