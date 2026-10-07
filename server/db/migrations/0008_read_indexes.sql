-- Indexes for the records list's sorts (docs/api/PROJECTS_API_CONTRACT.md §৪.৪.১). serial_no is
-- the default sort, also across a group's projects, where the (project_type, serial_no) unique
-- index can't serve it; created_at is a sort option. The other filter and sort columns are indexed
-- in 0001. Plain create index: the table holds a few thousand rows, so the lock is brief.

-- migrate:up
create index housing_beneficiaries_serial_no_idx on public.housing_beneficiaries (serial_no);
create index housing_beneficiaries_created_at_idx on public.housing_beneficiaries (created_at);

-- migrate:down
drop index if exists public.housing_beneficiaries_created_at_idx;
drop index if exists public.housing_beneficiaries_serial_no_idx;
