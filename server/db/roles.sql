-- Creates the two roles the housing API uses. Run once per Postgres cluster as a superuser:
--   psql -v owner_password=... -v app_password=... -f server/db/roles.sql
-- housing_owner owns the schema and runs migrations; housing_app is the runtime role and
-- can only use what the migrations grant it (DB-ROLE-01). Safe to run again.
\set ON_ERROR_STOP on

select format('create role housing_owner login password %L', :'owner_password')
where not exists (select from pg_roles where rolname = 'housing_owner')
\gexec

select format('create role housing_app login password %L', :'app_password')
where not exists (select from pg_roles where rolname = 'housing_app')
\gexec
