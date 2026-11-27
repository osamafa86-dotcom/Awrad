-- Runs once, when the db volume is first initialised (mounted in /docker-entrypoint-initdb.d/init-scripts/).
-- The hourly reminder job (supabase/migrations/0013_reminders.sql, ensure_reminder_schedule): pg_cron schedules,
-- pg_net calls send-reminders over HTTP. Superuser only. The supabase/postgres image already has pg_cron in
-- shared_preload_libraries and cron.database_name = 'postgres', the database the migrations run in.
-- On an existing volume this does not run: the ops task runs the same two lines once as supabase_admin.
create extension if not exists pg_cron;
create extension if not exists pg_net;
