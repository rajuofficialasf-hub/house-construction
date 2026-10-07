-- Admin roles. A main_admin may
-- also delete (records, photos, projects, fields, covers, private values); the API enforces that,
-- since a database guard keyed to a session setting could be switched off by the app role
-- (docs/learnings/security/postgres-session-setting-guards-are-spoofable.md). Only the admin CLI,
-- as the owner, sets roles: housing_app keeps its 0007 grants (select, and update of the password
-- hash only).

-- migrate:up
alter table public.housing_admins
  add column role text not null default 'admin',
  add constraint housing_admins_role_check check (role in ('admin', 'main_admin'));

-- One main admin: whoever holds it is the single person who can delete.
create unique index housing_admins_one_main_admin on public.housing_admins ((role)) where role = 'main_admin';

-- migrate:down
drop index public.housing_admins_one_main_admin;
alter table public.housing_admins drop column role;
