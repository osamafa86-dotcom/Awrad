-- ملف محاكاة لـ Supabase: للتطوير المحلي وCI فقط (PostgreSQL عادي بلا Docker).
-- يعيد إنشاء ما توفّره Supabase جاهزًا: مخطّط auth وجدول auth.users ودوال auth.uid/role/jwt
-- والأدوار anon/authenticated/service_role وصلاحياتها الافتراضية.
-- لا يُطبَّق أبدًا على مشروع Supabase حقيقي (سكربت db:reset يتجاهله لغير 127.0.0.1/localhost).
-- آمن لإعادة التشغيل (idempotent).

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;
alter role service_role bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- مخطّط auth خاص؛ المسموح فقط تنفيذ الدوال الثلاث.
grant usage on schema auth to anon, authenticated, service_role;
revoke all on all tables in schema auth from anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
