import { describe, expect, it } from 'vitest';

import {
  defaultSwitchDate,
  habitErrorText,
  moveId,
  parseArchiveDate,
  parseHabitPatch,
  parseIds,
  parseItemName,
  parseNewHabit,
  parseReplacement,
  replacementPayload,
  sortOrderPayload,
  splitArchived,
  type NewHabit,
} from '@/lib/habits';
import { ar } from '@/messages/ar';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const TODAY = '2026-11-27';

const habit: NewHabit = {
  name: '  عادة  ',
  description: '',
  target_text: 'هدف',
  frequency: 'weekly',
  kind: 'tristate',
  active_from: TODAY,
  items: ['ignored'],
};

describe('parseNewHabit', () => {
  it('trims, turns empty texts into null and drops items of a tristate habit', () => {
    expect(parseNewHabit(habit, TODAY)).toEqual({
      ok: true,
      value: { ...habit, name: 'عادة', description: null, items: [] },
    });
  });

  it('needs a name, a known frequency and kind, and a start from today on', () => {
    const result = parseNewHabit(
      // why: the form posts strings; a bad frequency/kind must be rejected at runtime.
      { ...habit, name: ' ', frequency: 'monthly' as never, kind: 'x' as never, active_from: '2026-11-26' },
      TODAY,
    );
    expect(result).toEqual({ ok: false, fields: ['name', 'frequency', 'kind', 'active_from'] });
  });

  it('a checklist needs at least one non-empty item, kept in order', () => {
    expect(parseNewHabit({ ...habit, kind: 'checklist', items: [' ', ''] }, TODAY)).toEqual({
      ok: false,
      fields: ['items'],
    });
    const parsed = parseNewHabit({ ...habit, kind: 'checklist', items: ['ب', ' ', 'أ '] }, TODAY);
    expect(parsed.ok && parsed.value.items).toEqual(['ب', 'أ']);
  });
});

describe('parseHabitPatch', () => {
  it('keeps only the fields sent: renaming leaves the target alone', () => {
    expect(parseHabitPatch(ID, { name: ' اسم جديد ' })).toEqual({
      ok: true,
      value: { id: ID, patch: { name: 'اسم جديد' } },
    });
    expect(parseHabitPatch(ID, { target_text: '' })).toEqual({
      ok: true,
      value: { id: ID, patch: { target_text: null } },
    });
  });

  it('rejects an empty name, a bad id or an empty patch', () => {
    expect(parseHabitPatch(ID, { name: '  ' })).toEqual({ ok: false, fields: ['name'] });
    expect(parseHabitPatch('x', { name: 'a' }).ok).toBe(false);
    expect(parseHabitPatch(ID, {}).ok).toBe(false);
  });
});

describe('parseReplacement', () => {
  const values = { name: 'جديدة', description: null, target_text: ' ', items: [], switch_date: '2026-12-01' };

  it('requires a name and a start date', () => {
    expect(parseReplacement({ ...values, name: '', switch_date: '' }, 'tristate')).toEqual({
      ok: false,
      fields: ['name', 'date'],
    });
  });

  it('a checklist replacement needs items; the payload numbers them 1..n', () => {
    expect(parseReplacement(values, 'checklist')).toEqual({ ok: false, fields: ['items'] });
    const parsed = parseReplacement({ ...values, items: ['أ', 'ب'] }, 'checklist');
    expect(parsed.ok && replacementPayload(parsed.value)).toEqual({
      name: 'جديدة',
      description: null,
      target_text: null,
      items: [
        { name: 'أ', sort_order: 1 },
        { name: 'ب', sort_order: 2 },
      ],
    });
  });

  it('a tristate replacement sends no items', () => {
    const parsed = parseReplacement({ ...values, items: ['أ'] }, 'tristate');
    expect(parsed.ok && replacementPayload(parsed.value)).toEqual({ name: 'جديدة', description: null, target_text: null });
  });

  it('defaults the start to the day after today', () => {
    expect(defaultSwitchDate('2026-11-30')).toBe('2026-12-01');
  });
});

describe('parseArchiveDate / parseItemName / parseIds', () => {
  it('an archive date is today or later', () => {
    expect(parseArchiveDate(ID, TODAY, TODAY).ok).toBe(true);
    expect(parseArchiveDate(ID, '2026-12-05', TODAY).ok).toBe(true);
    expect(parseArchiveDate(ID, '2026-11-26', TODAY)).toEqual({ ok: false, fields: ['date'] });
  });

  it('an item needs a name', () => {
    expect(parseItemName(ID, ' بند ')).toEqual({ ok: true, value: { id: ID, name: 'بند' } });
    expect(parseItemName(ID, '')).toEqual({ ok: false, fields: ['name'] });
  });

  it('a reorder lists uuids, each once', () => {
    expect(parseIds([ID, ID2])).toEqual([ID, ID2]);
    expect(parseIds([ID, ID])).toBeNull();
    expect(parseIds([])).toBeNull();
    expect(parseIds(['x'])).toBeNull();
  });
});

describe('reorder helpers', () => {
  it('turns ids into sort_order 1..n', () => {
    expect(sortOrderPayload(['c', 'a', 'b'])).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'a', sort_order: 2 },
      { id: 'b', sort_order: 3 },
    ]);
  });

  it('moves an id to the place of the one it was dropped on', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 'b')).toEqual(['a', 'c', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(moveId(['a', 'b'], 'a', 'zz')).toEqual(['a', 'b']);
  });

  it('splits active rows by sort order from archived ones, latest end first', () => {
    const rows = [
      { id: 'x', sortOrder: 2, activeTo: null },
      { id: 'y', sortOrder: 1, activeTo: '2026-01-01' },
      { id: 'z', sortOrder: 1, activeTo: null },
      { id: 'w', sortOrder: 3, activeTo: '2026-06-01' },
    ];
    const { active, archived } = splitArchived(rows);
    expect(active.map((r) => r.id)).toEqual(['z', 'x']);
    expect(archived.map((r) => r.id)).toEqual(['w', 'y']);
  });
});

describe('habitErrorText', () => {
  it('maps every code through ar.habits.errors', () => {
    expect(habitErrorText({ ok: false, code: 'HABIT_HAS_LOGS' })).toBe(ar.habits.errors.HABIT_HAS_LOGS);
    expect(habitErrorText({ ok: true })).toBeNull();
  });
});
