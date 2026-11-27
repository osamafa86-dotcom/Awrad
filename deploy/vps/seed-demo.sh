#!/usr/bin/env bash
# Demo accounts and data for a stack on the VPS (DEP-4). Run on the server by the ops task, once (it keeps a
# marker); every step also converges on its own, so a re-run after an interruption repairs instead of
# duplicating:
#   SITE=awrad AWRAD_ENV_FILE=/opt/sites/awrad/.env bash deploy/vps/seed-demo.sh
# SITE and the four hosts come from the environment, else from the env file (SITE defaults to awrad, as in
# docker-compose.yml); a missing host stops it before anything is written. The accounts are <name>@$ADMIN_HOST.
# Accounts: a pending `invitations` row, then GoTrue's POST /admin/users with the service-role key
# (email_confirm) — the handle_new_user trigger builds the profile from the invitation. Logs only through
# save_log, as the admin (set local role authenticated + request.jwt.claims, as supabase/tests do).
# Prints counts and the demo e-mail addresses only; the service-role key never reaches the output or any argv.
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE=${AWRAD_ENV_FILE:?seed: AWRAD_ENV_FILE غائب — مسار .env للبيئة، مثل /opt/sites/awrad/.env}
[ -r "$ENV_FILE" ] || { echo "seed: لا يُقرأ $ENV_FILE"; exit 1; }
GROUP_NAME='المجموعة التجريبية'

# envval <KEY> → the value in the env file (empty if absent)
envval() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1; }
SITE=${SITE:-$(envval SITE)}; SITE=${SITE:-awrad}
for v in ADMIN_HOST APP_HOST API_HOST MAIL_HOST; do
  [ -n "${!v:-}" ] || printf -v "$v" '%s' "$(envval "$v")"
  [ -n "${!v}" ] || { echo "seed: $v غائب — ضعه في $ENV_FILE أو في البيئة (compose يحتاج الأسماء الأربعة)"; exit 1; }
done
# compose reads the same values (the environment wins over --env-file), so the two can never disagree.
export SITE ADMIN_HOST APP_HOST API_HOST MAIL_HOST
DOMAIN=$ADMIN_HOST
echo "seed: SITE=$SITE · accounts @$DOMAIN"

dc() { docker compose -p "$SITE" --env-file "$ENV_FILE" -f "$DIR/docker-compose.yml" "$@"; }
# SQL from stdin, psql variables from -v; inside the db container over TCP (its PGPASSWORD).
q() { dc exec -T db psql -X -q -tA -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres "$@"; }

