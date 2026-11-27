import { describe, expect, it } from 'vitest';

import {
  appSettingsFrom,
  DEFAULT_SETTINGS,
  parseAppSettingsForm,
  parseGroup,
  PRIORITY_TIMEZONES,
  timezoneOptions,
  type AppSettings,
  type GroupField,
  type GroupInput,
} from '@/lib/settings';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

function form(values: Partial<Record<keyof AppSettings, string>>): FormData {
  const data = new FormData();
  const all: Record<keyof AppSettings, string> = {
    streak_threshold_pct: '100',
    backfill_days: '2',
    weekly_grace_days: '3',
    hijri_adjustment_days: '0',
    excused_counts_as_absent: 'false',
    default_reminder_time: '21:00',
    ...values,
  };
  for (const [key, value] of Object.entries(all)) data.set(key, value);
  return data;
}

describe('parseAppSettingsForm', () => {
  it('reads the six fields as numbers, a boolean and a time', () => {
    expect(parseAppSettingsForm(form({ backfill_days: ' 5 ', excused_counts_as_absent: 'true' }))).toEqual({
      ok: true,
      value: { ...DEFAULT_SETTINGS, backfill_days: 5, excused_counts_as_absent: true },
    });
  });

  it('accepts each range at both edges', () => {
    const low = parseAppSettingsForm(
      form({ streak_threshold_pct: '50', backfill_days: '0', weekly_grace_days: '0', hijri_adjustment_days: '-2' }),
    );
    const high = parseAppSettingsForm(
      form({ streak_threshold_pct: '100', backfill_days: '14', weekly_grace_days: '7', hijri_adjustment_days: '2' }),
    );
    expect(low.ok && high.ok).toBe(true);
  });

  it.each([
    ['streak_threshold_pct', '49'],
    ['streak_threshold_pct', '101'],
    ['streak_threshold_pct', '75.5'],
    ['backfill_days', '-1'],
    ['backfill_days', '15'],
    ['backfill_days', ''],
    ['backfill_days', 'خمسة'],
    ['weekly_grace_days', '8'],
    ['hijri_adjustment_days', '-3'],
    ['hijri_adjustment_days', '3'],
    ['default_reminder_time', '24:00'],
    ['default_reminder_time', '9:00'],
    ['default_reminder_time', '21:60'],
    ['default_reminder_time', ''],
  ] as const)('%s = «%s» is invalid and named', (field, value) => {
    expect(parseAppSettingsForm(form({ [field]: value }))).toEqual({ ok: false, fields: [field] });
  });

  it('names every invalid field, in the form order', () => {
    expect(parseAppSettingsForm(form({ default_reminder_time: 'x', streak_threshold_pct: '0' }))).toEqual({
      ok: false,
      fields: ['streak_threshold_pct', 'default_reminder_time'],
    });
  });
});

describe('appSettingsFrom', () => {
  it('maps app_settings rows, falling back to the defaults for a missing or malformed value', () => {
    expect(
      appSettingsFrom([
        { key: 'backfill_days', value: 5 },
        { key: 'excused_counts_as_absent', value: true },
        { key: 'default_reminder_time', value: '20:30' },
        { key: 'streak_threshold_pct', value: 'oops' },
      ]),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      backfill_days: 5,
      excused_counts_as_absent: true,
      default_reminder_time: '20:30',
    });
  });
});

describe('timezoneOptions', () => {
  it('lists the region zones first, in their order, then the rest alphabetically without repeats', () => {
    const options = timezoneOptions(['Europe/London', 'Asia/Dubai', 'America/New_York', 'Asia/Riyadh', 'Africa/Abidjan']);
    expect(options.slice(0, PRIORITY_TIMEZONES.length)).toEqual([...PRIORITY_TIMEZONES]);
    expect(PRIORITY_TIMEZONES).toEqual([
      'Asia/Riyadh',
      'Asia/Amman',
      'Asia/Hebron',
      'Asia/Jerusalem',
      'Asia/Dubai',
      'Africa/Cairo',
      'Asia/Istanbul',
    ]);
    expect(options.slice(PRIORITY_TIMEZONES.length)).toEqual(['Africa/Abidjan', 'America/New_York', 'Europe/London']);
  });
});

describe('parseGroup', () => {
  const timezones = timezoneOptions(['Europe/London']);
  const valid: GroupInput = { id: null, name: '  مجموعة الفجر ', timezone: 'Asia/Amman', weekStartsOn: 1, supervisorIds: [S1] };

  it('trims the name and removes duplicate supervisor ids', () => {
    expect(parseGroup({ ...valid, supervisorIds: [S1, S2, S1] }, { timezones })).toEqual({
      ok: true,
      value: { ...valid, name: 'مجموعة الفجر', supervisorIds: [S1, S2] },
    });
  });

  it('allows no supervisors and an existing id', () => {
    expect(parseGroup({ ...valid, id: S2, supervisorIds: [] }, { timezones }).ok).toBe(true);
  });

  it.each([
    ['name', { name: '   ' }],
    ['timezone', { timezone: 'Mars/Olympus' }],
    ['week_starts_on', { weekStartsOn: 7 }],
    ['week_starts_on', { weekStartsOn: -1 }],
    ['week_starts_on', { weekStartsOn: 1.5 }],
    ['supervisor_ids', { supervisorIds: ['not-a-uuid'] }],
  ] satisfies Array<[GroupField, Partial<GroupInput>]>)('an invalid %s is named', (field, patch) => {
    expect(parseGroup({ ...valid, ...patch }, { timezones })).toEqual({ ok: false, fields: [field] });
  });

  it('a supervisor outside the candidates is refused when the candidates are given', () => {
    expect(parseGroup(valid, { timezones, candidates: [S2] })).toEqual({ ok: false, fields: ['supervisor_ids'] });
    expect(parseGroup(valid, { timezones, candidates: [S1] }).ok).toBe(true);
  });

  it('a name another group uses (ignoring case and spaces) is reported as name_taken', () => {
    expect(parseGroup({ ...valid, name: ' g1 ' }, { timezones, takenNames: ['G1'] })).toEqual({
      ok: false,
      fields: ['name_taken'],
    });
  });
});
