// Low-level building blocks for running SQL "as" an authenticated Supabase user over plain `pg`.
// Mirrors what PostgREST does per request: a transaction with `role authenticated` and JWT claims.
import type pg from 'pg';

const IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * Runs one statement inside its own transaction as the given auth user:
 * BEGIN; SET LOCAL ROLE authenticated; set request.jwt.claims; <statement>; COMMIT.
 * On error it rolls back and rethrows the original pg error (assert on `message`, e.g. 'FORBIDDEN').
 */
export async function queryAsUser<T extends pg.QueryResultRow>(
  client: pg.Client,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    const result = await client.query<T>(sql, params);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

/**
 * Builds `select * from <fn>(k1 => $1, k2 => $2, ...)` for a function call with named arguments.
 * `fn` may be schema-qualified (`public.is_admin`); names are validated, values are always bound.
 */
export function rpcStatement(
  fn: string,
  args: Record<string, unknown> = {},
): { sql: string; params: unknown[] } {
  if (!fn.split('.').every((part) => IDENT.test(part))) {
    throw new Error(`invalid function name: ${fn}`);
  }
  const keys = Object.keys(args);
  for (const key of keys) if (!IDENT.test(key)) throw new Error(`invalid argument name: ${key}`);
  const list = keys.map((key, i) => `${key} => $${i + 1}`).join(', ');
  return { sql: `select * from ${fn}(${list})`, params: keys.map((key) => args[key]) };
}

/**
 * Shapes an rpc result: a scalar-returning function yields one row with a single column named
 * after the function, which is unwrapped to that value (`null` when no row). Anything else
 * (set-returning / `returns table` functions) yields the rows array.
 */
export function rpcResult<T>(fn: string, result: pg.QueryResult): T {
  const name = fn.split('.').pop();
  const [only] = result.fields;
  if (only && result.fields.length === 1 && only.name === name && result.rows.length <= 1) {
    return (result.rows[0]?.[only.name] ?? null) as T;
  }
  return result.rows as T;
}
