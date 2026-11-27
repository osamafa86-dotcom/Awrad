-- 0011_settings: صفحة الإعدادات (F-66). SQL عادي صالح على Supabase Cloud.
-- تعديل app_settings وإنشاء المجموعات وتعديلها يمرّان من هنا، كلٌّ في معاملة واحدة مع صفّ تدقيق؛ لأن audit_log بلا
-- سياسة إدراج (0005) فلا تكتبه إلا دوال security definer. سياسات الكتابة المباشرة للمدير (0005) تبقى كما هي.
-- لا حذف للمجموعات في النسخة الأولى (docs/backlog.md).

-- ───────────── setting_value_is_valid ─────────────
-- قيمة p_value صالحة للمفتاح p_key (المفاتيح الستة وحدها؛ أي مفتاح آخر غير صالح). الأعداد صحيحة في مداها
-- (BR-01/02 العتبة، BR-05 نافذة التعديل، BR-06 المهلة، BR-09 فارق الهجري)، والمنطقي منطقي، والوقت «HH:MM».
-- case يضمن ترتيب الفحص: لا تحويل إلى numeric قبل التأكد أن القيمة عدد.
create or replace function setting_value_is_valid(p_key text, p_value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_value is null then false
    when p_key in ('streak_threshold_pct', 'backfill_days', 'weekly_grace_days', 'hijri_adjustment_days') then
      case
        when jsonb_typeof(p_value) <> 'number' then false
        when (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric) then false
        else (p_value #>> '{}')::numeric between
               case p_key when 'streak_threshold_pct' then 50 when 'hijri_adjustment_days' then -2 else 0 end
           and case p_key when 'streak_threshold_pct' then 100 when 'backfill_days' then 14
                          when 'weekly_grace_days' then 7 else 2 end
      end
    when p_key = 'excused_counts_as_absent' then jsonb_typeof(p_value) = 'boolean'
    when p_key = 'default_reminder_time' then
      jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    else false
  end
$$;

-- مساعدة داخلية لـ update_app_settings وحدها (المالك ينفّذها)؛ لا تُعرض عبر الواجهة البرمجية.
revoke execute on function setting_value_is_valid(text, jsonb) from public, anon, authenticated;

-- ───────────── update_app_settings ─────────────
-- p_values = {"<key>": <value>, ...}: بعض المفاتيح الستة أو كلها؛ يُحدَّث الموجود منها فقط. الأخطاء (ERR-1):
-- FORBIDDEN لغير المدير الفعّال؛ INVALID_ITEM لغير كائن، أو مفتاح خارج الستة، أو قيمة خارج قاعدتها (فلا يتغيّر شيء).
-- صفّ تدقيق واحد settings.update بـ diff = {key: {old, new}} للمفاتيح التي تغيّرت فعلًا؛ لا صفّ إن لم يتغيّر شيء.
create or replace function update_app_settings(p_values jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_key  text;
  v_new  jsonb;
  v_old  jsonb;
  v_diff jsonb := '{}'::jsonb;
begin
  if not is_admin() then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;
  -- كل القيم أولًا: مفتاح واحد غير صالح يرفض الطلب كله.
  if exists (select 1 from jsonb_each(p_values) e where not setting_value_is_valid(e.key, e.value)) then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  for v_key, v_new in select e.key, e.value from jsonb_each(p_values) e order by e.key loop
    -- 5.0 يُخزَّن 5: setting_int يقرأ القيمة نصًّا ثم يحوّلها إلى int.
    if jsonb_typeof(v_new) = 'number' then
      v_new := to_jsonb((v_new #>> '{}')::numeric::int);
    end if;
    select s.value into v_old from app_settings s where s.key = v_key for update;
    if v_old is distinct from v_new then
      insert into app_settings (key, value) values (v_key, v_new)
      on conflict (key) do update set value = excluded.value;
      v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('old', v_old, 'new', v_new));
    end if;
  end loop;

  if v_diff <> '{}'::jsonb then
    insert into audit_log (actor_id, action, target, diff)
    values (auth.uid(), 'settings.update', jsonb_build_object('table', 'app_settings'), v_diff);
  end if;
end
$$;

revoke execute on function update_app_settings(jsonb) from public, anon;
grant execute on function update_app_settings(jsonb) to authenticated;

-- ───────────── upsert_group ─────────────
-- p_id فارغ = مجموعة جديدة، وإلا تعديل تلك المجموعة. يُرجع معرّف المجموعة. الأخطاء (ERR-1): FORBIDDEN لغير المدير
-- الفعّال؛ INVALID_ITEM لمعرّف مجهول، أو اسم فارغ بعد القصّ أو مكرَّر (بلا اعتبار لحالة الأحرف والمسافات الطرفية)،
-- أو منطقة ليست في pg_timezone_names (BR-08)، أو بداية أسبوع خارج 0–6 (BR-06)، أو مشرف ليس ملفًّا فعّالًا بدور
-- supervisor أو admin. مجموعة المشرفين تُستبدل بـ p_supervisor_ids تمامًا (يُضاف الناقص ويُحذف الزائد).
-- التدقيق: group.create / group.update بـ diff للحقول التي تغيّرت ({old, new}، و old = null عند الإنشاء) و
-- supervisors = {added, removed}؛ تعديل لا يغيّر شيئًا لا يكتب صفًّا.
create or replace function upsert_group(
  p_id uuid,
  p_name text,
  p_timezone text,
  p_week_starts_on int,
  p_supervisor_ids uuid[]
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_name    text := btrim(p_name);
  v_ids     uuid[];
  v_old     groups%rowtype;
  v_current uuid[] := '{}';
  v_added   uuid[];
  v_removed uuid[];
  v_id      uuid;
  v_diff    jsonb := '{}'::jsonb;
begin
  if not is_admin() then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  if v_name is null or v_name = ''
     or p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone)
     or p_week_starts_on is null or p_week_starts_on not between 0 and 6
     or array_position(p_supervisor_ids, null) is not null then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  select coalesce(array_agg(distinct u.id order by u.id), '{}') into v_ids
  from unnest(coalesce(p_supervisor_ids, '{}')) as u(id);
  if exists (
    select 1 from unnest(v_ids) as u(id)
    where not exists (
      select 1 from profiles p
      where p.id = u.id and p.is_active and p.role in ('supervisor', 'admin')
    )
  ) then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  -- يُسلسِل الحفظ المتزامن حتى لا تمرّ مجموعتان بالاسم نفسه بين الفحص والكتابة.
  perform pg_advisory_xact_lock(hashtext('awrad.upsert_group'));

  if p_id is not null then
    select * into v_old from groups where id = p_id for update;
    if not found then
      raise exception using message = 'INVALID_ITEM', errcode = '22023';
    end if;
  end if;
  if exists (select 1 from groups g where lower(btrim(g.name)) = lower(v_name) and g.id is distinct from p_id) then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  if p_id is null then
    insert into groups (name, timezone, week_starts_on)
    values (v_name, p_timezone, p_week_starts_on)
    returning id into v_id;
    v_diff := jsonb_build_object(
      'name', jsonb_build_object('old', null, 'new', v_name),
      'timezone', jsonb_build_object('old', null, 'new', p_timezone),
      'week_starts_on', jsonb_build_object('old', null, 'new', p_week_starts_on)
    );
  else
    v_id := p_id;
    update groups set name = v_name, timezone = p_timezone, week_starts_on = p_week_starts_on where id = v_id;
    if v_old.name is distinct from v_name then
      v_diff := v_diff || jsonb_build_object('name', jsonb_build_object('old', v_old.name, 'new', v_name));
    end if;
    if v_old.timezone is distinct from p_timezone then
      v_diff := v_diff || jsonb_build_object('timezone', jsonb_build_object('old', v_old.timezone, 'new', p_timezone));
    end if;
    if v_old.week_starts_on is distinct from p_week_starts_on then
      v_diff := v_diff || jsonb_build_object(
        'week_starts_on', jsonb_build_object('old', v_old.week_starts_on, 'new', p_week_starts_on));
    end if;
    select coalesce(array_agg(gs.user_id order by gs.user_id), '{}') into v_current
    from group_supervisors gs where gs.group_id = v_id;
  end if;

  v_added := array(select a.id from unnest(v_ids) as a(id) except select c.id from unnest(v_current) as c(id) order by 1);
  v_removed := array(select c.id from unnest(v_current) as c(id) except select a.id from unnest(v_ids) as a(id) order by 1);
  delete from group_supervisors where group_id = v_id and user_id = any (v_removed);
  insert into group_supervisors (group_id, user_id) select v_id, a.id from unnest(v_added) as a(id);
  if p_id is null or cardinality(v_added) > 0 or cardinality(v_removed) > 0 then
    v_diff := v_diff || jsonb_build_object(
      'supervisors', jsonb_build_object('added', to_jsonb(v_added), 'removed', to_jsonb(v_removed)));
  end if;

  if v_diff <> '{}'::jsonb then
    insert into audit_log (actor_id, action, target, diff)
    values (auth.uid(), case when p_id is null then 'group.create' else 'group.update' end,
            jsonb_build_object('table', 'groups', 'id', v_id), v_diff);
  end if;
  return v_id;
end
$$;

revoke execute on function upsert_group(uuid, text, text, int, uuid[]) from public, anon;
grant execute on function upsert_group(uuid, text, text, int, uuid[]) to authenticated;
