-- 0002_habits: العادات وبنودها (المواصفة §10.2) + دوال النشاط بالتاريخ (§10.3, BR-07).
-- SQL عادي صالح على Supabase Cloud؛ البذرة في supabase/seed.sql.

create table habits (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,         -- quran_wird, adhkar, qiyam, tafsir_ibn_juzayy, sahihayn, ...
  name         text not null,
  description  text,
  target_text  text,                         -- «ست أرباع يوميًا»
  frequency    habit_frequency not null,
  kind         habit_kind not null default 'tristate',
  sort_order   int not null default 0,
  active_from  date not null default current_date,
  active_to    date,
  created_at   timestamptz not null default now(),
  check (active_to is null or active_to >= active_from)
);

create table habit_items (
  id          uuid primary key default gen_random_uuid(),
  habit_id    uuid not null references habits(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  active_from date not null default current_date,
  active_to   date
);

create index habits_frequency_sort_idx on habits (frequency, sort_order);
create index habit_items_habit_sort_idx on habit_items (habit_id, sort_order);

-- العادات النشطة في تاريخ معيّن (شاملة الطرفين): active_from <= d and (active_to is null or d <= active_to)
create function active_habits_on(p_date date, p_frequency habit_frequency)
returns setof habits
language sql stable
as $$
  select h.*
  from habits h
  where h.frequency = p_frequency
    and h.active_from <= p_date
    and (h.active_to is null or p_date <= h.active_to)
  order by h.sort_order, h.slug
$$;

-- بنود قائمة اختيار نشطة في تاريخ معيّن.
create function active_items_on(p_habit uuid, p_date date)
returns setof habit_items
language sql stable
as $$
  select i.*
  from habit_items i
  where i.habit_id = p_habit
    and i.active_from <= p_date
    and (i.active_to is null or p_date <= i.active_to)
  order by i.sort_order
$$;
