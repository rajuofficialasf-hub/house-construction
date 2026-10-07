-- Indexes for the two filters that otherwise scan their whole table at production volume:
-- the list search (name, father_or_husband_name and address `ilike '%q%'`, server/src/records/filters.ts)
-- and the activity log's project and actor filters (server/src/housing/activity.ts). A btree can't
-- serve a leading-wildcard ilike, so those columns get trigram GIN indexes; the planner combines the
-- three search indexes with a BitmapOr. pg_trgm is a trusted extension (PostgreSQL 13+), so the
-- database owner can create it; it needs the contrib package on the box. A trusted extension is
-- installed as the bootstrap superuser, so its functions keep EXECUTE for PUBLIC and the owner can't
-- revoke it; they go in their own schema to keep public free of PUBLIC-executable functions
-- (docs/learnings/database/postgres-default-privileges-public-execute.md). Neither ilike nor the index
-- needs the runtime role to reach that schema.
-- Plain create index: no database held data when this was written, so the lock was brief.

-- migrate:up
create schema extensions;
revoke all on schema extensions from public;
create extension pg_trgm with schema extensions;

create index housing_beneficiaries_name_trgm_idx
  on public.housing_beneficiaries using gin (name extensions.gin_trgm_ops);
create index housing_beneficiaries_father_trgm_idx
  on public.housing_beneficiaries using gin (father_or_husband_name extensions.gin_trgm_ops);
create index housing_beneficiaries_address_trgm_idx
  on public.housing_beneficiaries using gin (address extensions.gin_trgm_ops);

create index housing_activity_log_project_at_idx
  on public.housing_activity_log (project_type, at desc);
create index housing_activity_log_actor_email_trgm_idx
  on public.housing_activity_log using gin (actor_email extensions.gin_trgm_ops);

-- migrate:down
drop index if exists public.housing_activity_log_actor_email_trgm_idx;
drop index if exists public.housing_activity_log_project_at_idx;
drop index if exists public.housing_beneficiaries_address_trgm_idx;
drop index if exists public.housing_beneficiaries_father_trgm_idx;
drop index if exists public.housing_beneficiaries_name_trgm_idx;
drop extension if exists pg_trgm;
drop schema if exists extensions;
