-- 0013_reminders: التذكيرات (المواصفة §12، D16، BR-05، BR-08؛ القرار REM-1 وREM-2).
-- SQL عادي صالح على Supabase Cloud. لا يعتمد على pg_cron ولا pg_net: الجدولة محروسة (انظر ensure_reminder_schedule).
--
-- مهمّة كل ساعة (الدقيقة 0) تستدعي دالة Edge `send-reminders`، فتسأل due_reminders(now()) بمفتاح الخدمة: من له تذكير
-- في هذه الساعة؟ ترسل عبر Expo وتكتب reminder_log فلا يتكرّر التذكير نفسه. تذكيران فقط، وكلاهما يُطفأ من الإعدادات:
-- يومي (reminder_time فارغ = لا تذكير) وأسبوعي (weekly_reminder).

-- ───────────── reminder_log ─────────────
-- صفّ لكل تذكير أُرسل: sent_for هو اليوم المحلي (يومي) أو بداية الأسبوع (أسبوعي).
-- RLS مفعّلة بلا سياسات: لا يقرؤها ولا يكتبها إلا service_role (يتجاوز RLS).
create table reminder_log (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references profiles(id) on delete cascade,
  kind     text not null check (kind in ('daily', 'weekly')),
  sent_for date not null,
  sent_at  timestamptz not null default now(),
  unique (user_id, kind, sent_for)
);

alter table reminder_log enable row level security;

-- ───────────── due_reminders ─────────────
-- التذكيرات المستحقّة عند p_now، صفّ لكل (مستخدم، نوع) مع رموز أجهزته:
-- - يومي: ملف فعّال مُتابَع، reminder_time غير فارغ وساعته = ساعة p_now بمنطقته (الملف ← المجموعة ← Asia/Riyadh)،
--   ولا سجلّ daily لـ local_today، ولا reminder_log (daily، ذلك اليوم)، وله رمز واحد على الأقل.
-- - أسبوعي: الشروط نفسها مع weekly_reminder، و local_today آخر يوم في أسبوع مجموعته، ولا سجلّ weekly لبداية
--   الأسبوع، ولا reminder_log (weekly، بداية الأسبوع).
-- لمفتاح الخدمة وحده (دالة send-reminders)؛ غيره FORBIDDEN.
create function due_reminders(p_now timestamptz)
returns table (user_id uuid, kind text, sent_for date, tokens text[])
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;

  return query
  with candidates as (
    select p.id,
           p.weekly_reminder,
           local_today(p.id, p_now) as today,
           user_week_starts_on(p.id) as week_starts_on,
           array_agg(t.token order by t.token) as tokens
      from profiles p
      join push_tokens t on t.user_id = p.id
     where p.is_active
       and p.is_tracked
       and p.reminder_time is not null
       and extract(hour from p.reminder_time) = extract(hour from p_now at time zone user_timezone(p.id))
     group by p.id
  ),
  due as (
    select c.id, 'daily'::text as kind, c.today as sent_for, c.tokens
      from candidates c
    union all
    select c.id, 'weekly'::text, week_start(c.today, c.week_starts_on), c.tokens
      from candidates c
     where c.weekly_reminder
       and c.today = week_start(c.today, c.week_starts_on) + 6
  )
  select d.id, d.kind, d.sent_for, d.tokens
    from due d
   where not exists (select 1 from logs l
                      where l.user_id = d.id
                        and l.period = d.kind::habit_frequency
                        and l.period_start = d.sent_for)
     and not exists (select 1 from reminder_log r
                      where r.user_id = d.id
                        and r.kind = d.kind
                        and r.sent_for = d.sent_for)
   order by d.id, d.kind;
end
$$;

revoke execute on function due_reminders(timestamptz) from public, anon;
grant execute on function due_reminders(timestamptz) to authenticated, service_role;

-- ───────────── الجدولة (REM-1) ─────────────
-- تُنشئ مهمّة pg_cron «send-reminders» كل ساعة عند الدقيقة 0 (أو تعيد إنشاءها) إن وُجد pg_cron و pg_net وكان
-- app.functions_url و app.cron_secret مضبوطين على قاعدة البيانات؛ وإلا تكتب notice وترجع false. آمنة للتكرار: تحذف
-- المهمّة السابقة بالاسم نفسه أوّلًا. للمدير الفعّال ومفتاح الخدمة وسياق النظام (الترحيل)؛ غيرهم FORBIDDEN.
-- القيمتان تُقرآن عند كل تشغيل للمهمّة (لا تُنسخ في cron.job). التمكين: docs/dev-setup.md.
create function ensure_reminder_schedule()
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not ((auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated')) or is_admin()) then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;

  if (select count(*) from pg_extension where extname in ('pg_cron', 'pg_net')) < 2 then
    raise notice 'ensure_reminder_schedule: pg_cron/pg_net not installed; send-reminders not scheduled';
    return false;
  end if;

  if coalesce(current_setting('app.functions_url', true), '') = ''
     or coalesce(current_setting('app.cron_secret', true), '') = '' then
    raise notice 'ensure_reminder_schedule: app.functions_url/app.cron_secret not set; send-reminders not scheduled';
    return false;
  end if;

  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'send-reminders';
  perform cron.schedule('send-reminders', '0 * * * *', $job$
    select net.http_post(
      url := current_setting('app.functions_url') || '/send-reminders',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000)
  $job$);
  return true;
end
$$;

revoke execute on function ensure_reminder_schedule() from public, anon;
grant execute on function ensure_reminder_schedule() to authenticated, service_role;

select ensure_reminder_schedule();
