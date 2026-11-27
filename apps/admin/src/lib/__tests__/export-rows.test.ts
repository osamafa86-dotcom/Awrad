import { toHijri, type HabitDef } from '@awrad/domain';
import { describe, expect, it } from 'vitest';

import {
  buildAttendanceReport,
  buildDailyReport,
  buildWeeklyReport,
  type ExportGroup,
  type ExportLog,
  type ExportPerson,
} from '@/lib/export-rows';

// 12:00 in Riyadh: today is 2026-11-27 for both groups.
const NOW = new Date('2026-11-27T09:00:00Z');
const SETTINGS = { thresholdPct: 100, hijriAdjustment: 1 };

const groups: ExportGroup[] = [
  { id: 'g1', name: 'أ مجموعة الفجر', timezone: 'Asia/Riyadh', weekStartsOn: 0 },
  { id: 'g2', name: 'ب مجموعة العصر', timezone: 'Asia/Riyadh', weekStartsOn: 0 },
];

function habit(over: Partial<HabitDef> & Pick<HabitDef, 'id' | 'name'>): HabitDef {
  return {
    slug: over.id,
    targetText: null,
    frequency: 'daily',
    kind: 'tristate',
    sortOrder: 1,
    activeFrom: '2026-01-01',
    activeTo: null,
    items: [],
    ...over,
  };
}

const item = (id: string, activeTo: string | null = null) => ({
  id,
  name: id,
  sortOrder: 1,
  activeFrom: '2026-01-01',
  activeTo,
});

const habits: HabitDef[] = [
  // Listed out of order: the columns follow sort_order.
  habit({ id: 'new', name: 'ورد جديد', sortOrder: 3, activeFrom: '2026-11-25' }),
  habit({ id: 'fajr', name: 'الفجر', sortOrder: 1 }),
  habit({
    id: 'adhkar',
    name: 'الأذكار',
    kind: 'checklist',
    sortOrder: 2,
    // i3 ends on 2026-11-24: three items that day, two afterwards.
    items: [item('i1'), item('i2'), item('i3', '2026-11-24')],
  }),
  // Archived before the period: no column.
  habit({ id: 'old', name: 'عادة قديمة', sortOrder: 4, activeTo: '2026-10-01' }),
  habit({ id: 'weekly', name: 'حفظ الأسبوع', frequency: 'weekly', sortOrder: 1 }),
];

const people: ExportPerson[] = [
  { id: 'q', fullName: 'خالد', groupId: 'g2', joinedAt: '2026-11-26' },
  { id: 'p', fullName: 'أحمد', groupId: 'g1', joinedAt: '2026-01-01' },
];

function log(userId: string, periodStart: string, over: Partial<ExportLog> = {}): ExportLog {
  return {
    userId,
    periodStart,
    note: null,
    reviewText: null,
    supportRequestText: null,
    supportStatus: 'none',
    entries: [],
    ...over,
  };
}

const DAILY_HEADERS = [
  'الطالب',
  'المجموعة',
  'التاريخ',
  'التاريخ الهجري',
  'الفجر',
  'الأذكار',
  'ورد جديد',
  'نسبة اليوم',
  'الحالة',
  'الملاحظة',
];

