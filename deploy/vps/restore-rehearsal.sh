#!/usr/bin/env bash
# Restore rehearsal (Ruling FIN-6; a gate before production holds real data): restores a backup.sh dump into a scratch
# database INSIDE the environment's db container, compares every table's row count with the counts recorded at backup
# time, then drops the scratch database. The live database is only read (by nobody: the dump is the input).
#   SITE=awrad AWRAD_ENV_FILE=/opt/sites/awrad/.env bash deploy/vps/restore-rehearsal.sh [<file>.dump]
# Without an argument: the newest <SITE>-*.dump in BACKUP_DIR (default /opt/sites/$SITE/backups).
# Prints counts, table names and timings only — never a row, a value or a secret. Exit 0 = every table restored with
# the recorded count; 1 = a table is missing or differs (listed).
# The first run, and the runbook's full restore drill on a scratch compose project, are a mahfazapay round.
set -euo pipefail
umask 077
DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE=${AWRAD_ENV_FILE:?rehearsal: AWRAD_ENV_FILE غائب — مسار .env للبيئة، مثل /opt/sites/awrad/.env}
[ -r "$ENV_FILE" ] || { echo "rehearsal: لا يُقرأ $ENV_FILE"; exit 1; }
envval() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1; }
SITE=${SITE:-$(envval SITE)}
[[ "$SITE" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "rehearsal: SITE «$SITE» غائب أو بشكل غير صالح"; exit 1; }
BACKUP_DIR=${BACKUP_DIR:-/opt/sites/$SITE/backups}

DUMP=${1:-$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$SITE-[0-9]*.dump" 2>/dev/null | sort | tail -1)}
[ -n "$DUMP" ] && [ -r "$DUMP" ] || { echo "rehearsal: لا نسخة في $BACKUP_DIR (شغّل backup.sh أولًا)"; exit 1; }
COUNTS=${DUMP%.dump}.counts.tsv
SETTINGS=${DUMP%.dump}.settings.sql
[ -r "$COUNTS" ] || { echo "rehearsal: $(basename "$COUNTS") غائب — النسخة لم يكتبها backup.sh"; exit 1; }

dc() { docker compose -p "$SITE" --env-file "$ENV_FILE" -f "$DIR/docker-compose.yml" "$@"; }
SCRATCH="${SITE//-/_}_restore_rehearsal"
INNER=/tmp/$SITE-rehearsal.dump
WORK=$(mktemp -d)
cleanup() {
  dc exec -T db dropdb --if-exists -U supabase_admin "$SCRATCH" >/dev/null 2>&1 || true
  dc exec -T db rm -f "$INNER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

[ -n "$(dc ps -q db)" ] || { echo "rehearsal: حاوية القاعدة ($SITE-db) لا تعمل"; exit 1; }
echo "rehearsal: $(basename "$DUMP") · $(du -h "$DUMP" | cut -f1)"

# 1) Into the container, checked byte for byte.
dc exec -T db sh -c "cat > '$INNER'" < "$DUMP"
[ "$(dc exec -T db sha256sum "$INNER" | cut -d' ' -f1)" = "$(sha256sum "$DUMP" | cut -d' ' -f1)" ] \
  || { echo "rehearsal: النسخة داخل الحاوية لا تطابق الملف"; exit 1; }
entries=$(dc exec -T db pg_restore -l "$INNER" | grep -c ' TABLE DATA ' || true)
echo "rehearsal: archive readable · $entries TABLE DATA entries"

# 2) A fresh scratch database, the whole archive restored into it as supabase_admin (owners as in the dump).
dc exec -T db dropdb --if-exists -U supabase_admin "$SCRATCH"
dc exec -T db createdb -U supabase_admin "$SCRATCH"
start=$(date +%s)
rc=0
dc exec -T db pg_restore -U supabase_admin -d "$SCRATCH" "$INNER" 2> "$WORK/restore.err" || rc=$?
elapsed=$(( $(date +%s) - start ))
# Expected noise in a second database of the same cluster (e.g. an extension that lives in `postgres` only); listed
# by object (TOC line: type, schema, name, owner), never by message, which could quote a value.
errors=$(grep -c '^pg_restore: error:' "$WORK/restore.err" || true)
echo "rehearsal: pg_restore exit $rc · ${elapsed}s · $errors errors"
grep '^pg_restore: from TOC entry' "$WORK/restore.err" | sed -E 's/^pg_restore: from TOC entry [0-9]+; [0-9]+ [0-9]+ /  ✗ /' \
  | cut -c1-160 | sort | uniq -c | head -20 || true

# 3) Row counts of the restore against the counts recorded at backup time.
dc exec -T db psql -X -q -tA -F $'\t' -v ON_ERROR_STOP=1 -U supabase_admin -d "$SCRATCH" > "$WORK/restored.tsv" <<'SQL'
select format('%I.%I', n.nspname, c.relname),
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and n.nspname in ('public', 'auth', 'ops')
 order by 1;
SQL
mismatch=$(awk -F'\t' 'NR == FNR { got[$1] = $2; next }
  { if (!($1 in got)) { print "  ✗ " $1 ": missing (recorded " $2 ")"; bad++ }
    else if (got[$1] != $2) { print "  ✗ " $1 ": restored " got[$1] ", recorded " $2; bad++ } }
  END { exit bad > 0 }' "$WORK/restored.tsv" "$COUNTS") && same=1 || same=0
tables=$(grep -c . "$COUNTS" || true)
rows=$(awk -F'\t' '{ n += $2 } END { print n + 0 }' "$COUNTS")
for t in public.profiles public.logs public.log_entries public.log_entry_items public.attendance public.audit_log \
         public.invitations public.push_tokens auth.users; do
  printf '  %s %s\n' "$t" "$(awk -F'\t' -v t="$t" '$1 == t { print $2 }' "$WORK/restored.tsv")"
done

# 4) The settings file (names only; values are secrets).
if [ -r "$SETTINGS" ]; then
  for k in app.functions_url app.cron_secret; do
    if grep -q "^alter database postgres set \"$k\" = " "$SETTINGS"; then echo "  settings: $k ✔"; else echo "  settings: $k ✗"; fi
  done
else
  echo "  settings: $(basename "$SETTINGS") ✗ (absent)"
fi

if [ "$same" = 1 ]; then
  echo "rehearsal: ✔ $tables tables, $rows rows restored as recorded (scratch database dropped)"
  exit 0
fi
printf '%s\n' "$mismatch"
echo "rehearsal: ✗ the restore differs from the recorded counts (scratch database dropped)"
exit 1
