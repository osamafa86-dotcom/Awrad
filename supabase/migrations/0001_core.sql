-- 0001_core: الأنواع المعدودة، المجموعات والإشراف، الملفات، الدعوات، الإعدادات، التدقيق (المواصفة §10.1–10.3)
-- + الدوال المساعدة لـ RLS، ومُشغِّل إنشاء الملف عند التسجيل، وحماية حقول الملف.
-- لا يعتمد إلا على ما توفّره Supabase: auth.users و auth.uid().

-- ───────────── الأنواع المعدودة (§10.1) ─────────────
create type user_role         as enum ('student','supervisor','admin');
create type habit_frequency   as enum ('daily','weekly');
create type habit_kind        as enum ('tristate','checklist');
create type entry_status      as enum ('done','not_done','not_required');
create type attendance_status as enum ('present','absent','excused');
create type support_status    as enum ('none','open','handled');

-- ───────────── الجداول (§10.2) ─────────────
create table groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  timezone       text not null default 'Asia/Riyadh',
  week_starts_on smallint not null default 0 check (week_starts_on between 0 and 6),
  created_at     timestamptz not null default now()
);

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text not null,
  role            user_role not null default 'student',
  group_id        uuid references groups(id),
  timezone        text,                                -- فارغ = منطقة المجموعة
  reminder_time   time,                                -- محلي؛ فارغ = لا تذكير
  weekly_reminder boolean not null default true,
  is_tracked      boolean not null default true,       -- يسجّل أوراده ويظهر في الشبكة والتذكيرات والحضور
  is_active       boolean not null default true,
  joined_at       date not null default current_date,  -- تاريخ الانضمام إلى البرنامج (من الدعوة)
  created_at      timestamptz not null default now()
);

create table group_supervisors (
  group_id uuid not null references groups(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  primary key (group_id, user_id)
);

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  full_name   text not null,
  role        user_role not null default 'student',
  group_id    uuid references groups(id),
  joined_at   date not null default current_date,
  is_tracked  boolean not null default true,
  invited_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

create table app_settings (
  key   text primary key,
  value jsonb not null
);

create table audit_log (
  id         bigserial primary key,
  actor_id   uuid references profiles(id),
  action     text not null,          -- habit.update, attendance.set, log.admin_save, settings.update ...
  target     jsonb,                  -- {table, id}
  diff       jsonb,
  created_at timestamptz not null default now()
);

create index profiles_group_id_idx on profiles (group_id);
create index group_supervisors_user_id_idx on group_supervisors (user_id);

-- ───────────── الإعدادات الافتراضية ─────────────
insert into app_settings (key, value) values
  ('streak_threshold_pct',     '100'),
  ('backfill_days',            '2'),
  ('weekly_grace_days',        '3'),
  ('excused_counts_as_absent', 'false'),
  ('hijri_adjustment_days',    '0'),
  ('default_reminder_time',    '"21:00"')
on conflict (key) do nothing;

-- ───────────── قراءة الإعدادات ─────────────
-- `value #>> '{}'` يستخرج القيمة المفردة من jsonb نصًّا (رقمًا كان أو منطقيًا أو نصًّا).
create or replace function setting_text(p_key text) returns text
language sql stable set search_path = public as $$
  select value #>> '{}' from app_settings where key = p_key
$$;

create or replace function setting_int(p_key text) returns int
language sql stable set search_path = public as $$
  select (value #>> '{}')::int from app_settings where key = p_key
$$;

create or replace function setting_bool(p_key text) returns boolean
language sql stable set search_path = public as $$
  select (value #>> '{}')::boolean from app_settings where key = p_key
$$;

-- ───────────── مساعدات RLS (§10.3) ─────────────
-- security definer حتى لا تمرّ بسياسات RLS على profiles/group_supervisors (تجنّبًا للتكرار اللانهائي).

-- دور المستدعي من ملفه (null إن لم يكن له ملف)، فعّالًا كان أو معطَّلًا.
-- policies must use is_admin()/is_supervisor_of(); never compare current_user_role() to 'admin'.
create or replace function current_user_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- مدير فعّال؛ الحساب المعطَّل يفقد صلاحياته.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and is_active
  )
$$;

-- المستدعي مشرف (فعّال) على المجموعة p_group عبر group_supervisors.
create or replace function is_supervisor_of(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from group_supervisors gs
    join profiles p on p.id = gs.user_id
    where gs.group_id = p_group and gs.user_id = auth.uid() and p.is_active
  )
$$;

-- p_user عضو مُتابَع: ملف فعّال و is_tracked (§5).
create or replace function is_tracked_member(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = p_user and is_active and is_tracked
  )
$$;

-- ───────────── إنشاء الملف عند التسجيل ─────────────
-- بدعوة معلّقة (البريد غير حساس لحالة الأحرف، الأحدث إن تعدّدت): الملف من الدعوة ويُعلَّم قبولها.
-- بلا دعوة: طالب غير فعّال ينتظر تفعيل المدير.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype;
  v_reminder time := setting_text('default_reminder_time')::time;
begin
  select * into inv
  from invitations
  where lower(email) = lower(new.email) and accepted_at is null
  order by created_at desc
  limit 1
  for update;

  if found then
    insert into profiles (id, full_name, role, group_id, joined_at, is_tracked, is_active,
                          reminder_time, weekly_reminder)
    values (new.id, inv.full_name, inv.role, inv.group_id, inv.joined_at, inv.is_tracked, true,
            v_reminder, true);
    update invitations set accepted_at = now() where id = inv.id;
  else
    insert into profiles (id, full_name, role, joined_at, is_tracked, is_active,
                          reminder_time, weekly_reminder)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email), 'student',
            current_date, true, false, v_reminder, true);
  end if;
  return new;
end
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ───────────── حماية حقول الملف ─────────────
-- غير المدير لا يغيّر إلا timezone و reminder_time و weekly_reminder.
-- سياق النظام مسموح له: بلا sub وبدور ليس anon ولا authenticated (المستخدم الأعلى في الترحيلات
-- والبذرة والاختبارات بلا مطالبات، و service_role عبر PostgREST). أما anon فلا يُستثنى.
create or replace function protect_profile_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated'))
     or is_admin() then
    return new;
  end if;
  if (to_jsonb(new) - array['timezone', 'reminder_time', 'weekly_reminder'])
     is distinct from (to_jsonb(old) - array['timezone', 'reminder_time', 'weekly_reminder']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace trigger protect_profile_fields
  before update on profiles
  for each row execute function protect_profile_fields();
