// Drops and recreates the target DB, then applies shim (local only), migrations, seed.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, dbUrl, loadEnv, psql } from './lib.mjs';

loadEnv();
const url = new URL(dbUrl());
const dbName = decodeURIComponent(url.pathname.slice(1));
if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`unsafe database name: ${dbName}`);
const isLocal = ['127.0.0.1', 'localhost'].includes(url.hostname);
const useShim = isLocal && !process.argv.includes('--no-shim');

const admin = new URL(url);
admin.pathname = '/postgres';

psql(admin.toString(), {
  sql: `select pg_terminate_backend(pid) from pg_stat_activity where datname='${dbName}' and pid <> pg_backend_pid()`,
});
psql(admin.toString(), { sql: `drop database if exists "${dbName}"` });
psql(admin.toString(), { sql: `create database "${dbName}"` });
console.log(`recreated database ${dbName}`);

const sqlFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => join(dir, f))
    : [];

const files = [
  ...(useShim ? sqlFiles(join(ROOT, 'supabase/shim')) : []),
  ...sqlFiles(join(ROOT, 'supabase/migrations')),
  ...(existsSync(join(ROOT, 'supabase/seed.sql')) ? [join(ROOT, 'supabase/seed.sql')] : []),
];

for (const file of files) {
  psql(url.toString(), { file });
  console.log(`applied ${file.slice(ROOT.length + 1)}`);
}
if (!useShim) console.log(`shim skipped (${isLocal ? '--no-shim' : 'non-local host'})`);
