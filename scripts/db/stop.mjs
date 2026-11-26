// Stops the local PostgreSQL cluster; no error if it is missing or already stopped.
import { CLUSTER, PG_VERSION, clusterStatus, run } from './lib.mjs';

const state = clusterStatus();
if (state && state.status === 'online') {
  run('pg_ctlcluster', [PG_VERSION, CLUSTER, 'stop']);
  console.log(`stopped cluster ${PG_VERSION} ${CLUSTER}`);
} else {
  console.log(`cluster ${PG_VERSION} ${CLUSTER} is not running`);
}
