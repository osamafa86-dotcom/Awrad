-- 0014_reminders_weekly_time: التذكير الأسبوعي مستقلّ عن اليومي (المواصفة §12، القرار REM-3).
-- SQL عادي صالح على Supabase Cloud. يستبدل due_reminders من 0013 (ملف جديد لأن الترحيلات تُتتبَّع باسم الملف).
--
-- «تذكيران فقط، وكلاهما يُطفأ من الإعدادات»: اليومي يُطفأ بـ reminder_time فارغ، والأسبوعي بـ weekly_reminder وحده،
-- ويُرسَل في آخر يوم من أسبوع المجموعة عند ساعة coalesce(reminder_time, default_reminder_time). الدقائق مُهمَلة
-- عمدًا: المهمّة تعمل كل ساعة عند الدقيقة 0، فتذكير 21:30 يصل نحو 21:00.
-- «الآن» واحد للساعة واليوم: app.test_now (للاختبارات، كما في local_today) وإلا p_now.
create or replace function due_reminders(p_now timestamptz)
returns table (user_id uuid, kind text, sent_for date, tokens text[])
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_now     timestamptz := coalesce(nullif(current_setting('app.test_now', true), '')::timestamptz, p_now);
  v_default time := setting_text('default_reminder_time')::time;
begin
  if (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is distinct from 'service_role' then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;

  return query
  with candidates as (
    select p.id,
           p.reminder_time,
           p.weekly_reminder,
           extract(hour from v_now at time zone user_timezone(p.id)) as local_hour,
           local_today(p.id, v_now) as today,
           user_week_starts_on(p.id) as week_starts_on,
           array_agg(t.token order by t.token) as tokens
      from profiles p
      join push_tokens t on t.user_id = p.id
     where p.is_active
       and p.is_tracked
       and (p.reminder_time is not null or p.weekly_reminder)
     group by p.id
  ),
  due as (
    select c.id, 'daily'::text as kind, c.today as sent_for, c.tokens
      from candidates c
     where c.reminder_time is not null
       and extract(hour from c.reminder_time) = c.local_hour
    union all
    select c.id, 'weekly'::text, week_start(c.today, c.week_starts_on), c.tokens
      from candidates c
     where c.weekly_reminder
       and extract(hour from coalesce(c.reminder_time, v_default)) = c.local_hour
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

-- create or replace يحفظ الامتيازات؛ تُعاد هنا صراحةً كما في 0013.
revoke execute on function due_reminders(timestamptz) from public, anon;
grant execute on function due_reminders(timestamptz) to authenticated, service_role;
