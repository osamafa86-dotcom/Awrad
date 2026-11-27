-- 0017_audit_admin_changes: تدقيق التغييرات الإدارية المباشرة (F-81، المراجعة النهائية db I3).
-- SQL عادي صالح على Supabase (PostgreSQL 17) وعلى العنقود المحلي.
--
-- اللوحة تكتب العادات وبنودها، وحذف المجالس، وتعديل الملفّات مباشرةً على الجداول تحت RLS (0005)، و audit_log بلا
-- سياسة إدراج فلم يكن يُكتب لها صفّ. هنا مُشغِّلات security definer تكتب صفًّا لكل تغيير بشكل الصفوف القائمة:
--   actor_id = auth.uid()، action = '<الكيان>.<العملية>'، target = {table, id}، diff = {عمود: {old, new}} لما تغيّر.
--   - habits / habit_items: create، update، archive (active_to من فارغ إلى تاريخ)، delete.
--   - sessions: delete، مع attendance_count = عدد علامات الحضور التي تُحذف معه (cascade).
--   - profiles: update لتغيّر role أو group_id أو is_active أو is_tracked أو joined_at أو full_name فقط؛ فتعديل
--     المستخدم حقوله الذاتية (timezone، reminder_time، weekly_reminder) لا يكتب صفًّا.
-- بلا مطالبات (auth.uid() فارغ: الترحيلات والبذرة وخطوات النظام في الاستيراد) لا صفّ. تحديث لا يغيّر شيئًا لا صفّ.

-- ───────────── audit_diff ─────────────
-- {عمود: {old, new}} للأعمدة p_columns التي اختلفت قيمتها بين p_old و p_new (أيّهما قد يكون null: إنشاء أو حذف).
create or replace function audit_diff(p_old jsonb, p_new jsonb, p_columns text[]) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(
    jsonb_object_agg(c, jsonb_build_object('old', coalesce(p_old -> c, 'null'::jsonb),
                                           'new', coalesce(p_new -> c, 'null'::jsonb))),
    '{}'::jsonb)
  from unnest(p_columns) as c
  where coalesce(p_old -> c, 'null'::jsonb) is distinct from coalesce(p_new -> c, 'null'::jsonb)
$$;

-- ───────────── العادات وبنودها والملفّات (بعد الكتابة) ─────────────
create or replace function audit_admin_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor   uuid := auth.uid();
  v_old     jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new     jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_entity  text;
  v_columns text[];
  v_op      text;
  v_diff    jsonb;
begin
  if v_actor is null then
    return null;  -- مُشغِّل بعد الكتابة: القيمة المُرجعة مُهمَلة
  end if;

  case tg_table_name
    when 'habits' then
      v_entity := 'habit';
      v_columns := array['slug', 'name', 'description', 'target_text', 'frequency', 'kind', 'sort_order',
                         'active_from', 'active_to'];
    when 'habit_items' then
      v_entity := 'habit_item';
      v_columns := array['habit_id', 'name', 'sort_order', 'active_from', 'active_to'];
    when 'profiles' then
      v_entity := 'profile';
      v_columns := array['full_name', 'role', 'group_id', 'is_active', 'is_tracked', 'joined_at'];
  end case;

  v_op := case tg_op
    when 'INSERT' then 'create'
    when 'DELETE' then 'delete'
    else case when v_old ->> 'active_to' is null and v_new ->> 'active_to' is not null
                   and tg_table_name <> 'profiles'
              then 'archive' else 'update' end
  end;

  v_diff := audit_diff(v_old, v_new, v_columns);
  if v_diff = '{}'::jsonb then
    return null;
  end if;

  insert into audit_log (actor_id, action, target, diff)
  values (v_actor, v_entity || '.' || v_op,
          jsonb_build_object('table', tg_table_name, 'id', coalesce(v_new, v_old) ->> 'id'),
          v_diff);
  return null;
end
$$;

create or replace trigger audit_habits
  after insert or update or delete on habits
  for each row execute function audit_admin_change();

create or replace trigger audit_habit_items
  after insert or update or delete on habit_items
  for each row execute function audit_admin_change();

create or replace trigger audit_profiles
  after update on profiles
  for each row execute function audit_admin_change();

-- ───────────── حذف المجلس (قبل الحذف، لعدّ الحضور قبل أن يحذفه cascade) ─────────────
-- RLS تُصفّي الصفوف قبل المُشغِّل، فلا صفّ لمحاولة حذف ممنوعة. خطأ لاحق يُلغي الحذف وصفّ التدقيق معًا (معاملة واحدة).
create or replace function audit_session_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  if v_actor is not null then
    select count(*)::int into v_count from attendance where session_id = old.id;
    insert into audit_log (actor_id, action, target, diff)
    values (v_actor, 'session.delete',
            jsonb_build_object('table', 'sessions', 'id', old.id),
            audit_diff(to_jsonb(old), null, array['group_id', 'session_date', 'title'])
              || jsonb_build_object('attendance_count', jsonb_build_object('old', v_count, 'new', null)));
  end if;
  return old;  -- مُشغِّل قبل الحذف: إرجاع null يُلغي الحذف
end
$$;

create or replace trigger audit_session_delete
  before delete on sessions
  for each row execute function audit_session_delete();

-- دوال المُشغِّلات لا تُستدعى مباشرة؛ لا تنفيذ لغير المالك.
revoke execute on function audit_admin_change() from public, anon, authenticated;
revoke execute on function audit_session_delete() from public, anon, authenticated;
