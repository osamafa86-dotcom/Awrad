-- 0005_rls: سياسات أمان الصفوف لكل الجداول (المواصفة §5، §10.4، BR-11).
-- الطالب يرى نفسه فقط، والمشرف مجموعاته فقط، والمدير الكل — في قاعدة البيانات لا في الواجهة.
-- القراءة خارج الصلاحية تُرجع صفرًا من الصفوف لا خطأ (BR-11).
-- كل السياسات `to authenticated`؛ لا سياسات لـ anon إطلاقًا ← صفر صفوف.
-- الشروط عبر is_admin() و is_supervisor_of() (security definer، فلا تكرار لانهائي على profiles)
-- و auth.uid()؛ لا مقارنة لـ current_user_role() بـ 'admin'.
-- لا `force row level security`: مالك الجداول (postgres) يتجاوز RLS، فتبقى دوال security definer
-- (handle_new_user، set_attendance، request_account_deletion، save_log لاحقًا) والبذرة عاملة.
-- SQL عادي صالح على Supabase Cloud، بلا grant/revoke.

-- ───────────── الإشراف يتبع الدور (§5: الدور يحدّد الصلاحيات) ─────────────
-- صف group_supervisors وحده لا يكفي: يلزم أن يكون ملف المستدعي فعّالًا بدور supervisor أو admin،
-- فمن خُفِّض إلى طالب يفقد الإشراف حتى لو بقي صفّه.
create or replace function is_supervisor_of(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from group_supervisors gs
    join profiles p on p.id = gs.user_id
    where gs.group_id = p_group
      and gs.user_id = auth.uid()
      and p.is_active
      and p.role in ('supervisor', 'admin')
  )
$$;

-- عند تخفيض الدور إلى ما دون المشرف تُحذف صفوف إشرافه (security definer ليعمل أيًّا كان المُعدِّل).
create or replace function drop_supervisions_on_demotion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role not in ('supervisor', 'admin') then
    delete from group_supervisors where user_id = new.id;
  end if;
  return new;
end
$$;

create or replace trigger drop_supervisions_on_demotion
  after update of role on profiles
  for each row execute function drop_supervisions_on_demotion();

-- ───────────── تفعيل RLS على الجداول الخمسة عشر ─────────────
alter table groups            enable row level security;
alter table group_supervisors enable row level security;
alter table profiles          enable row level security;
alter table invitations       enable row level security;
alter table app_settings      enable row level security;
alter table audit_log         enable row level security;
alter table habits            enable row level security;
alter table habit_items       enable row level security;
alter table logs              enable row level security;
alter table log_entries       enable row level security;
alter table log_entry_items   enable row level security;
alter table sessions          enable row level security;
alter table attendance        enable row level security;
alter table push_tokens       enable row level security;
alter table deletion_requests enable row level security;

-- ───────────── profiles ─────────────
-- قراءة: الذات؛ مشرف مجموعة الملف؛ المدير. تعديل: الذات (المُشغِّل protect_profile_fields يقصر
-- الحقول على timezone و reminder_time و weekly_reminder) أو المدير. إدراج/حذف: المدير.
create policy profiles_select_self_group_admin on profiles
  for select to authenticated
  using (id = auth.uid() or is_supervisor_of(group_id) or is_admin());

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on profiles
  for update to authenticated
  using (is_admin())
  with check (is_admin());

create policy profiles_insert_admin on profiles
  for insert to authenticated
  with check (is_admin());

create policy profiles_delete_admin on profiles
  for delete to authenticated
  using (is_admin());

-- ───────────── الجداول المرجعية: groups, group_supervisors, habits, habit_items, app_settings ─────────────
-- قراءة: كل مصادَق عليه. كتابة: المدير وحده.
create policy groups_select_authenticated on groups
  for select to authenticated using (true);
create policy groups_insert_admin on groups
  for insert to authenticated with check (is_admin());
create policy groups_update_admin on groups
  for update to authenticated using (is_admin()) with check (is_admin());
create policy groups_delete_admin on groups
  for delete to authenticated using (is_admin());

create policy group_supervisors_select_authenticated on group_supervisors
  for select to authenticated using (true);
create policy group_supervisors_insert_admin on group_supervisors
  for insert to authenticated with check (is_admin());
create policy group_supervisors_update_admin on group_supervisors
  for update to authenticated using (is_admin()) with check (is_admin());
create policy group_supervisors_delete_admin on group_supervisors
  for delete to authenticated using (is_admin());

create policy habits_select_authenticated on habits
  for select to authenticated using (true);
create policy habits_insert_admin on habits
  for insert to authenticated with check (is_admin());
create policy habits_update_admin on habits
  for update to authenticated using (is_admin()) with check (is_admin());
create policy habits_delete_admin on habits
  for delete to authenticated using (is_admin());

create policy habit_items_select_authenticated on habit_items
  for select to authenticated using (true);
create policy habit_items_insert_admin on habit_items
  for insert to authenticated with check (is_admin());
create policy habit_items_update_admin on habit_items
  for update to authenticated using (is_admin()) with check (is_admin());
create policy habit_items_delete_admin on habit_items
  for delete to authenticated using (is_admin());

create policy app_settings_select_authenticated on app_settings
  for select to authenticated using (true);
create policy app_settings_insert_admin on app_settings
  for insert to authenticated with check (is_admin());
create policy app_settings_update_admin on app_settings
  for update to authenticated using (is_admin()) with check (is_admin());
