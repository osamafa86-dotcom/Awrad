import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { adminDb } from './helpers';

// Final review db minor (deferred 1.5): a bare is_admin() / auth.uid() in a policy is evaluated once per row; wrapped
// as (select …) the planner runs it once per statement as an InitPlan (measured 5.6 s → 0.8 s on 234k
// log_entry_items). Semantics are unchanged, so the RLS suites must stay green; this test pins the form.
// is_supervisor_of(<column>) depends on the row and cannot be hoisted, so it is not part of the rule.

let db: pg.Client;

beforeAll(async () => {
  db = await adminDb();
});

afterAll(async () => {
  await db.end();
});

describe('0018_policy_initplan', () => {
  test('every is_admin() and auth.uid() in a public policy is wrapped in a scalar subquery', async () => {
    const policies = await db.query<{ table: string; policy: string; expr: string }>(
      `select tablename as table, policyname as policy, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
         from pg_policies where schemaname = 'public'`,
    );
    expect(policies.rows.length).toBeGreaterThan(40);
    const bare = policies.rows.filter(({ expr }) => /(?<!SELECT )(is_admin|auth\.uid)\(\)/.test(expr));
    expect(bare.map(({ table, policy }) => `${table}.${policy}`)).toEqual([]);
  });

  test('an admin read over log_entry_items plans is_admin() as an InitPlan', async () => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query(
        `select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true)`,
      );
      const plan = await db.query<{ 'QUERY PLAN': string }>('explain select count(*) from log_entry_items');
      const text = plan.rows.map((row) => row['QUERY PLAN']).join('\n');
      expect(text).toMatch(/InitPlan/);
    } finally {
      await db.query('rollback');
    }
  });
});
