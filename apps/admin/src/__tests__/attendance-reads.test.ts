import type { TypedClient } from '@awrad/supabase-client';
import { describe, expect, it } from 'vitest';

import { listSessionMembers } from '@/lib/supabase/attendance';
import { fetchAllPages, PAGE_SIZE } from '@/lib/supabase/postgrest';

type Row = Record<string, unknown>;

/**
 * A stand-in for the PostgREST builder: from(table) → select/order/eq/in chain, awaited as { data }.
 * It applies eq/in filters to the table's rows and records every `.in()` it was asked for.
 */
function fakeClient(tables: Record<string, Row[]>) {
  const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        select: () => builder,
        order: () => builder,
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          inCalls.push({ table, column, values });
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        then(resolve: (r: { data: Row[]; error: null }) => unknown) {
          return Promise.resolve({ data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  // why: only the calls listSessionMembers makes are faked; the cast stands in for the full typed client.
  return { client: client as unknown as TypedClient, inCalls };
}

const G1 = { id: 'g1', name: 'أ المجموعة الأولى', timezone: 'Asia/Riyadh', week_starts_on: 0 };
const G2 = { id: 'g2', name: 'ب المجموعة الثانية', timezone: 'Asia/Riyadh', week_starts_on: 0 };
const person = (id: string, group: string) => ({ id, full_name: id, group_id: group, is_tracked: true, is_active: true });
const tables = {
  groups: [G1, G2],
  group_supervisors: [{ group_id: 'g2', user_id: 'sup2' }],
  // What RLS lets an admin read; the narrowing below must not rely on RLS alone.
  profiles: [person('p1', 'g1'), person('p2', 'g2'), { ...person('gone', 'g2'), is_active: false }],
};
const shared = { id: 's1', groupId: null, groupName: null, date: '2026-11-27', title: null };

describe('listSessionMembers', () => {
  it('a shared session: the admin marks every group', async () => {
    const { client } = fakeClient(tables);
    const result = await listSessionMembers(client, shared, { id: 'a1', role: 'admin' });
    expect(result.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(result.members.map((m) => m.id)).toEqual(['p1', 'p2']);
  });

  it('a shared session: a supervisor marks only the groups they supervise, and asks for no one else', async () => {
    const { client, inCalls } = fakeClient(tables);
    const result = await listSessionMembers(client, shared, { id: 'sup2', role: 'supervisor' });
    expect(result.groups.map((g) => g.id)).toEqual(['g2']);
    expect(result.members.map((m) => m.id)).toEqual(['p2']);
    expect(inCalls).toEqual([{ table: 'profiles', column: 'group_id', values: ['g2'] }]);
  });

  it('a group session the supervisor does not supervise has no group to mark', async () => {
    const { client } = fakeClient(tables);
    const result = await listSessionMembers(client, { ...shared, groupId: 'g1' }, { id: 'sup2', role: 'supervisor' });
    expect(result).toEqual({ groups: [], members: [] });
  });
});

describe('fetchAllPages', () => {
  it('keeps asking for the next range until a short page, past PostgREST max_rows', async () => {
    const total = PAGE_SIZE * 2 + 5;
    const ranges: Array<[number, number]> = [];
    const rows = await fetchAllPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i), error: null };
    });
    expect(rows).toHaveLength(total);
    expect(ranges).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ]);
  });

  it('throws the error of a failed page', async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom');
  });
});
