-- 0019_audit_forget_deleted_profile: الحذف النهائي لا يُبقي اسم المحذوف في سجلّ التدقيق (F-80، سياسة الخصوصية، و0017).
-- SQL عادي صالح على Supabase (PostgreSQL 17) وعلى العنقود المحلي.
--
-- سياسة الخصوصية تعد بأن يبقى بعد الحذف «سجلّ أدنى» وحده: صفّ user.delete (التاريخ والبريد) الذي تكتبه admin_delete_user.
-- صفوف profile.update التي يكتبها 0017 تحمل اسم الشخص وتغييرات مجموعته ودوره، فتُحذف مع ملفّه. سائر الصفوف تبقى
-- (العادات والمجالس وطلبات الدعم وسجلّات المدير، وهي لا تحمل اسمه). يعمل قبل حذف الملفّ أيًّا كان المسار
-- (admin_delete_user ← cascade من auth.users، أو حذف مباشر).
create or replace function forget_deleted_profile_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from audit_log
   where action like 'profile.%'
     and target ->> 'table' = 'profiles'
     and target ->> 'id' = old.id::text;
  return old;  -- مُشغِّل قبل الحذف: إرجاع null يُلغي الحذف
end
$$;

create or replace trigger forget_deleted_profile_audit
  before delete on profiles
  for each row execute function forget_deleted_profile_audit();

revoke execute on function forget_deleted_profile_audit() from public, anon, authenticated;
