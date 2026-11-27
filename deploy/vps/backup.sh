#!/usr/bin/env bash
# Backup of one environment's database (Ruling FIN-6; spec §13 «نسخ احتياطي يومي»). Run on the server by the ops
# task or a nightly timer (installing the timer is a mahfazapay round):
#   SITE=awrad AWRAD_ENV_FILE=/opt/sites/awrad/.env bash deploy/vps/backup.sh
# Optional: BACKUP_DIR (default /opt/sites/$SITE/backups), RETENTION_DAYS (default 14).
# Writes, per run, owner-only (dir 700, files 600):
#   <SITE>-<UTC stamp>.dump          pg_dump -Fc of the `postgres` database (cron and net excluded: the reminder job is
#                                    re-created by ensure_reminder_schedule(), docs/runbook.md §7), made INSIDE the db
#                                    container to a file — a seekable archive with data offsets — then copied out and
#                                    checked byte for byte (sha256)
#   <SITE>-<stamp>.counts.tsv        row count of every table in public, auth and ops, taken just before the dump;
#                                    restore-rehearsal.sh compares a restore with it
#   <SITE>-<stamp>.settings.sql      the `alter database postgres set app.*` lines (functions URL, cron secret, JWT
#                                    settings): a schema dump does not carry database-level settings. Secrets inside —
#                                    never printed, 600 like the dump
# Then deletes this environment's sets older than RETENTION_DAYS (never the newest). Prints sizes and counts only.
# An off-server copy is an owner item (docs/runbook.md §3).
set -euo pipefail
umask 077
DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE=${AWRAD_ENV_FILE:?backup: AWRAD_ENV_FILE غائب — مسار .env للبيئة، مثل /opt/sites/awrad/.env}
[ -r "$ENV_FILE" ] || { echo "backup: لا يُقرأ $ENV_FILE"; exit 1; }
envval() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1; }
SITE=${SITE:-$(envval SITE)}
[[ "$SITE" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "backup: SITE «$SITE» غائب أو بشكل غير صالح"; exit 1; }
BACKUP_DIR=${BACKUP_DIR:-/opt/sites/$SITE/backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo "backup: RETENTION_DAYS «$RETENTION_DAYS» ليس عددًا"; exit 1; }

dc() { docker compose -p "$SITE" --env-file "$ENV_FILE" -f "$DIR/docker-compose.yml" "$@"; }
# As supabase_admin over the container's local socket: the auth schema belongs to supabase_auth_admin, which postgres
# may not read in full.
psql_db() { dc exec -T db psql -X -q -tA -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BASE="$BACKUP_DIR/$SITE-$STAMP"
INNER=/tmp/$SITE-backup-$STAMP.dump
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cleanup() { dc exec -T db rm -f "$INNER" >/dev/null 2>&1 || true; rm -f "$BASE.dump.partial"; }
trap cleanup EXIT

[ -n "$(dc ps -q db)" ] || { echo "backup: حاوية القاعدة ($SITE-db) لا تعمل"; exit 1; }

# 1) Row counts, then the dump, seconds apart (a nightly run sees no writes in between; the rehearsal says if any).
psql_db -F $'\t' > "$BASE.counts.tsv" <<'SQL'
select format('%I.%I', n.nspname, c.relname),
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and n.nspname in ('public', 'auth', 'ops')
 order by 1;
SQL
dc exec -T db pg_dump -U supabase_admin -d postgres -Fc -Z 6 --exclude-schema=cron --exclude-schema=net -f "$INNER"

# 2) Out of the container, verified, then renamed into place.
inner_sum=$(dc exec -T db sha256sum "$INNER" | cut -d' ' -f1)
dc exec -T db cat "$INNER" > "$BASE.dump.partial"
outer_sum=$(sha256sum "$BASE.dump.partial" | cut -d' ' -f1)
[ -n "$inner_sum" ] && [ "$inner_sum" = "$outer_sum" ] || { echo "backup: النسخة المنقولة لا تطابق ما في الحاوية"; exit 1; }
mv "$BASE.dump.partial" "$BASE.dump"

# 3) Database-level settings (app.*), as statements to re-apply after a restore onto a new volume.
psql_db > "$BASE.settings.sql" <<'SQL'
select format('alter database postgres set %I = %L;', split_part(s, '=', 1), substr(s, strpos(s, '=') + 1))
  from pg_db_role_setting d cross join unnest(d.setconfig) as s
 where d.setrole = 0
   and d.setdatabase = (select oid from pg_database where datname = 'postgres')
   and s like 'app.%'
 order by 1;
SQL
chmod 600 "$BASE.dump" "$BASE.counts.tsv" "$BASE.settings.sql"

tables=$(grep -c . "$BASE.counts.tsv" || true)
rows=$(awk -F'\t' '{ n += $2 } END { print n + 0 }' "$BASE.counts.tsv")
settings=$(grep -c '^alter database' "$BASE.settings.sql" || true)
echo "backup: $(basename "$BASE").dump · $(du -h "$BASE.dump" | cut -f1) · sha256 ok · $tables tables, $rows rows · $settings app.* settings"

# 4) Rotation: this environment's sets older than RETENTION_DAYS; the one just written always stays.
deleted=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$SITE-[0-9]*" -mtime +"$RETENTION_DAYS" \
  ! -name "$SITE-$STAMP.*" -print -delete | wc -l | tr -d ' ')
kept=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$SITE-[0-9]*.dump" | wc -l | tr -d ' ')
echo "backup: rotation (> $RETENTION_DAYS days): $deleted files deleted · $kept dumps kept"