describe('buildDailyReport', () => {
  const dailyLogs: ExportLog[] = [
    log('p', '2026-11-24', {
      note: 'ملاحظة اليوم',
      entries: [
        { habitId: 'fajr', status: 'done' },
        { habitId: 'adhkar', status: 'done', checkedItemIds: ['i1', 'i2'] },
      ],
    }),
    log('p', '2026-11-25', {
      entries: [
        { habitId: 'fajr', status: 'not_required' },
        { habitId: 'adhkar', status: 'not_required' },
        { habitId: 'new', status: 'not_required' },
      ],
    }),
    log('p', '2026-11-27', {
      entries: [
        { habitId: 'fajr', status: 'done' },
        // i3 is checked but no longer active: it does not count.
        { habitId: 'adhkar', status: 'done', checkedItemIds: ['i1', 'i2', 'i3'] },
        { habitId: 'new', status: 'not_done' },
      ],
    }),
  ];

  const report = buildDailyReport({
    people,
    groups,
    habits,
    logs: dailyLogs,
    from: '2026-11-24',
    to: '2026-11-28',
    settings: SETTINGS,
    now: NOW,
  });

  it('has the fixed columns and one column per daily habit active in the period, by sort order', () => {
    expect(report.headers).toEqual(DAILY_HEADERS);
  });

  it('one row per person per day up to today, from the day they joined, by group then name then date', () => {
    expect(report.rows.map((r) => [r['الطالب'], r['التاريخ']])).toEqual([
      ['أحمد', '2026-11-24'],
      ['أحمد', '2026-11-25'],
      ['أحمد', '2026-11-26'],
      ['أحمد', '2026-11-27'],
      ['خالد', '2026-11-26'],
      ['خالد', '2026-11-27'],
    ]);
  });

  it('a logged day: tristate words, n/m over the items active that day, the rounded %, the state and the note', () => {
    expect(report.rows[0]).toEqual({
      الطالب: 'أحمد',
      المجموعة: 'أ مجموعة الفجر',
      التاريخ: '2026-11-24',
      'التاريخ الهجري': toHijri('2026-11-24', 1).formatted,
      الفجر: 'تم',
      الأذكار: '2/3',
      // Not active yet on 2026-11-24.
      'ورد جديد': '',
      'نسبة اليوم': 83,
      الحالة: 'غير مُنجَز',
      الملاحظة: 'ملاحظة اليوم',
    });
  });

  it('a day with every habit not required is «بلا تكليف» with no %', () => {
    expect(report.rows[1]).toMatchObject({
      الفجر: 'غير مطلوب',
      الأذكار: 'غير مطلوب',
      'ورد جديد': 'غير مطلوب',
      'نسبة اليوم': null,
      الحالة: 'بلا تكليف',
    });
  });

  it('an unlogged day is «غير مسجَّل» with empty cells', () => {
    expect(report.rows[2]).toMatchObject({
      الفجر: '',
      الأذكار: '',
      'ورد جديد': '',
      'نسبة اليوم': null,
      الحالة: 'غير مسجَّل',
      الملاحظة: '',
    });
  });

  it('counts only the checklist items active on the day', () => {
    expect(report.rows[3]).toMatchObject({
      الفجر: 'تم',
      الأذكار: '2/2',
      'ورد جديد': 'لم يتم',
      'نسبة اليوم': 67,
      الحالة: 'غير مُنجَز',
    });
  });

  it('a habit name used twice gets a numbered second column instead of overwriting the first', () => {
    const twice = buildDailyReport({
      people: [],
      groups,
      habits: [habit({ id: 'a', name: 'الفجر', sortOrder: 1 }), habit({ id: 'b', name: 'الفجر', sortOrder: 2 })],
      logs: [],
      from: '2026-11-24',
      to: '2026-11-24',
      settings: SETTINGS,
      now: NOW,
    });
    expect(twice.headers.slice(4, 6)).toEqual(['الفجر', 'الفجر (2)']);
  });
});

