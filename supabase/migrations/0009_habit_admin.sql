-- 0009_habit_admin: إدارة العادات بيد المدير (F-63، BR-07): مسار «أرشفة واستبدال» وحماية حذف ما له سجلّات.
-- SQL عادي صالح على Supabase Cloud. التعديل في المكان (تصحيح الاسم، الترتيب، الأرشفة بضبط active_to)
-- يمرّ عبر سياسات RLS في 0005 (الكتابة للمدير وحده)؛ هنا ما يحتاج ذرّية أو حماية على مستوى القاعدة.

-- ───────────── فهارس المراجع ─────────────
-- حراسة الحذف ولوحة العادات («هل لهذه العادة سجلّات؟») تبحث بالعادة والبند؛ المفاتيح الحالية تبدأ بالسجلّ.
create index log_entries_habit_id_idx on log_entries (habit_id);
create index log_entry_items_habit_item_id_idx on log_entry_items (habit_item_id);

-- ───────────── حماية الحذف ─────────────
-- عادة أو بند يشير إليه سجلّ لا يُحذف أبدًا (يُؤرشف بدلًا من ذلك)، برمز ثابت تترجمه الواجهة بدل خطأ المفتاح.
create or replace function guard_habit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from log_entries where habit_id = old.id) then
    raise exception using message = 'HABIT_HAS_LOGS', errcode = '22023';
  end if;
  return old;
end
$$;

create or replace function guard_habit_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from log_entry_items where habit_item_id = old.id) then
    raise exception using message = 'HABIT_HAS_LOGS', errcode = '22023';
  end if;
  return old;
end
$$;

create trigger habits_guard_delete
  before delete on habits
  for each row execute function guard_habit_delete();

create trigger habit_items_guard_delete
  before delete on habit_items
  for each row execute function guard_habit_item_delete();

-- ───────────── archive_and_replace_habit ─────────────
-- استبدال محتوى (BR-07): القديمة تنتهي في اليوم السابق لتاريخ التبديل، والجديدة تبدأ منه بنفس التكرار
-- والترتيب. p_new = { name, description?, target_text?, kind?, slug?, items?: [{ name, sort_order? }] }.
-- الأخطاء (ERR-1): FORBIDDEN لغير المدير؛ INACTIVE_HABIT لقديمة غير موجودة أو مؤرشفة؛ DATE_OUT_OF_WINDOW
-- لتاريخ لا يأتي بعد بدء القديمة أو يسبق سجلًّا لها (لا يشير سجلّ أبدًا إلى عادة غير نشطة في تاريخه)؛
-- INVALID_ITEM لحمولة غير صالحة (اسم فارغ، نوع مجهول، قائمة بلا بنود، معرّف نصّي مأخوذ).
create or replace function archive_and_replace_habit(p_old_habit_id uuid, p_new jsonb, p_switch_date date)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_old      habits;
  v_name     text := nullif(btrim(p_new->>'name'), '');
  v_kind     text;
  v_slug     text;
  v_base     text;
  v_suffix   int := 1;
  v_items    jsonb := p_new->'items';
  v_item     jsonb;
  v_position int := 0;
  v_new_id   uuid;
begin
  if not is_admin() then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;

  select * into v_old from habits where id = p_old_habit_id for update;
  if not found or v_old.active_to is not null then
    raise exception using message = 'INACTIVE_HABIT', errcode = '22023';
  end if;

  if p_switch_date is null or p_switch_date <= v_old.active_from or exists (
    select 1
    from log_entries e join logs l on l.id = e.log_id
    where e.habit_id = v_old.id and l.period_start >= p_switch_date
  ) then
    raise exception using message = 'DATE_OUT_OF_WINDOW', errcode = '22023';
  end if;

  v_kind := coalesce(p_new->>'kind', v_old.kind::text);
  if v_name is null or v_kind not in ('tristate', 'checklist') then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;
  if v_kind = 'checklist' and (
    v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0
    or exists (
      select 1 from jsonb_array_elements(v_items) x
      where jsonb_typeof(x) <> 'object' or nullif(btrim(x->>'name'), '') is null
    )
  ) then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  v_slug := nullif(btrim(p_new->>'slug'), '');
  if v_slug is not null then
    if exists (select 1 from habits where slug = v_slug) then
      raise exception using message = 'INVALID_ITEM', errcode = '22023';
    end if;
  else
    v_base := v_old.slug || '_' || to_char(p_switch_date, 'YYYYMMDD');
    v_slug := v_base;
    while exists (select 1 from habits where slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug := v_base || '_' || v_suffix;
    end loop;
  end if;

  update habits set active_to = p_switch_date - 1 where id = v_old.id;

  insert into habits (slug, name, description, target_text, frequency, kind, sort_order, active_from)
  values (v_slug, v_name, nullif(btrim(p_new->>'description'), ''), nullif(btrim(p_new->>'target_text'), ''),
          v_old.frequency, v_kind::habit_kind, v_old.sort_order, p_switch_date)
  returning id into v_new_id;

  if v_kind = 'checklist' then
    for v_item in select x from jsonb_array_elements(v_items) x loop
      v_position := v_position + 1;
      insert into habit_items (habit_id, name, sort_order, active_from)
      values (v_new_id, btrim(v_item->>'name'), coalesce((v_item->>'sort_order')::int, v_position),
              p_switch_date);
    end loop;
  end if;

  insert into audit_log (actor_id, action, target, diff)
  values (auth.uid(), 'habit.replace',
          jsonb_build_object('table', 'habits', 'id', v_old.id),
          jsonb_build_object('new_id', v_new_id, 'switch_date', p_switch_date));

  return v_new_id;
end
$$;

-- للمستخدمين المسجَّلين وحدهم؛ لا لـ anon (الامتياز الافتراضي يمنح التنفيذ للجميع).
revoke execute on function archive_and_replace_habit(uuid, jsonb, date) from public, anon;
grant execute on function archive_and_replace_habit(uuid, jsonb, date) to authenticated;
