-- Ported from supabase/sql/02_serial.sql. Admin checks move to the server; the actor comes from housing_current_actor() (defined here).

-- migrate:up
-- =====================================================================
-- 02_serial.sql — স্থায়ী সিরিয়াল বরাদ্দ
-- নিয়ম: প্রতি project_type এ আলাদা কাউন্টার, ১ থেকে শুরু, একবার দিলে বদলায় না,
--       ডিলেট হলেও পুনঃব্যবহার হয় না (কাউন্টার কখনো কমে না)।
-- ইনসার্টে serial_no না দিলে ট্রিগার পরের নম্বর দেয়;
-- দিলে (শীট থেকে ইম্পোর্ট) সেটিই রাখে এবং কাউন্টারকে অন্তত ঐ নম্বরে তোলে।
-- কাউন্টার সারির UPDATE লক থাকায় একই সময়ে দুটি ইনসার্ট হলেও ডুপ্লিকেট হয় না।
-- =====================================================================

-- ---------- বর্তমান actor ----------
-- The API sets app.actor_id / app.actor_email for each write transaction (withActor() in
-- server/src/db.ts). Without them (seeds, manual psql) the login role's name is recorded.
-- The database can't verify these values: the log is only as trustworthy as the API process,
-- which must set them only through withActor() from the authenticated admin.
-- session_user, not current_user: inside security definer functions current_user is the owner.
create or replace function public.housing_current_actor(out actor_id uuid, out actor_email text)
language plpgsql
stable
as $$
begin
  actor_id := nullif(current_setting('app.actor_id', true), '')::uuid;
  actor_email := nullif(current_setting('app.actor_email', true), '');
  if actor_id is null and actor_email is null then
    actor_email := session_user;
  end if;
end;
$$;

create table if not exists public.housing_serial_counters (
  project_type text primary key,
  last_serial  integer not null default 0 check (last_serial >= 0)
);

insert into public.housing_serial_counters (project_type, last_serial)
values ('semi_pucca', 0), ('tin', 0)
on conflict (project_type) do nothing;

-- ট্রিগার ফাংশন। security definer: housing_app কাউন্টার সরাসরি বদলাতে পারে না (0006),
-- তবু তার ইনসার্ট থেকে কাউন্টার আপডেট হয়।
create or replace function public.housing_assign_serial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_serial integer;
begin
  if new.serial_no is null then
    update public.housing_serial_counters
       set last_serial = last_serial + 1
     where project_type = new.project_type
     returning last_serial into next_serial;

    if next_serial is null then
      raise exception 'অচেনা project_type: %', new.project_type using errcode = '23514';
    end if;
    new.serial_no := next_serial;
  else
    update public.housing_serial_counters
       set last_serial = greatest(last_serial, new.serial_no)
     where project_type = new.project_type;
  end if;
  return new;
end;
$$;

drop trigger if exists housing_beneficiaries_assign_serial on public.housing_beneficiaries;
create trigger housing_beneficiaries_assign_serial
  before insert on public.housing_beneficiaries
  for each row execute function public.housing_assign_serial();

-- serial_no ও project_type অপরিবর্তনীয় — শুধু housing_change_serial() (নিচে) সেশন-সেটিং দিয়ে অনুমতি দেয়।
-- Any role can set the session setting, so it is honored only inside a security definer function
-- (current_user differs from session_user there); a direct UPDATE by housing_app is always refused.
create or replace function public.housing_protect_serial()
returns trigger
language plpgsql
as $$
begin
  if new.project_type is distinct from old.project_type then
    raise exception 'project_type পরিবর্তন করা যায় না' using errcode = '23514';
  end if;
  if new.serial_no is distinct from old.serial_no
     and (coalesce(current_setting('housing.allow_serial_change', true), '') <> 'on' or current_user = session_user) then
    raise exception 'serial_no সরাসরি পরিবর্তন করা যায় না; housing_change_serial() ব্যবহার করুন' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists housing_beneficiaries_protect_serial on public.housing_beneficiaries;
create trigger housing_beneficiaries_protect_serial
  before update on public.housing_beneficiaries
  for each row execute function public.housing_protect_serial();