create policy app_settings_delete_admin on app_settings
  for delete to authenticated using (is_admin());

-- ───────────── logs, log_entries, log_entry_items ─────────────
-- قراءة فقط: المالك؛ مشرف مجموعة المالك؛ المدير. لا سياسات insert/update/delete:
-- الكتابة عبر save_log() (security definer، المهمة 1.6) ودوال المدير لاحقًا.
-- مجموعة المالك تُقرأ من profiles داخل الشرط؛ المشرف يرى ملفات مجموعاته فلا يُحجب الربط.
create policy logs_select_owner_supervisor_admin on logs
  for select to authenticated
  using (
    user_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from profiles p
      where p.id = logs.user_id and is_supervisor_of(p.group_id)
    )
  );

create policy log_entries_select_owner_supervisor_admin on log_entries
  for select to authenticated
  using (
    exists (
      select 1
      from logs l
      left join profiles p on p.id = l.user_id
      where l.id = log_entries.log_id
        and (l.user_id = auth.uid() or is_admin() or is_supervisor_of(p.group_id))
    )
  );

create policy log_entry_items_select_owner_supervisor_admin on log_entry_items
  for select to authenticated
  using (
    exists (
      select 1
      from log_entries e
      join logs l on l.id = e.log_id
      left join profiles p on p.id = l.user_id
      where e.id = log_entry_items.entry_id
        and (l.user_id = auth.uid() or is_admin() or is_supervisor_of(p.group_id))
    )
  );

-- ───────────── sessions ─────────────
-- قراءة: المدير؛ المجلس المشترك (group_id فارغ) للجميع؛ مشرف مجموعة المجلس؛ طالب عضو في مجموعته.
-- إدراج/تعديل: المدير، أو المشرف لمجلس مجموعة يشرف عليها (المشترك للمدير وحده). حذف: المدير.
create policy sessions_select_member_supervisor_admin on sessions
  for select to authenticated
  using (
    is_admin()
    or group_id is null
    or is_supervisor_of(group_id)
    or group_id = (select p.group_id from profiles p where p.id = auth.uid())
  );

create policy sessions_insert_supervisor_admin on sessions
  for insert to authenticated
  with check (is_admin() or (group_id is not null and is_supervisor_of(group_id)));

create policy sessions_update_supervisor_admin on sessions
  for update to authenticated
  using (is_admin() or (group_id is not null and is_supervisor_of(group_id)))
  with check (is_admin() or (group_id is not null and is_supervisor_of(group_id)));

create policy sessions_delete_admin on sessions
  for delete to authenticated
  using (is_admin());

-- ───────────── attendance ─────────────
-- قراءة: صفوف المستخدم نفسه؛ مشرف مجموعة صاحب الصفّ؛ المدير.
-- الكتابة المباشرة للمدير وحده؛ المشرف يكتب عبر set_attendance() (security definer، BR-13).
create policy attendance_select_owner_supervisor_admin on attendance
  for select to authenticated
  using (
    user_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from profiles p
      where p.id = attendance.user_id and is_supervisor_of(p.group_id)
    )
  );

create policy attendance_insert_admin on attendance
  for insert to authenticated with check (is_admin());
create policy attendance_update_admin on attendance
  for update to authenticated using (is_admin()) with check (is_admin());
create policy attendance_delete_admin on attendance
  for delete to authenticated using (is_admin());

-- ───────────── invitations ─────────────
-- المدير وحده في كل العمليات (ودالة invite-user بمفتاح الخدمة).
create policy invitations_select_admin on invitations
  for select to authenticated using (is_admin());
create policy invitations_insert_admin on invitations
  for insert to authenticated with check (is_admin());
create policy invitations_update_admin on invitations
  for update to authenticated using (is_admin()) with check (is_admin());
create policy invitations_delete_admin on invitations
  for delete to authenticated using (is_admin());

-- ───────────── push_tokens ─────────────
-- المالك وحده في كل العمليات (حتى المدير لا يرى رموز غيره).
create policy push_tokens_select_owner on push_tokens
  for select to authenticated using (user_id = auth.uid());
create policy push_tokens_insert_owner on push_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy push_tokens_update_owner on push_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_delete_owner on push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- ───────────── deletion_requests ─────────────
-- قراءة: المالك؛ مشرف مجموعة المالك؛ المدير. لا سياسة إدراج (عبر request_account_deletion() فقط).
-- التعديل (المعالجة) والحذف للمدير.
create policy deletion_requests_select_owner_supervisor_admin on deletion_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from profiles p
      where p.id = deletion_requests.user_id and is_supervisor_of(p.group_id)
    )
  );

create policy deletion_requests_update_admin on deletion_requests
  for update to authenticated using (is_admin()) with check (is_admin());
create policy deletion_requests_delete_admin on deletion_requests
  for delete to authenticated using (is_admin());

-- طلب مفتوح واحد لكل مستخدم، مضمون بفهرس فريد جزئي حتى تحت التزامن.
create unique index deletion_requests_one_open_per_user
  on deletion_requests (user_id) where handled_at is null;

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
  insert into deletion_requests (user_id) values (v_uid)
  on conflict (user_id) where handled_at is null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from deletion_requests
     where user_id = v_uid and handled_at is null;
  end if;
  return v_id;
end
$$;

-- ───────────── audit_log ─────────────
-- قراءة للمدير وحده؛ لا سياسات كتابة (تكتبه الدوال بصلاحية مالكها).
create policy audit_log_select_admin on audit_log
  for select to authenticated using (is_admin());
