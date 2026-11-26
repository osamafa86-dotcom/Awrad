-- 0003_logs: السجلّات وإدخالاتها وبنودها (المواصفة §10.2) + دوال التاريخ (§10.3, BR-06, BR-08, BR-12).
-- SQL عادي صالح على Supabase Cloud. لا RLS هنا (المهمة 1.5) ولا RPC كتابة (المهمة 1.6).

-- ───────────── الجداول (§10.2) ─────────────
create table logs (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references profiles(id) on delete cascade,
  period               habit_frequency not null,   -- daily | weekly
  period_start         date not null,              -- اليوم، أو بداية الأسبوع
  note                 text,
  review_text          text,                       -- أسبوعي فقط
  support_request_text text,                       -- أسبوعي فقط
  support_status       support_status not null default 'none',
  handled_by           uuid references profiles(id),
  handled_at           timestamptz,
  handled_note         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, period, period_start)
);

create table log_entries (
  id       uuid primary key default gen_random_uuid(),
  log_id   uuid not null references logs(id) on delete cascade,
  habit_id uuid not null references habits(id),
  status   entry_status not null,
  unique (log_id, habit_id)
);

create table log_entry_items (          -- وجود الصفّ = البند معلَّم
  entry_id      uuid not null references log_entries(id) on delete cascade,
  habit_item_id uuid not null references habit_items(id),
  primary key (entry_id, habit_item_id)
);

create index logs_user_period_start_idx on logs (user_id, period, period_start desc);
create index log_entries_log_id_idx on log_entries (log_id);

-- ───────────── مُشغِّل updated_at ─────────────
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger logs_set_updated_at
  before update on logs
  for each row execute function set_updated_at();

-- ───────────── دوال التاريخ ─────────────
-- منطقة المستخدم: ملفه ثم مجموعته ثم Asia/Riyadh (BR-08). security definer لتُقرأ
-- profiles/groups مهما كانت سياسات RLS في السياق المستدعي.
create function user_timezone(p_user uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select coalesce(p.timezone, g.timezone)
       from profiles p left join groups g on g.id = p.group_id
      where p.id = p_user),
    'Asia/Riyadh')
$$;

-- أول يوم في أسبوع المستخدم (0 = الأحد … 6 = السبت)، افتراضي 0 (BR-06).
create function user_week_starts_on(p_user uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select g.week_starts_on::int
       from profiles p join groups g on g.id = p.group_id
      where p.id = p_user),
    0)
$$;

-- بداية الأسبوع الذي يقع فيه التاريخ (BR-06).
create function week_start(p_date date, p_week_starts_on int)
returns date
language sql immutable
as $$
  select p_date - ((extract(dow from p_date)::int - p_week_starts_on + 7) % 7)
$$;

-- تاريخ «اليوم» بتوقيت المستخدم (BR-08). app.test_now للاختبارات فقط (set_config داخل معاملة).
create function local_today(p_user uuid, p_now timestamptz default now())
returns date
language plpgsql stable security definer set search_path = public
as $$
declare
  v_now timestamptz := coalesce(nullif(current_setting('app.test_now', true), '')::timestamptz, p_now);
begin
  return (v_now at time zone user_timezone(p_user))::date;
end
$$;
