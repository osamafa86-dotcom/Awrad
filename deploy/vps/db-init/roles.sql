-- Runs once, when the db volume is first initialised (mounted in /docker-entrypoint-initdb.d/init-scripts/).
-- As the official supabase/docker volumes/db/roles.sql: the service roles log in with POSTGRES_PASSWORD.
-- Only roles that exist in this image are altered (\gexec), so a role missing from a newer image is no error.
\set pgpass `echo "$POSTGRES_PASSWORD"`

select format('alter role %I with password %L', rolname, :'pgpass')
from pg_roles
where rolname in ('authenticator', 'pgbouncer', 'supabase_auth_admin', 'supabase_functions_admin',
                  'supabase_storage_admin', 'supabase_replication_admin', 'supabase_read_only_user')
\gexec
