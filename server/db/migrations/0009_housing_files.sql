-- Stored photo files (NS-05). One row per object in storage: its server-made key (NS-01), the
-- driver that holds it, and the record slot it fills (record, prev|current, photo|thumb). The
-- record's *_photo_url / *_thumb_url columns keep the public URL, so reads and the activity trigger
-- are unchanged. deleted_at marks a tombstone: the row's object is still to be removed from storage
-- after the transaction that replaced or deleted it (DB-TX-02); the row goes once removal succeeds.
-- Design: docs/plans/2026-10-05-1722-migrate-c5-photos-plan.md.

-- migrate:up
create table public.housing_files (
  id             uuid primary key default gen_random_uuid(),
  record_id      uuid references public.housing_beneficiaries(id) on delete set null,
  kind           text not null check (kind in ('prev', 'current')),
  variant        text not null check (variant in ('photo', 'thumb')),
  storage_key    text not null unique,
  storage_driver text not null check (storage_driver in ('nas', 's3')),
  content_type   text not null,
  size_bytes     bigint not null check (size_bytes >= 0),
  original_name  text check (char_length(original_name) <= 255),
  created_by     uuid references public.housing_admins(id) on delete set null,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- One live file per slot; tombstones and detached rows don't count.
create unique index housing_files_live_slot on public.housing_files (record_id, kind, variant)
  where deleted_at is null and record_id is not null;
-- The record FK's ON DELETE SET NULL and the per-record lookups.
create index housing_files_record_id_idx on public.housing_files (record_id);
-- The sweep reads only tombstones.
create index housing_files_tombstones_idx on public.housing_files (deleted_at) where deleted_at is not null;

revoke all on public.housing_files from public;
grant select, insert, update, delete on public.housing_files to housing_app;

-- migrate:down
-- Only before real uploads exist: dropping the table loses the key of every stored object, and the
-- records' photo URLs then 404. With real photos, fix forward instead (DB-MIG-05).
drop table if exists public.housing_files;
