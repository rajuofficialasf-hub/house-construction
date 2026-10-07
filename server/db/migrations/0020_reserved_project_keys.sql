-- Project keys a project route already uses: GET /projects/overview and PUT /projects/order would
-- never reach a project with that key. The zod projectKey and the admin wizard refuse the same
-- words; this CHECK is the backstop. Adding it fails if a row already holds one.

-- migrate:up
alter table public.housing_projects
  add constraint housing_projects_key_reserved check (key not in ('overview', 'order'));

-- migrate:down
alter table public.housing_projects drop constraint housing_projects_key_reserved;
