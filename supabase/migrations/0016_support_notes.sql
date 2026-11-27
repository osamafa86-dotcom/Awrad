-- 0016_support_notes: الملاحظة الداخلية لطلب الدعم للطاقم وحده (المراجعة النهائية db I2، القرار FIN-8؛ F-64، D6).
-- SQL عادي صالح على Supabase (PostgreSQL 17) وعلى العنقود المحلي.
--
-- قبلها: logs.handled_note عمود في صفّ الطالب نفسه، وسياسة القراءة على logs (0005) تشمل كل الأعمدة، فكان الطالب يقرأ
-- «الملاحظة الداخلية» بطلب REST واحد، وتطبيقه ينزّلها مع كل سجلّ أسبوعي (select('*')).
-- الآن: جدول support_notes مستقلّ — يقرؤه المدير ومشرف مجموعة صاحب السجلّ (لا الطالب ولا مشرف مجموعة أخرى ولا anon)،
-- ولا يكتبه أحد مباشرة: handle_support_request (security definer) تكتبه، وإعادة فتح الطلب (BR-10) تحذفه بمُشغِّل.
-- العمود يُحذف من logs بعد نقل ما فيه، فلا يعيده أي مسار قراءة. handled_by و handled_at يبقيان في logs (حالة الطلب).

-- ───────────── support_notes ─────────────
create table support_notes (
  log_id     uuid primary key references logs(id) on delete cascade,
  note       text not null check (btrim(note) <> ''),
  updated_at timestamptz not null default now()
);

alter table support_notes enable row level security;

-- القراءة: المدير، أو مشرف مجموعة صاحب السجلّ. الشرط يقرأ logs و profiles بصلاحيات المستدعي، والمشرف يرى سجلّات
-- مجموعاته وملفّاتها، فلا يُحجب الربط. لا سياسات كتابة.
create policy support_notes_select_supervisor_admin on support_notes
  for select to authenticated
  using (
    (select is_admin())
    or exists (
      select 1
      from logs l
      join profiles p on p.id = l.user_id
      where l.id = support_notes.log_id and is_supervisor_of(p.group_id)
    )
  );

-- الامتيازات صريحة (الافتراضية تمنح anon و authenticated كل شيء): القراءة لـ authenticated وحده، وRLS تكمل.
revoke all on table support_notes from public, anon, authenticated;
grant select on table support_notes to authenticated;
grant all on table support_notes to service_role;

-- نقل الملاحظات القائمة قبل حذف العمود.
insert into support_notes (log_id, note)
select id, btrim(handled_note)
  from logs
 where support_status = 'handled' and nullif(btrim(handled_note), '') is not null;

-- ───────────── إعادة الفتح تحذف الملاحظة (BR-10) ─────────────
-- أي مسار يُخرج الطلب من «تمّت المعالجة» (save_log اليوم) يحذف ملاحظته، كما كان يُفرغ handled_note.
create or replace function clear_support_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from support_notes where log_id = new.id;
  return new;
end
$$;

create or replace trigger clear_support_note
  after update of support_status on logs
  for each row
  when (old.support_status = 'handled' and new.support_status is distinct from 'handled')
  execute function clear_support_note();

-- ───────────── handle_support_request: الملاحظة إلى support_notes ─────────────
-- كما في 0010، عدا الملاحظة: تُقصّ؛ الفارغة تحذف أي ملاحظة سابقة، وغيرها تُدرج أو تستبدل.
create or replace function handle_support_request(p_log_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_status support_status;
  v_group  uuid;
  v_note   text := nullif(btrim(p_note), '');
begin
  select l.support_status, p.group_id into v_status, v_group
  from logs l join profiles p on p.id = l.user_id
  where l.id = p_log_id
  for update of l;

  if not is_admin() and (not found or v_group is null or not is_supervisor_of(v_group)) then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  if v_status is null or v_status = 'none' then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  update logs
  set support_status = 'handled',
      handled_by     = auth.uid(),
      handled_at     = now()
  where id = p_log_id;

  if v_note is null then
    delete from support_notes where log_id = p_log_id;
  else
    insert into support_notes (log_id, note) values (p_log_id, v_note)
    on conflict (log_id) do update set note = excluded.note, updated_at = now();
  end if;

  insert into audit_log (actor_id, action, target)
  values (auth.uid(), 'support.handle', jsonb_build_object('table', 'logs', 'id', p_log_id));
end
$$;

revoke execute on function handle_support_request(uuid, text) from public, anon;
grant execute on function handle_support_request(uuid, text) to authenticated;

-- ───────────── save_log: بلا handled_note ─────────────
-- نصّ 0006 حرفيًا عدا سطر handled_note في do update (حذفُ الملاحظة عند إعادة الفتح صار في clear_support_note).
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

-- الامتيازات كما كانت منذ 0006 (الافتراضية؛ anon يُرفض داخل الدالة بـ FORBIDDEN)، تُعاد صراحةً بعد create or replace.
grant execute on function save_log(habit_frequency, date, jsonb, text, text, text, uuid) to authenticated;

-- ───────────── حذف العمود ─────────────
alter table logs drop column handled_note;
