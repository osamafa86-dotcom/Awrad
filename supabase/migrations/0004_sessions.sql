-- 0004_sessions: المجالس والحضور ورموز الإشعارات وطلبات الحذف (المواصفة §10.2) + RPC (§10.3, BR-13).
-- SQL عادي صالح على Supabase Cloud. لا RLS هنا (المهمة 1.5).

-- ───────────── الجداول (§10.2) ─────────────
create table sessions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid references groups(id),     -- فارغ = مجلس مشترك لكل المجموعات
  session_date date not null,
  title        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  status      attendance_status not null,
  recorded_by uuid references profiles(id),
  recorded_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('ios','android')),  -- لا إشعارات ويب في النسخة الأولى (D16)
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create table deletion_requests (          -- طلب حذف الحساب من داخل التطبيق (F-52)
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  handled_at   timestamptz,
  handled_by   uuid references profiles(id)
);

create index attendance_user_id_idx on attendance (user_id);
create index sessions_group_date_idx on sessions (group_id, session_date);

-- ───────────── set_attendance (BR-13) ─────────────
-- p_rows = [{"user_id": "<uuid>", "status": "present|absent|excused"}, ...]؛ تُرجع عدد الصفوف المعالَجة.
-- المدير يُعلّم أي مستخدم مُتابَع؛ المشرف في مجالس مجموعاته والمشتركة ولطلاب مجموعاته فقط.
create or replace function set_attendance(p_session_id uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_admin   boolean := is_admin();
  v_group   uuid;
  v_found   boolean;
  v_row     jsonb;
  v_user    uuid;
  v_status  attendance_status;
  v_ugroup  uuid;
  v_count   int := 0;
begin
  -- 1) الصلاحية على المجلس (مجلس غير موجود = FORBIDDEN كي لا يُسرَّب وجوده)
  select s.group_id, true into v_group, v_found from sessions s where s.id = p_session_id;
  if v_uid is null or not coalesce(v_found, false) then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  if not v_admin then
    if not exists (select 1 from group_supervisors where user_id = v_uid)
       or (v_group is not null and not is_supervisor_of(v_group)) then
      raise exception using message = 'FORBIDDEN', errcode = '42501';
    end if;
  end if;

  -- 2) شكل الصفوف
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row -> 'user_id') is distinct from 'string'
       or (v_row ->> 'user_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_row -> 'status') is distinct from 'string'
       or (v_row ->> 'status') not in ('present', 'absent', 'excused') then
      raise exception using message = 'INVALID_ITEM', errcode = '22023';
    end if;
  end loop;

  -- المشرف: كل مستخدم ضمن مجموعة يشرف عليها
  if not v_admin then
    for v_row in select value from jsonb_array_elements(p_rows) loop
      select p.group_id into v_ugroup from profiles p where p.id = (v_row ->> 'user_id')::uuid;
      if v_ugroup is null or not is_supervisor_of(v_ugroup) then
        raise exception using message = 'FORBIDDEN', errcode = '42501';
      end if;
    end loop;
  end if;

  -- المستخدم مُتابَع، وفي مجموعة المجلس إن كان المجلس لمجموعة
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_user := (v_row ->> 'user_id')::uuid;
    if not is_tracked_member(v_user)
       or (v_group is not null
           and (select p.group_id from profiles p where p.id = v_user) is distinct from v_group) then
      raise exception using message = 'INVALID_ITEM', errcode = '22023';
    end if;
  end loop;

  -- 3) الإدراج/التحديث
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_user := (v_row ->> 'user_id')::uuid;
    v_status := (v_row ->> 'status')::attendance_status;
    insert into attendance (session_id, user_id, status, recorded_by, recorded_at)
    values (p_session_id, v_user, v_status, v_uid, now())
    on conflict (session_id, user_id)
    do update set status = excluded.status,
                  recorded_by = excluded.recorded_by,
                  recorded_at = excluded.recorded_at;
    v_count := v_count + 1;
  end loop;

  -- 4) التدقيق (F-81)
  insert into audit_log (actor_id, action, target, diff)
  values (v_uid, 'attendance.set',
          jsonb_build_object('table', 'sessions', 'id', p_session_id),
          jsonb_build_object('rows', v_count));

  return v_count;
end
$$;

-- ───────────── request_account_deletion (F-52) ─────────────
create or replace function request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  select id into v_id from deletion_requests
   where user_id = v_uid and handled_at is null
   order by requested_at limit 1;
  if v_id is null then
    insert into deletion_requests (user_id) values (v_uid) returning id into v_id;
  end if;
  return v_id;
end
$$;
