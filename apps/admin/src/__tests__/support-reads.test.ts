import type { TypedClient } from '@awrad/supabase-client';
import { describe, expect, it } from 'vitest';

import { listSupportRequests } from '@/lib/supabase/support';

type Row = Record<string, unknown>;

/** A stand-in for the PostgREST builder (select/eq/gte/in/order/range), recording the columns each table was asked for. */
function fakeClient(tables: Record<string, Row[]>) {
  const selects: Record<string, string> = {};
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        select(columns: string) {
          selects[table] = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        gte: () => builder,
        order: () => builder,
        range: () => builder,
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        then(resolve: (r: { data: Row[]; error: null }) => unknown) {
          const data = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  // why: only the calls listSupportRequests makes are faked; the cast stands in for the full typed client.
  return { client: client as unknown as TypedClient, selects };
}

const log = (id: string, status: 'open' | 'handled', handledBy: string | null) => ({
  id,
  user_id: 'p1',
  period: 'weekly',
  period_start: '2026-11-22',
  review_text: null,
  support_request_text: 'أحتاج مساعدة',
  support_status: status,
  handled_by: handledBy,
  handled_at: handledBy ? '2026-11-25T10:00:00Z' : null,
});

const tables = {
  logs: [log('l1', 'handled', 'sup1'), log('l2', 'handled', 'sup1'), log('l3', 'open', null)],
  profiles: [
    { id: 'p1', full_name: 'طالب', group_id: 'g1' },
    { id: 'sup1', full_name: 'مشرف', group_id: 'g1' },
  ],
  groups: [{ id: 'g1', name: 'المجموعة الأولى' }],
  support_notes: [{ log_id: 'l1', note: 'ملاحظة للطاقم' }],
};

describe('listSupportRequests (Ruling FIN-8: the internal note is read from support_notes)', () => {
  it('takes the note of each handled request from the staff-only table, not from logs', async () => {
    const { client, selects } = fakeClient(tables);
    const rows = await listSupportRequests(client, 'handled', new Date('2026-11-27T00:00:00Z'));
    expect(rows.map((row) => [row.id, row.handledNote, row.handledByName])).toEqual([
      ['l1', 'ملاحظة للطاقم', 'مشرف'],
      ['l2', null, 'مشرف'],
    ]);
    expect(selects.logs).not.toContain('handled_note');
  });

  it('open requests carry no note and do not ask for any', async () => {
    const { client, selects } = fakeClient(tables);
    const rows = await listSupportRequests(client, 'open');
    expect(rows.map((row) => [row.id, row.handledNote])).toEqual([['l3', null]]);
    expect(selects.support_notes).toBeUndefined();
  });
});
