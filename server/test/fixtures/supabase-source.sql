-- The Supabase tables the import reads, for the import tests' source database (housing_source_test).
-- Shapes copied from supabase/sql/01_schema.sql, 02_serial.sql, 03_rls.sql and 09_activity_log.sql,
-- plus the auth.users columns the import selects. No RLS, grants, functions or triggers: the import
-- only reads. Keep this in step with supabase/sql when a new file there changes these tables.

create schema auth;

create table auth.users (
  id                  uuid primary key,
  email               text,
  encrypted_password  text,
  raw_user_meta_data  jsonb,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  banned_until        timestamptz
);

create table public.housing_beneficiaries (
  id                      uuid primary key default gen_random_uuid(),
  project_type            text        not null,
  serial_no               integer     not null,
  year                    integer     not null,
  name                    text        not null,
  father_or_husband_name  text        not null default '',
  division                text        not null,
  district                text        not null,
  upazila                 text        not null,
  address                 text        not null default '',
  prev_photo_url          text,
  prev_thumb_url          text,
  current_photo_url       text,
  current_thumb_url       text,
  prev_photo_source       text,
  current_photo_source    text,
  photo_updated_at        timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint housing_beneficiaries_project_serial_key unique (project_type, serial_no)
);

create table public.housing_serial_counters (
  project_type text primary key,
  last_serial  integer not null default 0 check (last_serial >= 0)
);
insert into public.housing_serial_counters (project_type, last_serial) values ('semi_pucca', 0), ('tin', 0);

create table public.housing_serial_changes (
  id           bigserial primary key,
  record_id    uuid        not null,
  project_type text        not null,
  old_serial   integer     not null,
  new_serial   integer     not null,
  changed_by   uuid,
  changed_at   timestamptz not null default now()
);

create table public.housing_activity_log (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  actor_id      uuid,
  actor_email   text,
  action        text not null,
  project_type  text,
  record_id     uuid,
  serial_no     integer,
  record_name   text,
  details       jsonb not null default '{}'::jsonb
);

create table public.housing_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'admin',
  created_at timestamptz not null default now()
);
