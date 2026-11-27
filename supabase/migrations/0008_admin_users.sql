-- 0008_admin_users: حذف حساب نهائيًا بيد المدير (F-61، المواصفة §13؛ يُعاد استعماله في صندوق طلبات الحذف).
-- SQL عادي صالح على Supabase Cloud.
--
-- الحذف من auth.users يتسلسل إلى profiles وكل ما تحته (logs وإدخالاتها، attendance، push_tokens،
-- deletion_requests، group_supervisors). الأعمدة التي تشير إلى المحذوف بصفته فاعلًا (من دعا، من سجّل
-- الحضور، من عالج الطلب، من أنشأ المجلس، فاعل التدقيق) تصير فارغة بدل أن تمنع الحذف، فيبقى تاريخ الآخرين.

-- ───────────── مراجع الفاعل: on delete set null ─────────────
alter table invitations
  drop constraint invitations_invited_by_fkey,
  add constraint invitations_invited_by_fkey
    foreign key (invited_by) references profiles(id) on delete set null;

alter table audit_log
  drop constraint audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey
    foreign key (actor_id) references profiles(id) on delete set null;

alter table logs
  drop constraint logs_handled_by_fkey,
  add constraint logs_handled_by_fkey
    foreign key (handled_by) references profiles(id) on delete set null;

alter table sessions
  drop constraint sessions_created_by_fkey,
  add constraint sessions_created_by_fkey
    foreign key (created_by) references profiles(id) on delete set null;

alter table attendance
  drop constraint attendance_recorded_by_fkey,
  add constraint attendance_recorded_by_fkey
    foreign key (recorded_by) references profiles(id) on delete set null;

alter table deletion_requests
  drop constraint deletion_requests_handled_by_fkey,
  add constraint deletion_requests_handled_by_fkey
    foreign key (handled_by) references profiles(id) on delete set null;

-- ───────────── admin_delete_user ─────────────
-- مدير فعّال فقط، ولا يحذف نفسه (FORBIDDEN بـ 42501). يكتب صفّ تدقيق user.delete ثم يحذف الحساب.
-- معرّف بلا حساب: لا شيء يُحذف ولا يُكتب.
create or replace function admin_delete_user(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not is_admin() or p_user_id = auth.uid() then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if not found then
    return;
  end if;

  insert into audit_log (actor_id, action, target)
  values (auth.uid(), 'user.delete',
          jsonb_build_object('table', 'auth.users', 'id', p_user_id, 'email', v_email));

  delete from auth.users where id = p_user_id;
end
$$;

-- للمستخدمين المسجَّلين وحدهم؛ لا لـ anon (الامتياز الافتراضي يمنح التنفيذ للجميع).
revoke execute on function admin_delete_user(uuid) from public, anon;
grant execute on function admin_delete_user(uuid) to authenticated;
