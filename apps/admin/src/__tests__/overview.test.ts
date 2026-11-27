import { describe, expect, it } from 'vitest';

import {
  assembleRows,
  chunk,
  computeKpis,
  isInactive,
  mapWithConcurrency,
  periodDates,
  type DayCell,
  type GroupDays,
} from '@/lib/overview';

// Thursday 26 November 2026 (DESIGN.md §8 sample data).
const TODAY = '2026-11-26';

function cellsFrom(states: Record<string, DayCell['state']>, today = TODAY): DayCell[] {
  return periodDates(today, 14).map((date) => ({ date, state: states[date] ?? 'missing' }));
}

function group(id: string, name: string, weekStartsOn = 0, timezone = 'Asia/Riyadh') {
  return { id, name, timezone, weekStartsOn };
}

interface Person {
  id: string;
  name: string;
  logged?: Record<string, DayCell['state']>;
}

/** The rows get_group_overview returns: one per person per day, `missing` filled in. */
function entries(people: Person[], today = TODAY) {
  return people.flatMap((p) =>
    periodDates(today, 14).map((date) => ({ userId: p.id, fullName: p.name, date, state: p.logged?.[date] ?? 'missing' })),
  );
}

describe('periodDates', () => {
  it('is the 14 local days ending today, oldest first', () => {
    const dates = periodDates(TODAY, 14);
    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe('2026-11-13');
    expect(dates[13]).toBe(TODAY);
  });
});

describe('isInactive (منقطعون ≥3 أيام, Ruling INACTIVE-1)', () => {
  it('is true when the three days before today and today are all unlogged', () => {
    expect(isInactive(cellsFrom({ '2026-11-22': 'achieved' }), TODAY)).toBe(true);
  });

  it('logging today after three silent days clears it', () => {
    expect(isInactive(cellsFrom({ '2026-11-22': 'achieved', [TODAY]: 'failed' }), TODAY)).toBe(false);
  });

  it('an unlogged today with a logged yesterday is not inactive', () => {
    expect(isInactive(cellsFrom({ '2026-11-25': 'failed' }), TODAY)).toBe(false);
  });

  it('any logged state among the three days breaks it (neutral counts as logged)', () => {
    expect(isInactive(cellsFrom({ '2026-11-23': 'neutral' }), TODAY)).toBe(false);
    expect(isInactive(cellsFrom({ '2026-11-24': 'failed' }), TODAY)).toBe(false);
  });

  it('two unlogged days are not enough', () => {
    expect(isInactive(cellsFrom({ '2026-11-23': 'achieved' }), TODAY)).toBe(false);
  });

  it('days before joining are not silence: joined 2 days ago with no logs is not inactive', () => {
    expect(isInactive(cellsFrom({}), TODAY, '2026-11-24')).toBe(false);
  });

  it('joined exactly three completed days ago with nothing logged is inactive', () => {
    expect(isInactive(cellsFrom({}), TODAY, '2026-11-23')).toBe(true);
  });

  it('joined 10 days ago, the last three completed days and today unlogged: inactive', () => {
    expect(isInactive(cellsFrom({ '2026-11-20': 'achieved' }), TODAY, '2026-11-16')).toBe(true);
  });
});

