-- 0015_timezone_guard: منطقة الملف والمجموعة تُتحقَّق عند الكتابة، والقراءة لا تنكسر بقيمة قديمة (المراجعة النهائية db I1، BR-08).
-- SQL عادي صالح على Supabase (PostgreSQL 17) وعلى العنقود المحلي.
--
-- قبلها: الطالب يكتب في profiles.timezone أي نصّ (protect_profile_fields يسمح بالحقل)، فقيمة مثل 'Mars/Olympus' أو ''
-- تصل إلى `at time zone` لكل مرشّح في due_reminders، فتفشل الاستعلامة كلها ولا يصل تذكير لأحد.
-- الآن:
--   1) الكتابة: مُشغِّل على profiles و groups يرفض منطقة ليست في pg_timezone_names (INVALID_ITEM، 22023)؛ والفارغة
--      (بعد القصّ) في الملف تُخزَّن null أي «منطقة المجموعة». منطقة المجموعة إلزامية، فالفارغة فيها مرفوضة.
--   2) القراءة: user_timezone تتخطّى قيمة لا يقبلها `at time zone` إلى منطقة المجموعة ثم Asia/Riyadh، فصفّ واحد
--      مخزَّن قبل هذا الترحيل لا يُسقط الدفعة. الفحص هنا بالتجربة (رخيص) لا بمسح pg_timezone_names (≈10ms لكل نداء).
--   3) القيم غير الصالحة المخزَّنة تُصحَّح الآن: الملف ← null، والمجموعة ← Asia/Riyadh.

-- ───────────── timezone_is_usable ─────────────
-- هل يقبل `at time zone` هذا الاسم؟ لا يرمي أبدًا. أوسع من pg_timezone_names (يقبل 'UTC+3' مثلًا)، وهذا يكفي للقراءة:
-- المهمّ ألّا ينكسر الاستعلام. التحقّق الصارم عند الكتابة أدناه.
create or replace function timezone_is_usable(p_zone text) returns boolean
language plpgsql stable set search_path = public as $$
begin
  if p_zone is null or btrim(p_zone) = '' then
    return false;
  end if;
  perform timestamptz '2000-01-01 00:00+00' at time zone p_zone;
  return true;
exception when invalid_parameter_value then
  return false;
end
$$;

-- ───────────── user_timezone: الملف ← المجموعة ← Asia/Riyadh، متخطّيةً ما لا يصلح ─────────────
-- الامتيازات تُحفَظ مع create or replace (الافتراضية: التنفيذ للجميع، كما في 0003).
create or replace function user_timezone(p_user uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select case when timezone_is_usable(p.timezone) then p.timezone
                 when timezone_is_usable(g.timezone) then g.timezone end
       from profiles p left join groups g on g.id = p.group_id
      where p.id = p_user),
    'Asia/Riyadh')
$$;

-- ───────────── تصحيح القيم المخزَّنة ─────────────
-- دالة للمالك وحده (تستعملها الاختبارات أيضًا). سياق النظام (بلا مطالبات) فلا يمنعه protect_profile_fields.
create or replace function clear_invalid_timezones() returns void
language sql volatile set search_path = public as $$
  update profiles set timezone = null
   where timezone is not null
     and not exists (select 1 from pg_timezone_names z where z.name = profiles.timezone);
  update groups set timezone = 'Asia/Riyadh'
   where not exists (select 1 from pg_timezone_names z where z.name = groups.timezone);
$$;
revoke execute on function clear_invalid_timezones() from public, anon, authenticated;

select clear_invalid_timezones();

-- ───────────── التحقّق عند الكتابة ─────────────
create or replace function validate_timezone() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'profiles' then
    new.timezone := nullif(btrim(new.timezone), '');
    if new.timezone is null then
      return new;
    end if;
  else
    new.timezone := btrim(new.timezone);
  end if;
  if new.timezone is null
     or not exists (select 1 from pg_timezone_names z where z.name = new.timezone) then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;
  return new;
end
$$;

create or replace trigger validate_profile_timezone
  before insert or update of timezone on profiles
  for each row execute function validate_timezone();

create or replace trigger validate_group_timezone
  before insert or update of timezone on groups
  for each row execute function validate_timezone();
