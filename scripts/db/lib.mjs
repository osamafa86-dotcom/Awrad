// أدوات مشتركة لسكربتات قاعدة البيانات المحلية (Node ESM بلا اعتماديات).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PG_VERSION = '16';
export const CLUSTER = 'awrad';
export const PORT = '54329';
export const DEFAULT_DB_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/awrad`;

/** Loads KEY=VALUE lines from <root>/.env without overriding variables already set. */
export function loadEnv() {
  const file = resolve(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (value !== '' && process.env[key] === undefined) process.env[key] = value;
  }
}

export function dbUrl() {
  return process.env.SUPABASE_DB_URL || DEFAULT_DB_URL;
}

/** Runs a command, inherits stderr so failures are visible, returns trimmed stdout. */
export function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  }).trim();
}

/** Runs a command as the postgres OS user (we may be root). */
export function asPostgres(cmd, args) {
  if (process.getuid && process.getuid() === 0) {
    return run('su', ['postgres', '-s', '/bin/sh', '-c', [cmd, ...args].map(shQuote).join(' ')]);
  }
  return run(cmd, args);
}

function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export function clusterStatus() {
  const out = run('pg_lsclusters', ['--no-header']);
  for (const line of out.split('\n')) {
    const [ver, name, port, status] = line.trim().split(/\s+/);
    if (ver === PG_VERSION && name === CLUSTER) return { port, status };
  }
  return null;
}

/** Runs a SQL string or file against the given connection URL; every error propagates. */
export function psql(url, { file, sql }) {
  const args = [url, '-v', 'ON_ERROR_STOP=1', '-q'];
  if (file) args.push('-f', file);
  else args.push('-Atc', sql);
  return run('psql', args);
}
