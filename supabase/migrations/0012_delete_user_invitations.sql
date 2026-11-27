-- 0012_delete_user_invitations: الحذف النهائي يُزيل دعوات الحساب أيضًا (F-80، المواصفة §13، القرار DEL-1).
-- SQL عادي صالح على Supabase Cloud.
--
-- الدعوة المقبولة تبقى بعد حذف الحساب ومعها البريد والاسم والمجموعة؛ سياسة الخصوصية تعد بإزالتها. فتحذف
-- admin_delete_user الآن كل صفّ في invitations ببريد المحذوف (دون اعتبار حالة الأحرف، مقبولًا أو معلّقًا) قبل
-- حذف الحساب. يبقى صفّ التدقيق user.delete وحده سجلًّا أدنى للحذف ({table, id, email}). القواعد كما في 0008:
-- مدير فعّال فقط، ولا يحذف نفسه (FORBIDDEN بـ 42501)، ومعرّف بلا حساب لا يغيّر شيئًا.
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

  delete from invitations where lower(email) = lower(v_email);

  delete from auth.users where id = p_user_id;
end
$$;

-- create or replace يحفظ الامتيازات؛ تُعاد هنا صراحةً كما في 0008.
revoke execute on function admin_delete_user(uuid) from public, anon;
grant execute on function admin_delete_user(uuid) to authenticated;