describe('assembleRows', () => {
  it('builds one row per person with 14 cells, missing days filled in, and the inactive flag', () => {
    const rows = assembleRows(
      [
        {
          group: group('g1', 'مجموعة الفجر'),
          today: TODAY,
          entries: entries([{ id: 'u1', name: 'أحمد', logged: { '2026-11-25': 'achieved' } }]).filter(
            // A day the RPC did not return still becomes a cell.
            (e) => e.date !== '2026-11-14',
          ),
        },
      ],
      14,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells).toHaveLength(14);
    expect(rows[0]!.cells[1]).toEqual({ date: '2026-11-14', state: 'missing' });
    expect(rows[0]!.cells[12]).toEqual({ date: '2026-11-25', state: 'achieved' });
    expect(rows[0]!.groupName).toBe('مجموعة الفجر');
    expect(rows[0]!.inactive).toBe(false);
  });

  it("'all' merges the groups sorted by group name, then by name, each on its own today", () => {
    const later = '2026-11-27';
    const input: GroupDays[] = [
      { group: group('g2', 'مجموعة العصر'), today: TODAY, entries: entries([{ id: 'b', name: 'خالد' }, { id: 'a', name: 'بلال' }]) },
      {
        group: group('g1', 'مجموعة الأولى', 0, 'Pacific/Kiritimati'),
        today: later,
        entries: entries([{ id: 'c', name: 'يوسف' }, { id: 'd', name: 'إبراهيم' }], later),
      },
    ];
    const rows = assembleRows(input, 14);
    expect(rows.map((r) => r.fullName)).toEqual(['إبراهيم', 'يوسف', 'بلال', 'خالد']);
    expect(rows[0]!.cells.at(-1)!.date).toBe(later);
    expect(rows[2]!.cells.at(-1)!.date).toBe(TODAY);
  });
});

describe('assembleRows with joined dates', () => {
  it('uses each person\'s joined_at for the inactive flag', () => {
    const rows = assembleRows(
      [{ group: group('g', 'س'), today: TODAY, entries: entries([{ id: 'new', name: 'جديد' }, { id: 'old', name: 'قديم' }]) }],
      14,
      new Map([
        ['new', '2026-11-25'],
        ['old', '2026-10-01'],
      ]),
    );
    expect(rows.map((r) => [r.userId, r.inactive])).toEqual([
      ['new', false],
      ['old', true],
    ]);
  });
});

describe('computeKpis', () => {
  // Thursday 26 Nov: a Sunday week starts on the 22nd, a Monday week on the 23rd.
  const people: Person[] = [
    { id: 'a', name: 'أحمد', logged: { '2026-11-22': 'achieved' } },
    { id: 'b', name: 'بلال', logged: { '2026-11-24': 'failed' } },
  ];

  it('«سجّلوا هذا الأسبوع» counts a log from the group week start (Sunday)', () => {
    const rows = assembleRows([{ group: group('g', 'س', 0), today: TODAY, entries: entries(people) }], 14);
    expect(computeKpis(rows, 0).loggedThisWeekPct).toBe(100);
  });

  it('«سجّلوا هذا الأسبوع» leaves out the day before a Monday week start', () => {
    const rows = assembleRows([{ group: group('g', 'س', 1), today: TODAY, entries: entries(people) }], 14);
    expect(computeKpis(rows, 0).loggedThisWeekPct).toBe(50);
  });

  it('rounds the share to a whole percent', () => {
    const three = [...people, { id: 'c', name: 'جابر' }];
    const rows = assembleRows([{ group: group('g', 'س', 1), today: TODAY, entries: entries(three) }], 14);
    expect(computeKpis(rows, 0).loggedThisWeekPct).toBe(33);
  });

  it('counts the inactive rows and passes the open support count through', () => {
    const rows = assembleRows([{ group: group('g', 'س', 0), today: TODAY, entries: entries([...people, { id: 'c', name: 'جابر' }]) }], 14);
    // a (last log on the 22nd) and c (never) are inactive; b logged on the 24th.
    expect(computeKpis(rows, 2)).toEqual({ loggedThisWeekPct: 67, inactive3DaysCount: 2, openSupportCount: 2 });
  });

  it('is null, not 0%, when nobody is shown', () => {
    expect(computeKpis([], 0)).toEqual({ loggedThisWeekPct: null, inactive3DaysCount: 0, openSupportCount: 0 });
  });
});

describe('mapWithConcurrency', () => {
  it('keeps the input order and never runs more than the cap at once', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 4, 2, 3, 0, 6, 7, 8, 9], 3, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, n));
      running -= 1;
      return n * 2;
    });
    expect(out).toEqual([10, 2, 8, 4, 6, 0, 12, 14, 16, 18]);
    expect(peak).toBe(3);
  });
});

describe('chunk', () => {
  it('splits ids into slices of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 200)).toEqual([]);
  });
});