grep -q '^SERVICE_ROLE_KEY=.' "$ENV_FILE" || { echo "seed: SERVICE_ROLE_KEY missing in $ENV_FILE"; exit 1; }
AUTH_CID=$(dc ps -q auth)
[ -n "$AUTH_CID" ] || { echo "seed: the auth container ($SITE-auth) is not running"; exit 1; }
# GoTrue is reached from the host at its address on the project network (no published port). The POST is made
# by python, which reads the service-role key from the env file itself: the key is in no process's argv.
AUTH_IP=$(docker inspect -f "{{with index .NetworkSettings.Networks \"${SITE}_default\"}}{{.IPAddress}}{{end}}" "$AUTH_CID")
[ -n "$AUTH_IP" ] || { echo "seed: no address for $SITE-auth on ${SITE}_default"; exit 1; }
admin_create_user() {  # admin_create_user <email> <full name>
  EMAIL=$1 NAME=$2 python3 - "$ENV_FILE" "http://$AUTH_IP:9999/admin/users" <<'PY2'
import json, os, sys, urllib.error, urllib.request
key = next(l.split("=", 1)[1].strip() for l in open(sys.argv[1]) if l.startswith("SERVICE_ROLE_KEY="))
body = json.dumps({"email": os.environ["EMAIL"], "email_confirm": True,
                   "user_metadata": {"full_name": os.environ["NAME"]}}, ensure_ascii=False).encode()
req = urllib.request.Request(sys.argv[2], data=body, method="POST",
                             headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # a container address: never via a proxy
try:
    opener.open(req, timeout=30).read()
except urllib.error.HTTPError as e:
    sys.exit("seed: POST /admin/users -> %d %s" % (e.code, e.read()[:200].decode("utf-8", "replace")))
except OSError as e:
    sys.exit("seed: POST /admin/users -> %s" % e)
PY2
}

# 1) The demo group (spec defaults: Asia/Riyadh, week starts on Sunday).
GROUP_ID=$(q -v name="$GROUP_NAME" <<'SQL'
insert into groups (name, timezone, week_starts_on)
select :'name', 'Asia/Riyadh', 0
where not exists (select 1 from groups where name = :'name');
select id from groups where name = :'name' order by created_at limit 1;
SQL
)
echo "seed: group ok ($(q -v name="$GROUP_NAME" <<<"select count(*) from groups where name = :'name';") row)"

# 2) Accounts. ensure_user <email> <full name> <role> <in group: 1|0> <tracked: true|false>
created=0
ensure_user() {
  local email=$1 name=$2 role=$3 in_group=$4 tracked=$5 gid="" id
  [ "$in_group" = 1 ] && gid=$GROUP_ID
  id=$(q -v email="$email" <<<"select id from auth.users where lower(email) = lower(:'email');")
  if [ -z "$id" ]; then
    q -v email="$email" -v name="$name" -v role="$role" -v gid="$gid" -v tracked="$tracked" <<'SQL'
insert into invitations (email, full_name, role, group_id, is_tracked, joined_at)
select lower(:'email'), :'name', :'role'::user_role, nullif(:'gid', '')::uuid, :'tracked'::boolean,
       (now() at time zone 'Asia/Riyadh')::date - 14
where not exists (select 1 from invitations where lower(email) = lower(:'email') and accepted_at is null);
SQL
    admin_create_user "$email" "$name" || { echo "seed: POST /admin/users failed for $email"; return 1; }
    id=$(q -v email="$email" <<<"select id from auth.users where lower(email) = lower(:'email');")
    [ -n "$id" ] || { echo "seed: $email not in auth.users after POST /admin/users"; return 1; }
    created=$((created + 1))
  fi
  # Converge the profile (the trigger built it from the invitation; this repairs an older half-run).
  q -v id="$id" -v name="$name" -v role="$role" -v gid="$gid" -v tracked="$tracked" <<'SQL'
update profiles set full_name = :'name', role = :'role'::user_role, group_id = nullif(:'gid', '')::uuid,
       is_tracked = :'tracked'::boolean, is_active = true,
       joined_at = least(joined_at, (now() at time zone 'Asia/Riyadh')::date - 14)
 where id = :'id'::uuid;
SQL
  printf -v "ID_${role}_${email%%@*}" '%s' "$id"
}

ensure_user "admin@$DOMAIN"      'الشيخ (تجريبي)'         admin      0 false
ensure_user "supervisor@$DOMAIN" 'المشرف التجريبي'         supervisor 1 true
ensure_user "student1@$DOMAIN"   'الطالب التجريبي الأول'   student    1 true
ensure_user "student2@$DOMAIN"   'الطالب التجريبي الثاني'  student    1 true
# shellcheck disable=SC2154  # set by ensure_user (printf -v)
ADMIN=$ID_admin_admin SUP=$ID_supervisor_supervisor S1=$ID_student_student1 S2=$ID_student_student2

q -v gid="$GROUP_ID" -v sup="$SUP" <<'SQL'
insert into group_supervisors (group_id, user_id) values (:'gid'::uuid, :'sup'::uuid) on conflict do nothing;
SQL
echo "seed: accounts created now $created · profiles $(q -v pat="%@$DOMAIN" <<<"select count(*) from profiles p join auth.users u on u.id = p.id where u.email like :'pat' and p.is_active;") active · supervisors of the group $(q -v gid="$GROUP_ID" <<<"select count(*) from group_supervisors where group_id = :'gid'::uuid;")"

# 3) Logs for the last 10 days, through save_log only, as the admin (who may write for others and outside the
#    backfill window). outcome: done = every habit done; partial = the first three done, the rest not;
#    failed = every tristate not done. Days not listed stay empty (a gap). Plus last week's weekly log.
q -v admin="$ADMIN" -v s1="$S1" -v s2="$S2" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true) \gset ignored_
with plan(user_id, days_ago, outcome) as (values
  (:'s1'::uuid, 1, 'done'), (:'s1'::uuid, 2, 'done'), (:'s1'::uuid, 3, 'done'), (:'s1'::uuid, 4, 'failed'),
  (:'s1'::uuid, 5, 'done'), (:'s1'::uuid, 6, 'done'), (:'s1'::uuid, 8, 'partial'), (:'s1'::uuid, 9, 'done'),
  (:'s1'::uuid, 10, 'done'),
  (:'s2'::uuid, 2, 'done'), (:'s2'::uuid, 3, 'failed'), (:'s2'::uuid, 4, 'done'), (:'s2'::uuid, 5, 'partial'),
  (:'s2'::uuid, 7, 'done'), (:'s2'::uuid, 8, 'failed'), (:'s2'::uuid, 9, 'partial')
), dated as (
  select user_id, (now() at time zone 'Asia/Riyadh')::date - days_ago as day, outcome from plan
)
select 'daily logs saved: ' || count(save_log(
  'daily', d.day,
  (select jsonb_agg(case
     when h.kind = 'checklist' then jsonb_build_object(
       'habit_id', h.id, 'status', 'done',
       'checked_item_ids', coalesce((select jsonb_agg(i.id) from active_items_on(h.id, d.day) i
                                     where d.outcome = 'done' or i.sort_order <= 6), '[]'::jsonb))
     else jsonb_build_object('habit_id', h.id, 'status', case
       when d.outcome = 'done' then 'done'
       when d.outcome = 'partial' and h.sort_order <= 3 then 'done'
       else 'not_done' end)
   end order by h.sort_order)
   from active_habits_on(d.day, 'daily') h),
  null, null, null, d.user_id))