describe('buildWeeklyReport', () => {
  const weeklyPeople: ExportPerson[] = [{ id: 'p', fullName: 'أحمد', groupId: 'g1', joinedAt: '2026-11-10' }];
  const weeklyLogs: ExportLog[] = [
    log('p', '2026-11-15', {
      reviewText: 'راجعت حفظي',
      supportRequestText: 'طلب قديم',
      supportStatus: 'handled',
      entries: [{ habitId: 'weekly', status: 'done' }],
    }),
    log('p', '2026-11-22', {
      supportRequestText: 'أحتاج مساعدة',
      supportStatus: 'open',
      entries: [{ habitId: 'weekly', status: 'not_done' }],
    }),
  ];
  const report = buildWeeklyReport({
    people: weeklyPeople,
    groups,
    habits,
    logs: weeklyLogs,
    from: '2026-11-01',
    to: '2026-11-30',
    settings: SETTINGS,
    now: NOW,
  });

  it('has the weekly columns with one per weekly habit', () => {
    expect(report.headers).toEqual([
      'الطالب',
      'المجموعة',
      'بداية الأسبوع',
      'الهجري',
      'حفظ الأسبوع',
      'النسبة',
      'الحالة',
      'المراجعة',
      'طلب الدعم',
      'حالة الطلب',
    ]);
  });

  it('one row per week starting in the period, from the week they joined, up to the current week', () => {
    expect(report.rows.map((r) => r['بداية الأسبوع'])).toEqual(['2026-11-08', '2026-11-15', '2026-11-22']);
  });

  it('an unlogged week, a handled request and an open one', () => {
    expect(report.rows[0]).toMatchObject({
      'حفظ الأسبوع': '',
      النسبة: null,
      الحالة: 'غير مسجَّل',
      المراجعة: '',
      'طلب الدعم': '',
      'حالة الطلب': '',
    });
    expect(report.rows[1]).toEqual({
      الطالب: 'أحمد',
      المجموعة: 'أ مجموعة الفجر',
      'بداية الأسبوع': '2026-11-15',
      الهجري: toHijri('2026-11-15', 1).formatted,
      'حفظ الأسبوع': 'تم',
      النسبة: 100,
      الحالة: 'مُنجَز',
      المراجعة: 'راجعت حفظي',
      'طلب الدعم': 'طلب قديم',
      'حالة الطلب': 'معالَج',
    });
    expect(report.rows[2]).toMatchObject({
      'حفظ الأسبوع': 'لم يتم',
      النسبة: 0,
      الحالة: 'غير مُنجَز',
      المراجعة: '',
      'طلب الدعم': 'أحتاج مساعدة',
      'حالة الطلب': 'مفتوح',
    });
  });

  it('a logged week without a request shows «—»', () => {
    const quiet = buildWeeklyReport({
      people: weeklyPeople,
      groups,
      habits,
      logs: [log('p', '2026-11-08', { entries: [{ habitId: 'weekly', status: 'done' }] })],
      from: '2026-11-08',
      to: '2026-11-14',
      settings: SETTINGS,
      now: NOW,
    });
    expect(quiet.rows).toHaveLength(1);
    expect(quiet.rows[0]).toMatchObject({ 'حالة الطلب': '—', الحالة: 'مُنجَز' });
  });
});

describe('buildAttendanceReport', () => {
  const report = buildAttendanceReport({
    sessions: [
      { id: 's1', date: '2026-11-10', title: 'درس الفقه' },
      { id: 's2', date: '2026-11-03', title: null },
    ],
    marks: [
      { sessionId: 's1', userId: 'q', status: 'absent', recordedBy: 'hidden-admin' },
      { sessionId: 's1', userId: 'p', status: 'present', recordedBy: 'sup' },
      { sessionId: 's2', userId: 'p', status: 'excused', recordedBy: null },
    ],
    people: [
      { id: 'p', fullName: 'أحمد', groupId: 'g1' },
      { id: 'q', fullName: 'خالد', groupId: 'g2' },
      { id: 'sup', fullName: 'المشرف', groupId: 'g1' },
    ],
    groups,
    settings: SETTINGS,
  });

  it('has the attendance columns', () => {
    expect(report.headers).toEqual(['الطالب', 'المجموعة', 'تاريخ المجلس', 'الهجري', 'عنوان المجلس', 'الحالة', 'سجّله']);
  });

  it('one row per mark, by session date then group then name, with the recorder when the viewer may see them', () => {
    expect(report.rows).toEqual([
      {
        الطالب: 'أحمد',
        المجموعة: 'أ مجموعة الفجر',
        'تاريخ المجلس': '2026-11-03',
        الهجري: toHijri('2026-11-03', 1).formatted,
        'عنوان المجلس': '',
        الحالة: 'معذور',
        سجّله: '',
      },
      {
        الطالب: 'أحمد',
        المجموعة: 'أ مجموعة الفجر',
        'تاريخ المجلس': '2026-11-10',
        الهجري: toHijri('2026-11-10', 1).formatted,
        'عنوان المجلس': 'درس الفقه',
        الحالة: 'حاضر',
        سجّله: 'المشرف',
      },
      {
        الطالب: 'خالد',
        المجموعة: 'ب مجموعة العصر',
        'تاريخ المجلس': '2026-11-10',
        الهجري: toHijri('2026-11-10', 1).formatted,
        'عنوان المجلس': 'درس الفقه',
        الحالة: 'غائب',
        سجّله: '',
      },
    ]);
  });
});
