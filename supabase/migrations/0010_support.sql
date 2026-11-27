-- 0010_support: صندوق طلبات الدعم (F-64، BR-10، D6). SQL عادي صالح على Supabase Cloud.
-- لا سياسة كتابة مباشرة على logs (0005)؛ وضع «تمّت المعالجة» يمرّ من هنا وحده، وإعادة الفتح عند تعديل
-- الطالب النصّ تبقى في save_log (0006)، وهي تُفرغ handled_by/at/note حين تُعيد الطلب مفتوحًا.

-- ───────────── handle_support_request ─────────────
-- المدير الفعّال أو مشرف مجموعة صاحب السجلّ. الأخطاء (ERR-1): FORBIDDEN لغيرهما (ولمعرّف مجهول عند
-- غير المدير، كي لا يُكشف وجوده)؛ INVALID_ITEM لسجلّ غير موجود أو بلا طلب دعم (support_status = none).
-- الملاحظة الداخلية اختيارية: تُقصّ، والفارغة تُخزَّن null. معالجة طلب معالَج تُحدّث فاعله وملاحظته.
create or replace function handle_support_request(p_log_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_status support_status;
  v_group  uuid;
begin
  select l.support_status, p.group_id into v_status, v_group
  from logs l join profiles p on p.id = l.user_id
  where l.id = p_log_id
  for update of l;

  if not is_admin() and (not found or v_group is null or not is_supervisor_of(v_group)) then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  if v_status is null or v_status = 'none' then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  update logs
  set support_status = 'handled',
      handled_by     = auth.uid(),
      handled_at     = now(),
      handled_note   = nullif(btrim(p_note), '')
  where id = p_log_id;

  insert into audit_log (actor_id, action, target)
  values (auth.uid(), 'support.handle', jsonb_build_object('table', 'logs', 'id', p_log_id));
end
$$;

-- للمستخدمين المسجَّلين وحدهم؛ لا لـ anon (الامتياز الافتراضي يمنح التنفيذ للجميع).
revoke execute on function handle_support_request(uuid, text) from public, anon;
grant execute on function handle_support_request(uuid, text) to authenticated;
