import { describe, expect, it } from 'vitest';

import { exportFilename, parseExportQuery, periodProblem, reportPresets } from '@/lib/export-query';

const GROUP = '11111111-1111-4111-8111-111111111111';

function parse(query: string) {
  return parseExportQuery(new URLSearchParams(query));
}

describe('parseExportQuery', () => {
  it('reads kind, from, to and a group id', () => {
    expect(parse(`kind=weekly&from=2026-11-01&to=2026-11-30&group=${GROUP}`)).toEqual({
      ok: true,
      data: { kind: 'weekly', from: '2026-11-01', to: '2026-11-30', group: GROUP },
    });
  });

  it('defaults the group to all (missing or empty)', () => {
    expect(parse('kind=daily&from=2026-11-01&to=2026-11-01')).toEqual({
      ok: true,
      data: { kind: 'daily', from: '2026-11-01', to: '2026-11-01', group: 'all' },
    });
    expect(parse('kind=attendance&from=2026-11-01&to=2026-11-02&group=')).toMatchObject({ ok: true, data: { group: 'all' } });
  });

  it.each([
    ['an unknown kind', 'kind=monthly&from=2026-11-01&to=2026-11-30'],
    ['no kind', 'from=2026-11-01&to=2026-11-30'],
    ['no from', 'kind=daily&to=2026-11-30'],
    ['a date in another format', 'kind=daily&from=01/11/2026&to=2026-11-30'],
    ['a day that does not exist', 'kind=daily&from=2026-02-30&to=2026-03-01'],
    ['month 13', 'kind=daily&from=2026-13-01&to=2026-12-31'],
    ['from after to', 'kind=daily&from=2026-11-30&to=2026-11-01'],
    ['a range longer than 366 days', 'kind=daily&from=2025-01-01&to=2026-01-02'],
    ['a group that is not a uuid', 'kind=daily&from=2026-11-01&to=2026-11-30&group=g1'],
  ])('rejects %s', (_, query) => {
    expect(parse(query)).toEqual({ ok: false });
  });

  it('accepts exactly 366 days (a leap year)', () => {
    expect(parse('kind=daily&from=2028-01-01&to=2028-12-31')).toMatchObject({ ok: true });
  });
});

describe('periodProblem', () => {
  it.each([
    ['2026-11-01', '2026-11-30', null],
    ['', '2026-11-30', 'dates'],
    ['2026-11-31', '2026-12-01', 'dates'],
    ['2026-11-30', '2026-11-01', 'order'],
    ['2025-11-01', '2026-11-02', 'range'],
  ] as const)('%s – %s → %s', (from, to, expected) => {
    expect(periodProblem(from, to)).toBe(expected);
  });
});

describe('exportFilename', () => {
  it('is awrad-<kind>-<from>_<to>.csv', () => {
    expect(exportFilename({ kind: 'daily', from: '2026-11-01', to: '2026-11-30' })).toBe(
      'awrad-daily-2026-11-01_2026-11-30.csv',
    );
  });
});

describe('reportPresets', () => {
  it('this month, last month and the last 30 days, from today', () => {
    expect(reportPresets('2026-11-27')).toEqual({
      thisMonth: { from: '2026-11-01', to: '2026-11-30' },
      lastMonth: { from: '2026-10-01', to: '2026-10-31' },
      last30: { from: '2026-10-29', to: '2026-11-27' },
    });
  });

  it('last month crosses the year in January', () => {
    expect(reportPresets('2027-01-05').lastMonth).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});
