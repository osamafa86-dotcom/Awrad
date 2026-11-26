// Creates (if missing) and starts the dedicated local PostgreSQL cluster. Idempotent.
import { CLUSTER, PG_VERSION, PORT, asPostgres, clusterStatus, loadEnv, psql, run } from './lib.mjs';

loadEnv();

let state = clusterStatus();
if (!state) {
  run('pg_createcluster', [PG_VERSION, CLUSTER, '--port', PORT]);
  console.log(`created cluster ${PG_VERSION} ${CLUSTER} on port ${PORT}`);
  state = clusterStatus();
  if (!state) throw new Error(`cluster ${PG_VERSION} ${CLUSTER} is not listed by pg_lsclusters after creation`);
}
if (state.port !== PORT) {
  throw new Error(`cluster ${CLUSTER} uses port ${state.port}, expected ${PORT}`);
}
if (state.status !== 'online') {
  run('pg_ctlcluster', [PG_VERSION, CLUSTER, 'start']);
  console.log(`started cluster ${PG_VERSION} ${CLUSTER}`);
}

// Local socket access as the postgres OS user (peer auth) to set password and database.
asPostgres('psql', ['-p', PORT, '-v', 'ON_ERROR_STOP=1', '-q', '-c', `alter role postgres password 'postgres'`]);
const exists = asPostgres('psql', ['-p', PORT, '-Atc', `select 1 from pg_database where datname='awrad'`]);
if (exists !== '1') {
  asPostgres('psql', ['-p', PORT, '-v', 'ON_ERROR_STOP=1', '-q', '-c', 'create database awrad']);
  console.log('created database awrad');
}
// Confirm TCP + password login works.
psql('postgresql://postgres:postgres@127.0.0.1:' + PORT + '/postgres', { sql: 'select 1' });
console.log(`ready: ${PG_VERSION} ${CLUSTER} ${PORT} online`);
