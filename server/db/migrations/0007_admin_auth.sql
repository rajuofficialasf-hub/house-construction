-- Admins and their login sessions. Admins are created and changed only by the admin CLI
-- (server/src/cli/admin.ts), which connects as the owner. The API role reads admins, replaces a
-- password hash when it upgrades one at login, and manages sessions.
-- Design: docs/plans/2026-10-05-1246-migrate-c2-admin-login-plan.md

-- migrate:up
create table public.housing_admins (
  -- A uuid so it fits housing_activity_log.actor_id. Imported Supabase admins keep their auth.users id.
  id             uuid primary key default gen_random_uuid(),
  -- Stored lower-cased, so the unique index is also the login lookup.
  email          text not null unique check (email = lower(email)),
  name           text,
  -- argon2id, or a bcrypt hash imported from Supabase until that admin's next login.
  password_hash  text not null,
  disabled_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.housing_admin_sessions (
  -- SHA-256 of the cookie's token. The token itself is never stored, so a dump can't be replayed.
  token_hash    bytea primary key check (octet_length(token_hash) = 32),
  admin_id      uuid not null references public.housing_admins (id) on delete cascade,
  created_at    timestamptz not null,
  last_seen_at  timestamptz not null,
  expires_at    timestamptz not null
);
create index housing_admin_sessions_admin_id_idx on public.housing_admin_sessions (admin_id);

revoke all on public.housing_admins, public.housing_admin_sessions from public;
grant select, update (password_hash, updated_at) on public.housing_admins to housing_app;
grant select, insert, update, delete on public.housing_admin_sessions to housing_app;

-- migrate:down
drop table public.housing_admin_sessions;
drop table public.housing_admins;
