import { readFileSync } from 'node:fs';
import type { EntryInput, HabitDef, HabitItemDef } from '../types';

const id = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

export function loadFixture<T>(name: string): T {
  const url = new URL(`../../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

export interface FixtureEntry {
  slug: string;
  status?: 'done' | 'not_done' | 'not_required';
  checkedCount?: number;
}

const items: HabitItemDef[] = Array.from({ length: 13 }, (_, i) => ({
  id: id(String(101 + i)),
  name: `item-${i + 1}`,
  sortOrder: i + 1,
  activeFrom: '2020-01-01',
  activeTo: null,
}));

const base = { targetText: null, frequency: 'daily' as const, activeFrom: '2020-01-01', activeTo: null };

export const catalogue: HabitDef[] = [
  { ...base, id: id('a1'), slug: 'quran_wird', name: 'h1', kind: 'tristate', sortOrder: 1, items: [] },
  { ...base, id: id('a2'), slug: 'adhkar', name: 'h2', kind: 'checklist', sortOrder: 2, items },
  { ...base, id: id('a3'), slug: 'qiyam', name: 'h3', kind: 'tristate', sortOrder: 3, items: [] },
  { ...base, id: id('a4'), slug: 'tafsir_ibn_juzayy', name: 'h4', kind: 'tristate', sortOrder: 4, items: [] },
  { ...base, id: id('a5'), slug: 'sahihayn', name: 'h5', kind: 'tristate', sortOrder: 5, items: [] },
];

export function toEntries(fixtureEntries: FixtureEntry[]): EntryInput[] {
  return fixtureEntries.map((e) => {
    const habit = catalogue.find((h) => h.slug === e.slug);
    if (!habit) throw new Error(`unknown slug ${e.slug}`);
    if (e.checkedCount !== undefined) {
      const checked = [...habit.items].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, e.checkedCount);
      return {
        habitId: habit.id,
        status: checked.length === habit.items.length ? 'done' : 'not_done',
        checkedItemIds: checked.map((i) => i.id),
      };
    }
    if (!e.status) throw new Error(`entry ${e.slug} has neither status nor checkedCount`);
    return { habitId: habit.id, status: e.status };
  });
}
