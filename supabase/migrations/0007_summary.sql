-- 0007_summary: حالة اليوم والملخّص والتقويم ونظرة المجموعة (المواصفة §10.3)
-- BR-01, BR-02, BR-03, BR-04, BR-13. SQL عادي صالح على Supabase Cloud. لا SQL ديناميكي.
--
-- العرضان security_invoker: تمرّ بهما سياسات RLS على logs/log_entries/log_entry_items كما هي
-- (الطالب صفوفه، المشرف مجموعاته، المدير الكل — BR-11).
-- الدوال security definer وتتحقّق من الصلاحية صراحة: الهدف = المستدعي، أو مدير، أو مشرف مجموعة
-- الهدف؛ غير ذلك (ومنه هدف غير موجود) FORBIDDEN بـ 42501. المدى غير الصالح INVALID_ITEM بـ 22023.
-- القيم المطابقة للاختبارات: packages/domain/fixtures (README.md هناك).

-- ───────────── وزن كل مدخل (BR-02) ─────────────
-- صف لكل مدخل في سجلّ (يومي أو أسبوعي) لعادة نشطة في تاريخ السجلّ (BR-07):
-- (مدخل عادة لم تعد نشطة في تاريخ سجلّه — بعد تقديم active_to لاحقًا — يُستبعد من الأوزان.)
--   tristate: done ⇒ 1/1، not_done ⇒ 1/0، not_required ⇒ 0/0 (مستثنى من المقام).
--   checklist: not_required ⇒ 0/0؛ وإلا 1 / (البنود المعلَّمة النشطة ÷ البنود النشطة في التاريخ).
--   checklist بلا بنود نشطة ⇒ 1/1، كما يشتقّ save_log حالتها done (لا بند غير معلَّم).
-- لبنة داخلية لـ v_day_status و get_student_summary.
create view v_entry_weights with (security_invoker = true) as
select l.id           as log_id,
       l.user_id,
       l.period,
       l.period_start,
       e.habit_id,
       (e.status <> 'not_required')::int::numeric as required,
       case
         when e.status = 'not_required' then 0
         when h.kind = 'tristate' then (e.status = 'done')::int
         else coalesce(ci.checked::numeric / nullif(ci.active, 0), 1)
       end::numeric as achieved
from logs l
join log_entries e on e.log_id = l.id
join habits h on h.id = e.habit_id
cross join lateral (
  select count(*) as active,
         count(x.habit_item_id) as checked
  from active_items_on(h.id, l.period_start) i
  left join log_entry_items x on x.entry_id = e.id and x.habit_item_id = i.id
) ci
where h.active_from <= l.period_start
  and (h.active_to is null or l.period_start <= h.active_to);

-- ───────────── حالة اليوم (BR-01) ─────────────
-- صف لكل سجلّ يومي فقط؛ missing = غياب الصفّ. completion_pct مقرَّبة لعدد صحيح، و null لـ neutral.
-- achieved إن كانت النسبة المقرَّبة ≥ streak_threshold_pct، وإلا failed. سجلّ بلا مدخلات = neutral.
-- المقارنة بالنسبة المقرَّبة لا الخام (قرار المراقب): 99.5% تُعدّ achieved عند عتبة 100.
create view v_day_status with (security_invoker = true) as
select s.user_id,
       s.log_date,
       case
         when s.required = 0 then 'neutral'
         when round(s.achieved / s.required * 100) >= setting_int('streak_threshold_pct')
           then 'achieved'
         else 'failed'
       end as state,
       case when s.required > 0 then round(s.achieved / s.required * 100) end as completion_pct
from (
  select l.user_id,
         l.period_start              as log_date,
         coalesce(sum(w.required), 0) as required,
         coalesce(sum(w.achieved), 0) as achieved
  from logs l
  left join v_entry_weights w on w.log_id = l.id
  where l.period = 'daily'
  group by l.user_id, l.period_start
) s;