from dated d;

with plan(user_id, outcome, review, support) as (values
  (:'s1'::uuid, 'done', 'أسبوع طيّب، والحمد لله.', null),
  (:'s2'::uuid, 'partial', 'تأخّرت في درس الفقه.', 'أحتاج مساعدة في تنظيم وقت المراجعة.')
), dated as (
  select user_id, week_start((now() at time zone 'Asia/Riyadh')::date - 7, 0) as week, outcome, review, support
  from plan
)
select 'weekly logs saved: ' || count(save_log(
  'weekly', d.week,
  (select jsonb_agg(case
     when h.kind = 'checklist' then jsonb_build_object(
       'habit_id', h.id, 'status', 'done',
       'checked_item_ids', coalesce((select jsonb_agg(i.id) from active_items_on(h.id, d.week) i
                                     where d.outcome = 'done' or i.sort_order <= 1), '[]'::jsonb))
     else jsonb_build_object('habit_id', h.id, 'status', case
       when d.outcome = 'done' or h.sort_order <= 1 then 'done' else 'not_done' end)
   end order by h.sort_order)
   from active_habits_on(d.week, 'weekly') h),
  null, d.review, d.support, d.user_id))
from dated d;
commit;
SQL

# 4) One session (majlis) three days ago with attendance, as the admin (set_attendance upserts).
q -v admin="$ADMIN" -v gid="$GROUP_ID" -v s1="$S1" -v s2="$S2" -v sup="$SUP" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true) \gset ignored_
insert into sessions (group_id, session_date, title, created_by)
select :'gid'::uuid, (now() at time zone 'Asia/Riyadh')::date - 3, 'مجلس تجريبي', :'admin'::uuid
where not exists (select 1 from sessions where group_id = :'gid'::uuid and title = 'مجلس تجريبي');
select 'attendance rows: ' || set_attendance(
  (select id from sessions where group_id = :'gid'::uuid and title = 'مجلس تجريبي' order by created_at limit 1),
  jsonb_build_array(
    jsonb_build_object('user_id', :'s1', 'status', 'present'),
    jsonb_build_object('user_id', :'s2', 'status', 'absent'),
    jsonb_build_object('user_id', :'sup', 'status', 'excused')));
commit;
SQL

echo "seed: totals — logs $(q -v s1="$S1" -v s2="$S2" <<<"select count(*) from logs where user_id in (:'s1'::uuid, :'s2'::uuid);") · sessions $(q -v gid="$GROUP_ID" <<<"select count(*) from sessions where group_id = :'gid'::uuid;") · attendance $(q -v gid="$GROUP_ID" <<<"select count(*) from attendance a join sessions s on s.id = a.session_id where s.group_id = :'gid'::uuid;") · audit log.admin_save $(q <<<"select count(*) from audit_log where action = 'log.admin_save';")"