-- serial_no কলাম NOT NULL হলেও BEFORE INSERT ট্রিগার আগে চলে, তাই null দিয়ে ইনসার্ট করা যায়।
-- ফ্রন্টএন্ড থেকে serial_no পাঠানো না হলে (assign_serial মোড) কলামটি ইনসার্টে থাকে না → null → ট্রিগার।

-- ---------- পরবর্তী সিরিয়াল (এডমিন ফর্মে "স্বয়ংক্রিয় (পরবর্তী: N)" দেখাতে) ----------
-- শুধু পূর্বাভাস; প্রকৃত বরাদ্দ ইনসার্টের ট্রিগারে (একই সময়ে দুজন যোগ করলে একজন N+1 পাবে)।
create or replace function public.housing_next_serial(p_project_type text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select last_serial + 1 from public.housing_serial_counters where project_type = p_project_type;
$$;

-- ---------- সিরিয়াল বদলের অডিট লগ ----------
-- সিরিয়াল স্থায়ী পরিচয়; কে কখন কোনটি বদলেছে তা চিরস্থায়ীভাবে রাখা হয় (শুধু RPC লেখে; এডমিন পড়তে পারে)।
create table if not exists public.housing_serial_changes (
  id           bigserial primary key,
  record_id    uuid        not null,
  project_type text        not null,
  old_serial   integer     not null,
  new_serial   integer     not null,
  changed_by   uuid,                       -- app.actor_id (স্ক্রিপ্টে null)
  changed_at   timestamptz not null default now()
);
create index if not exists housing_serial_changes_record_idx on public.housing_serial_changes (record_id);
-- housing_app শুধু পড়তে পারে (0006); নিচের security definer ফাংশন লেখে।

-- ---------- সিরিয়াল বদল (বিশেষ, সতর্কতাসহ) ----------
-- এডমিন যাচাই সার্ভার করে (NE-SEC-03); নতুন সিরিয়াল অনন্য হতে হবে; কাউন্টার ≥ নতুন সিরিয়াল হয়; পুরনো সিরিয়াল পুনরায় ব্যবহার হয় না; অডিট লগে সারি।
create or replace function public.housing_change_serial(p_id uuid, p_new_serial integer)
returns public.housing_beneficiaries
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.housing_beneficiaries;
  old_serial integer;
begin
  if p_new_serial is null or p_new_serial < 1 then
    raise exception 'সিরিয়াল ১ বা তার বেশি হতে হবে' using errcode = '23514';
  end if;
  select * into rec from public.housing_beneficiaries where id = p_id for update;
  if not found then
    raise exception 'রেকর্ড পাওয়া যায়নি' using errcode = 'P0002';
  end if;
  if rec.serial_no = p_new_serial then
    return rec;
  end if;
  if exists (select 1 from public.housing_beneficiaries where project_type = rec.project_type and serial_no = p_new_serial) then
    raise exception 'সিরিয়াল % আগে থেকেই আছে', p_new_serial using errcode = '23505';
  end if;
  old_serial := rec.serial_no;
  perform set_config('housing.allow_serial_change', 'on', true);
  update public.housing_beneficiaries set serial_no = p_new_serial where id = p_id returning * into rec;
  perform set_config('housing.allow_serial_change', 'off', true);
  update public.housing_serial_counters
     set last_serial = greatest(last_serial, p_new_serial)
   where project_type = rec.project_type;
  insert into public.housing_serial_changes (record_id, project_type, old_serial, new_serial, changed_by)
  values (p_id, rec.project_type, old_serial, p_new_serial, (select actor_id from public.housing_current_actor()));
  return rec;
end;
$$;

-- migrate:down
drop function if exists public.housing_change_serial(uuid, integer);
drop table if exists public.housing_serial_changes;
drop function if exists public.housing_next_serial(text);
drop trigger if exists housing_beneficiaries_protect_serial on public.housing_beneficiaries;
drop function if exists public.housing_protect_serial();
drop trigger if exists housing_beneficiaries_assign_serial on public.housing_beneficiaries;
drop function if exists public.housing_assign_serial();
drop table if exists public.housing_serial_counters;
drop function if exists public.housing_current_actor();