-- ───────────── الصلاحية ─────────────
-- يرى المستدعي بيانات p_user: نفسه، أو مدير، أو مشرف مجموعة p_user الحالية. هدف بلا ملف ⇒ false.
create or replace function can_view_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from profiles p
     where p.id = p_user
       and (p.id = auth.uid() or is_admin() or is_supervisor_of(p.group_id))
  )
$$;

-- ───────────── ملخّص الطالب (BR-03, BR-04, BR-13) ─────────────
-- p_from/p_to (اختياريان) يُرشِّحان days_logged و completion_pct و per_habit و weekly والحضور؛
-- السلاسل دائمًا على [joined_at, local_today] بلا ترشيح.
create or replace function get_student_summary(
  p_user_id uuid default auth.uid(),
  p_from    date default null,
  p_to      date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user       uuid := coalesce(p_user_id, auth.uid());
  v_joined     date;
  v_today      date;
  v_run        int := 0;
  v_longest    int := 0;
  v_yesterday  int := 0;
  v_ok         boolean := false;
  v_logged     boolean := false;
  v_day        record;
  v_days       int;
  v_completion int;
  v_per_habit  jsonb;
  v_weekly     jsonb;
  v_attendance int;
begin
  -- 1) الصلاحية
  if not can_view_user(v_user) then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  select joined_at into v_joined from profiles where id = v_user;
  v_today := local_today(v_user);

  -- 2) السلاسل (BR-04): مقطع = أيام متتالية حالتها achieved أو neutral، طوله = عدد achieved فيه.
  --    الحالية (STREAK-1): إن سُجِّل اليوم بأي حالة فطول مقطع اليوم (0 إن كان failed)؛
  --    وإن لم يُسجَّل اليوم فطول مقطع أمس (0 إن كان أمس failed أو missing).
  for v_day in
    select g::date as d, coalesce(v.state, 'missing') as state
      from generate_series(v_joined, v_today, interval '1 day') g
      left join v_day_status v on v.user_id = v_user and v.log_date = g::date
     order by 1
  loop
    v_ok := v_day.state in ('achieved', 'neutral');
    v_logged := v_day.state <> 'missing';
    if v_ok then
      v_run := v_run + (v_day.state = 'achieved')::int;
    else
      v_run := 0;
    end if;
    v_longest := greatest(v_longest, v_run);
    if v_day.d = v_today - 1 then
      v_yesterday := v_run;
    end if;
  end loop;
  -- بعد الحلقة v_logged/v_run تخصّان اليوم (false/0 إن لم تبدأ الحلقة: joined_at بعد اليوم)

  -- 3) الأيام المسجَّلة (كل سجلّ يومي في المدى) ونسبة الإنجاز (BR-03): الأيام missing خارج المقام
  select count(*) into v_days
    from logs l
   where l.user_id = v_user and l.period = 'daily'
     and (p_from is null or l.period_start >= p_from)
     and (p_to is null or l.period_start <= p_to);
  select round(sum(w.achieved) / nullif(sum(w.required), 0) * 100)::int
    into v_completion
    from v_entry_weights w
   where w.user_id = v_user and w.period = 'daily'
     and (p_from is null or w.period_start >= p_from)
     and (p_to is null or w.period_start <= p_to);

  -- 4) لكل عادة يومية لها مدخل في المدى، بترتيب sort_order؛ الاسم الحالي للعادة (BR-07)
  select coalesce(jsonb_agg(jsonb_build_object(
           'habit_id', h.id, 'slug', h.slug, 'name', h.name,
           'completion_pct', x.pct) order by h.sort_order, h.slug), '[]'::jsonb)
    into v_per_habit
    from (
      select w.habit_id,
             round(sum(w.achieved) / nullif(sum(w.required), 0) * 100)::int as pct
        from v_entry_weights w
       where w.user_id = v_user and w.period = 'daily'
         and (p_from is null or w.period_start >= p_from)
         and (p_to is null or w.period_start <= p_to)
       group by w.habit_id
    ) x
    join habits h on h.id = x.habit_id;

  -- 5) الأسبوعي: null إن لم توجد سجلّات أسبوعية في المدى
  select case when count(*) = 0 then null else jsonb_build_object(
           'weeks_logged', count(*),
           'completion_pct', (
             select round(sum(w.achieved) / nullif(sum(w.required), 0) * 100)::int
               from v_entry_weights w
              where w.user_id = v_user and w.period = 'weekly'
                and (p_from is null or w.period_start >= p_from)
                and (p_to is null or w.period_start <= p_to))) end
    into v_weekly
    from logs l
   where l.user_id = v_user and l.period = 'weekly'
     and (p_from is null or l.period_start >= p_from)
     and (p_to is null or l.period_start <= p_to);

  -- 6) الحضور (BR-13): كل صفوف الطالب أينما كانت مجموعته، لمجالس تاريخها ≥ joined_at.
  --    excused خارج المقام إلا إن كان excused_counts_as_absent.
  select round(
           count(*) filter (where a.status = 'present') * 100.0
           / nullif(count(*) filter (
               where a.status in ('present', 'absent')
                  or (a.status = 'excused' and coalesce(setting_bool('excused_counts_as_absent'), false))), 0))::int
    into v_attendance
    from attendance a
    join sessions s on s.id = a.session_id
   where a.user_id = v_user
     and s.session_date >= v_joined
     and (p_from is null or s.session_date >= p_from)
     and (p_to is null or s.session_date <= p_to);

  return jsonb_build_object(
    'days_logged',    v_days,
    'completion_pct', v_completion,
    'attendance_pct', v_attendance,
    'longest_streak', v_longest,
    'current_streak', case when v_logged then v_run else v_yesterday end,
    'per_habit',      v_per_habit,
    'weekly',         v_weekly);
