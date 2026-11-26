-- 0006_save_log: مسار الكتابة الوحيد في السجلّات اليومية والأسبوعية (المواصفة §10.3)
-- BR-02, BR-05, BR-06, BR-07, BR-08, BR-10, BR-12, BR-14 + التدقيق F-81.
-- SQL عادي صالح على Supabase Cloud. لا SQL ديناميكي.
--
-- p_entries = [{"habit_id": "<uuid>", "status": "done|not_done|not_required",
--               "checked_item_ids": ["<uuid>", ...]}]   (checked_item_ids اختياري)
-- تُرجع logs.id. التحقّق كله يسبق أي كتابة، والدالة ذرّية (معاملة المستدعي).
-- رموز الصلاحية بـ 42501، ورموز التحقّق بـ 22023، والرسالة هي الرمز نفسه.

create or replace function save_log(
  p_period               habit_frequency,
  p_period_start         date,
  p_entries              jsonb,
  p_note                 text default null,
  p_review_text          text default null,
  p_support_request_text text default null,
  p_user_id              uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c_uuid     constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_uid      uuid := auth.uid();
  v_admin    boolean := is_admin();
  v_user     uuid := coalesce(p_user_id, auth.uid());
  v_today    date;
  v_outside  boolean;
  v_entry    jsonb;
  v_ids_json jsonb;
  v_habit    habits%rowtype;
  v_status   entry_status;
  v_ids      uuid[];
  v_weekly   boolean := p_period = 'weekly';
  v_text     text;
  v_log      uuid;
  v_entry_id uuid;
begin
  -- 1) الصلاحية: المدير وحده يكتب لغيره؛ المستخدم الهدف موجود وفعّال
  if v_uid is null then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  if v_user <> v_uid and not v_admin then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = v_user and is_active) then
    raise exception using message = 'INACTIVE_USER', errcode = '42501';
  end if;
  if p_period is null or p_period_start is null then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  -- 2) النافذة (BR-05, BR-06, BR-08): المستقبل مرفوض للجميع؛ المدير يتجاوز النافذة فقط
  v_today := local_today(v_user);
  if p_period_start > v_today then
    raise exception using message = 'FUTURE_DATE', errcode = '22023';
  end if;
  if v_weekly then
    if p_period_start <> week_start(p_period_start, user_week_starts_on(v_user)) then
      raise exception using message = 'INVALID_WEEK_START', errcode = '22023';
    end if;
    v_outside := v_today > p_period_start + 6 + setting_int('weekly_grace_days');
  else
    v_outside := p_period_start < v_today - setting_int('backfill_days');
  end if;
  if v_outside and not v_admin then
    raise exception using message = 'DATE_OUT_OF_WINDOW', errcode = '22023';
  end if;

  -- 3) شكل المدخلات
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_ids_json := v_entry -> 'checked_item_ids';
    if jsonb_typeof(v_entry) <> 'object'
       or jsonb_typeof(v_entry -> 'habit_id') is distinct from 'string'
       or (v_entry ->> 'habit_id') !~* c_uuid
       or jsonb_typeof(v_entry -> 'status') is distinct from 'string'
       or (v_entry ->> 'status') not in ('done', 'not_done', 'not_required')
       or coalesce(jsonb_typeof(v_ids_json), 'null') not in ('null', 'array')
       or (jsonb_typeof(v_ids_json) = 'array' and exists (
             select 1 from jsonb_array_elements(v_ids_json) x
              where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~* c_uuid)) then
      raise exception using message = 'INVALID_ITEM', errcode = '22023';
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(p_entries) e
     group by lower(e ->> 'habit_id') having count(*) > 1
  ) then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  -- 4) العادات والبنود (BR-02, BR-07)
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    select * into v_habit from habits where id = (v_entry ->> 'habit_id')::uuid;
    if not found then
      raise exception using message = 'INVALID_ITEM', errcode = '22023';
    end if;
    if v_habit.frequency <> p_period then
      raise exception using message = 'FREQUENCY_MISMATCH', errcode = '22023';
    end if;
    if not exists (select 1 from active_habits_on(p_period_start, p_period) a where a.id = v_habit.id) then
      raise exception using message = 'INACTIVE_HABIT', errcode = '22023';
    end if;
    v_ids := case when jsonb_typeof(v_entry -> 'checked_item_ids') = 'array'
                  then array(select (jsonb_array_elements_text(v_entry -> 'checked_item_ids'))::uuid)
                  else '{}'::uuid[] end;
    if cardinality(v_ids) > 0 then
      if v_habit.kind = 'tristate' or (v_entry ->> 'status') = 'not_required' then
        raise exception using message = 'INVALID_ITEM', errcode = '22023';
      end if;
      if exists (
        select 1 from unnest(v_ids) x
         where x not in (select i.id from active_items_on(v_habit.id, p_period_start) i)
      ) then
        raise exception using message = 'INVALID_ITEM', errcode = '22023';
      end if;
    end if;
  end loop;

  -- 5) الاكتمال (BR-14): مدخل لكل عادة نشطة في تاريخ السجلّ
  if exists (
    select 1 from active_habits_on(p_period_start, p_period) a
     where not exists (
       select 1 from jsonb_array_elements(p_entries) e where (e ->> 'habit_id')::uuid = a.id)
  ) then
    raise exception using message = 'MISSING_ENTRY', errcode = '22023';
  end if;

  -- 6) Upsert (BR-12) وحالة الدعم (BR-10). قفل صفّ الـ upsert يُسلسل الحفظ المتزامن.
  --    في do update تشير logs.* إلى الصفّ القائم و excluded.* إلى الجديد.
  v_text := case when v_weekly then nullif(btrim(p_support_request_text), '') end;
  insert into logs (user_id, period, period_start, note, review_text, support_request_text,
                    support_status)
  values (v_user, p_period, p_period_start, p_note,
          case when v_weekly then p_review_text end, v_text,
          case when v_text is null then 'none' else 'open' end::support_status)
  on conflict (user_id, period, period_start) do update
    set note                 = excluded.note,
        review_text          = excluded.review_text,
        support_request_text = excluded.support_request_text,
        support_status       = case
          when excluded.support_status = 'none' then 'none'
          when logs.support_status = 'handled'
               and logs.support_request_text = excluded.support_request_text then 'handled'
          else 'open' end::support_status,
        handled_by   = case when excluded.support_status <> 'none' and logs.support_status = 'handled'
                                 and logs.support_request_text = excluded.support_request_text
                            then logs.handled_by end,
        handled_at   = case when excluded.support_status <> 'none' and logs.support_status = 'handled'
                                 and logs.support_request_text = excluded.support_request_text
                            then logs.handled_at end,
        handled_note = case when excluded.support_status <> 'none' and logs.support_status = 'handled'
                                 and logs.support_request_text = excluded.support_request_text
                            then logs.handled_note end,
        updated_at   = now()
  returning id into v_log;

  -- 7) استبدال المدخلات (الحذف يُتبع بالبنود عبر cascade)
  delete from log_entries where log_id = v_log;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    select * into v_habit from habits where id = (v_entry ->> 'habit_id')::uuid;
    v_ids := case when jsonb_typeof(v_entry -> 'checked_item_ids') = 'array'
                  then array(select distinct (jsonb_array_elements_text(v_entry -> 'checked_item_ids'))::uuid)
                  else '{}'::uuid[] end;
    v_status := (v_entry ->> 'status')::entry_status;
    if v_habit.kind = 'checklist' and v_status <> 'not_required' then
      -- BR-02: الحالة مشتقّة من البنود المعلَّمة، وحالة العميل مُهمَلة
      v_status := case
        when not exists (
          select 1 from active_items_on(v_habit.id, p_period_start) i where i.id <> all (v_ids))
        then 'done' else 'not_done' end::entry_status;
    end if;
    insert into log_entries (log_id, habit_id, status)
    values (v_log, v_habit.id, v_status)
    returning id into v_entry_id;
    insert into log_entry_items (entry_id, habit_item_id)
    select v_entry_id, x from unnest(v_ids) x;
  end loop;

  -- 8) التدقيق (BR-05, F-81): المدير يكتب لغيره أو خارج النافذة
  if v_admin and (v_user <> v_uid or v_outside) then
    insert into audit_log (actor_id, action, target, diff)
    values (v_uid, 'log.admin_save',
            jsonb_build_object('table', 'logs', 'id', v_log),
            jsonb_build_object(
              'user_id', v_user, 'period', p_period, 'period_start', p_period_start,
              'reason', case when v_user <> v_uid and v_outside then 'both'
                             when v_user <> v_uid then 'other_user'
                             else 'outside_window' end));
  end if;

  return v_log;
end
$$;
