-- 0018_policy_initplan: is_admin() و auth.uid() في السياسات تُلفّ بـ (select …) (المراجعة النهائية db، تأجيل 1.5).
-- SQL عادي صالح على Supabase (PostgreSQL 17) وعلى العنقود المحلي.
--
-- الاستدعاء المجرّد في سياسة يُقيَّم لكل صفّ؛ الملفوف استعلامٌ فرعي لا يرتبط بالصفّ، فيحسبه المخطِّط مرّة لكل استعلام
-- (InitPlan). قيس: قراءة المدير لـ 234 ألف صفّ من log_entry_items من 5.6 ث إلى 0.8 ث. الدلالة نفسها حرفيًا: كل تعبير
-- أدناه هو تعبير 0005 مع اللفّ وحده (أو is_supervisor_of(<عمود>) يبقى كما هو، فهو يتبع الصفّ). اختبارات RLS تبقى خضراء.

-- ───────────── profiles ─────────────
alter policy profiles_select_self_group_admin on profiles
  using (id = (select auth.uid()) or is_supervisor_of(group_id) or (select is_admin()));
alter policy profiles_update_self on profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
alter policy profiles_update_admin on profiles
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy profiles_insert_admin on profiles
  with check ((select is_admin()));
alter policy profiles_delete_admin on profiles
  using ((select is_admin()));

-- ───────────── الجداول المرجعية: الكتابة للمدير ─────────────
alter policy groups_insert_admin on groups with check ((select is_admin()));
alter policy groups_update_admin on groups using ((select is_admin())) with check ((select is_admin()));
alter policy groups_delete_admin on groups using ((select is_admin()));

alter policy group_supervisors_insert_admin on group_supervisors with check ((select is_admin()));
alter policy group_supervisors_update_admin on group_supervisors
  using ((select is_admin())) with check ((select is_admin()));
alter policy group_supervisors_delete_admin on group_supervisors using ((select is_admin()));

alter policy habits_insert_admin on habits with check ((select is_admin()));
alter policy habits_update_admin on habits using ((select is_admin())) with check ((select is_admin()));
alter policy habits_delete_admin on habits using ((select is_admin()));

alter policy habit_items_insert_admin on habit_items with check ((select is_admin()));
alter policy habit_items_update_admin on habit_items using ((select is_admin())) with check ((select is_admin()));
alter policy habit_items_delete_admin on habit_items using ((select is_admin()));

alter policy app_settings_insert_admin on app_settings with check ((select is_admin()));
alter policy app_settings_update_admin on app_settings using ((select is_admin())) with check ((select is_admin()));
alter policy app_settings_delete_admin on app_settings using ((select is_admin()));

-- ───────────── logs, log_entries, log_entry_items ─────────────
alter policy logs_select_owner_supervisor_admin on logs
  using (
    user_id = (select auth.uid())
    or (select is_admin())
    or exists (
      select 1 from profiles p
      where p.id = logs.user_id and is_supervisor_of(p.group_id)
    )
  );

alter policy log_entries_select_owner_supervisor_admin on log_entries
  using (
    exists (
      select 1
      from logs l
      left join profiles p on p.id = l.user_id
      where l.id = log_entries.log_id
        and (l.user_id = (select auth.uid()) or (select is_admin()) or is_supervisor_of(p.group_id))
    )
  );

alter policy log_entry_items_select_owner_supervisor_admin on log_entry_items
  using (
    exists (
      select 1
      from log_entries e
      join logs l on l.id = e.log_id
      left join profiles p on p.id = l.user_id
      where e.id = log_entry_items.entry_id
        and (l.user_id = (select auth.uid()) or (select is_admin()) or is_supervisor_of(p.group_id))
    )
  );

-- ───────────── sessions ─────────────
alter policy sessions_select_member_supervisor_admin on sessions
  using (
    (select is_admin())
    or group_id is null
    or is_supervisor_of(group_id)
    or group_id = (select p.group_id from profiles p where p.id = (select auth.uid()))
  );
alter policy sessions_insert_supervisor_admin on sessions
  with check ((select is_admin()) or (group_id is not null and is_supervisor_of(group_id)));
alter policy sessions_update_supervisor_admin on sessions
  using ((select is_admin()) or (group_id is not null and is_supervisor_of(group_id)))
  with check ((select is_admin()) or (group_id is not null and is_supervisor_of(group_id)));
alter policy sessions_delete_admin on sessions using ((select is_admin()));

-- ───────────── attendance ─────────────
alter policy attendance_select_owner_supervisor_admin on attendance
  using (
    user_id = (select auth.uid())
    or (select is_admin())
    or exists (
      select 1 from profiles p
      where p.id = attendance.user_id and is_supervisor_of(p.group_id)
    )
  );
alter policy attendance_insert_admin on attendance with check ((select is_admin()));
alter policy attendance_update_admin on attendance using ((select is_admin())) with check ((select is_admin()));
alter policy attendance_delete_admin on attendance using ((select is_admin()));

-- ───────────── invitations ─────────────
alter policy invitations_select_admin on invitations using ((select is_admin()));
alter policy invitations_insert_admin on invitations with check ((select is_admin()));
alter policy invitations_update_admin on invitations using ((select is_admin())) with check ((select is_admin()));
alter policy invitations_delete_admin on invitations using ((select is_admin()));

-- ───────────── push_tokens ─────────────
alter policy push_tokens_select_owner on push_tokens using (user_id = (select auth.uid()));
alter policy push_tokens_insert_owner on push_tokens with check (user_id = (select auth.uid()));
alter policy push_tokens_update_owner on push_tokens
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy push_tokens_delete_owner on push_tokens using (user_id = (select auth.uid()));

-- ───────────── deletion_requests ─────────────
alter policy deletion_requests_select_owner_supervisor_admin on deletion_requests
  using (
    user_id = (select auth.uid())
    or (select is_admin())
    or exists (
      select 1 from profiles p
      where p.id = deletion_requests.user_id and is_supervisor_of(p.group_id)
    )
  );
alter policy deletion_requests_update_admin on deletion_requests
  using ((select is_admin())) with check ((select is_admin()));
alter policy deletion_requests_delete_admin on deletion_requests using ((select is_admin()));

-- ───────────── audit_log ─────────────
alter policy audit_log_select_admin on audit_log using ((select is_admin()));