end
$$;

-- ───────────── التقويم (F-31) ─────────────
-- يوم لكل تاريخ من p_from إلى least(p_to, local_today)، و missing حيث لا سجلّ. المدى ≤ 62 يومًا.
create or replace function get_calendar(p_user_id uuid, p_from date, p_to date)
returns table (log_date date, state text, completion_pct numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not can_view_user(p_user_id) then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 62 then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  return query
    select g::date, coalesce(v.state, 'missing'), v.completion_pct
      from generate_series(p_from, least(p_to, local_today(p_user_id)), interval '1 day') g
      left join v_day_status v on v.user_id = p_user_id and v.log_date = g::date
     order by 1;
end
$$;

-- ───────────── نظرة المجموعة (F-60) ─────────────
-- صف لكل عضو is_tracked and is_active لكل يوم في [p_from, least(p_to, اليوم بمنطقة المجموعة)].
-- اليوم بمنطقة المجموعة لا الطالب (شبكة واحدة)؛ app.test_now للاختبارات كما في local_today.
create or replace function get_group_overview(p_group_id uuid, p_from date, p_to date)
returns table (user_id uuid, full_name text, log_date date, state text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_timezone text;
  v_now      timestamptz := coalesce(nullif(current_setting('app.test_now', true), '')::timestamptz, now());
begin
  if auth.uid() is null or not (is_admin() or is_supervisor_of(p_group_id)) then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  select g.timezone into v_timezone from groups g where g.id = p_group_id;
  if not found then
    raise exception using message = 'FORBIDDEN', errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 62 then
    raise exception using message = 'INVALID_ITEM', errcode = '22023';
  end if;

  return query
    select p.id, p.full_name, g::date, coalesce(v.state, 'missing')
      from profiles p
     cross join generate_series(p_from, least(p_to, (v_now at time zone v_timezone)::date),
                                interval '1 day') g
      left join v_day_status v on v.user_id = p.id and v.log_date = g::date
     where p.group_id = p_group_id and p.is_tracked and p.is_active
     order by p.full_name, p.id, g;
end
$$;
