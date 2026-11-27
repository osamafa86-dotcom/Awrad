#!/bin/sh
# Applies supabase/migrations/*.sql in order, then supabase/seed.sql once, as `postgres`.
# Runs in the `migrate` service (postgres:17-alpine, psql only) on every deploy; idempotent: each file is
# recorded in ops.schema_migrations (schema `ops`, not exposed by PostgREST) in the same transaction that
# applies it. Ends with NOTIFY pgrst so a running PostgREST reloads its schema cache. Exit 0 = up to date.
set -eu
# PGHOST is the db's alias on the project network (${SITE}-db), set by docker-compose.yml.
: "${PGHOST:?migrate: PGHOST غائب — يضبطه docker-compose.yml (<SITE>-db)؛ شغّل الخدمة migrate عبر compose}"
: "${POSTGRES_PASSWORD:?migrate: POSTGRES_PASSWORD غائب — ضعه في .env}"
export PGHOST PGPORT="${PGPORT:-5432}" PGUSER=postgres PGDATABASE=postgres
export PGPASSWORD="$POSTGRES_PASSWORD" PGOPTIONS="-c client_min_messages=warning"
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

i=0
until pg_isready -q; do
  i=$((i + 1)); [ "$i" -ge 60 ] && { echo "migrate: database not ready after 2 minutes"; exit 1; }
  sleep 2
done

q -c "create schema if not exists ops;
      create table if not exists ops.schema_migrations (
        name text primary key, applied_at timestamptz not null default now());
      revoke all on schema ops from public;"

applied=0; present=0
apply() {  # apply <file> <recorded name>
  if [ "$(q -tA -c "select count(*) from ops.schema_migrations where name = '$2'")" = 1 ]; then
    present=$((present + 1)); return 0
  fi
  q -1 -f "$1" -c "insert into ops.schema_migrations (name) values ('$2')"
  echo "migrate: applied $2"
  applied=$((applied + 1))
}

for f in /work/migrations/*.sql; do
  apply "$f" "$(basename "$f")"
done
[ -f /work/seed.sql ] && apply /work/seed.sql "seed:seed.sql"

q -c "notify pgrst, 'reload schema'"
echo "migrate: applied $applied · already present $present · recorded $(q -tA -c 'select count(*) from ops.schema_migrations') · habits $(q -tA -c 'select count(*) from public.habits')"
