-- Runs once, when the db volume is first initialised, after the image's own init scripts (auth schema
-- included) and while the init user is still superuser. The migrations and the demo seed run as `postgres`,
-- which the image later demotes. They need what Supabase Cloud gives postgres:
--   USAGE on schema auth (auth.uid() in every policy), and TRIGGER (0001: on_auth_user_created),
--   REFERENCES (0001: profiles.id FK) and DELETE (0008: admin_delete_user) on auth.users;
--   membership in `authenticated` (the seed acts as the admin with `set local role authenticated`);
--   CREATE on the database (migrate.sh keeps its ledger in schema `ops`).
-- Idempotent, and no error if something is missing (the ops task's preflight then reports it).
do $$
begin
  execute format('grant create on database %I to postgres', current_database());
  if to_regnamespace('auth') is not null then
    grant usage on schema auth to postgres;
  end if;
  if to_regclass('auth.users') is not null then
    grant select, trigger, references, delete on auth.users to postgres;
  else
    raise warning 'auth-grants: auth.users does not exist yet';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant authenticated to postgres;
  end if;
end
$$;
