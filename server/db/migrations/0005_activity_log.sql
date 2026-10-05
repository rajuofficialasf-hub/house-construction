-- Ported from supabase/sql/09_activity_log.sql. Admin checks move to the server; no row-level security; the actor comes from housing_current_actor().

-- migrate:up
-- =====================================================================
-- 09_activity_log.sql — একটিভিটি লগ (কে, কখন, কী করেছে)
-- দুই উৎস:
--   ১) ট্রিগার: housing_beneficiaries এ INSERT/UPDATE/DELETE হলেই লগ — যে পথেই হোক (এডমিন UI, ইম্পোর্ট, ছবি স্ক্রিপ্ট)।
--      বদলানো ফিল্ডের আগে→পরে মান details এ; ছবি বদল, সিরিয়াল বদল আলাদা action।
--   ২) RPC housing_log_event(): ক্লায়েন্ট-ইভেন্ট (login, logout, import_run, photo_bulk_run …)।
-- actor: সার্ভারের দেওয়া app.actor_id / app.actor_email (housing_current_actor())।
-- housing_app লগ পড়তে পারে, বদলাতে/মুছতে পারে না (ট্রিগার/ফাংশন security definer)।
-- নিজস্ব সার্ভারে সমতুল্য: GET/POST /api/housing/activity (API_CONTRACT.md)।
-- =====================================================================

create table if not exists public.housing_activity_log (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  actor_id      uuid,
  actor_email   text,
  action        text not null,               -- create | update | delete | photo_update | serial_change | login | logout | import_run | photo_bulk_run | …
  project_type  text,
  record_id     uuid,
  serial_no     integer,
  record_name   text,
  details       jsonb not null default '{}'::jsonb
);
create index if not exists housing_activity_log_at_idx on public.housing_activity_log (at desc);
create index if not exists housing_activity_log_record_idx on public.housing_activity_log (record_id);
create index if not exists housing_activity_log_action_idx on public.housing_activity_log (action);

-- housing_app শুধু পড়তে পারে (0006); শুধু নিচের security definer ফাংশন লেখে

-- housing_current_actor() 0002_serial.sql এ তৈরি হয়।

-- ---------- রেকর্ড ট্রিগার ----------
create or replace function public.housing_log_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  a_email text;
  changes jsonb := '{}'::jsonb;
  act text;
  photo_kinds text[] := '{}';
  col text;
  o jsonb;
  n jsonb;
begin
  select actor_id, actor_email into a_id, a_email from public.housing_current_actor();

  if tg_op = 'INSERT' then
    insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
    values (a_id, a_email, 'create', new.project_type, new.id, new.serial_no, new.name,
            jsonb_build_object('year', new.year, 'division', new.division, 'district', new.district, 'upazila', new.upazila,
                               'has_prev_photo', new.prev_photo_url is not null, 'has_current_photo', new.current_photo_url is not null));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
    values (a_id, a_email, 'delete', old.project_type, old.id, old.serial_no, old.name,
            jsonb_build_object('year', old.year, 'division', old.division, 'district', old.district, 'upazila', old.upazila, 'address', old.address,
                               'father_or_husband_name', old.father_or_husband_name,
                               'had_prev_photo', old.prev_photo_url is not null, 'had_current_photo', old.current_photo_url is not null));
    return old;
  end if;

  -- UPDATE: বদলানো ফিল্ডের আগে→পরে
  o := to_jsonb(old);
  n := to_jsonb(new);
  foreach col in array array['serial_no','year','name','father_or_husband_name','division','district','upazila','address','prev_photo_source','current_photo_source'] loop
    if o -> col is distinct from n -> col then
      changes := changes || jsonb_build_object(col, jsonb_build_object('old', o -> col, 'new', n -> col));
    end if;
  end loop;
  if old.prev_photo_url is distinct from new.prev_photo_url then
    photo_kinds := array_append(photo_kinds, 'prev');
    changes := changes || jsonb_build_object('prev_photo', jsonb_build_object('old', old.prev_photo_url is not null, 'new', new.prev_photo_url is not null));
  end if;
  if old.current_photo_url is distinct from new.current_photo_url then
    photo_kinds := array_append(photo_kinds, 'current');
    changes := changes || jsonb_build_object('current_photo', jsonb_build_object('old', old.current_photo_url is not null, 'new', new.current_photo_url is not null));
  end if;

  if changes = '{}'::jsonb then
    return new; -- শুধু updated_at/photo_updated_at ইত্যাদি — লগ নয়
  end if;

  if old.serial_no is distinct from new.serial_no then
    act := 'serial_change';
  elsif array_length(photo_kinds, 1) > 0 and (changes - 'prev_photo' - 'current_photo') = '{}'::jsonb then
    act := 'photo_update';
  else
    act := 'update';
  end if;

  insert into public.housing_activity_log (actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
  values (a_id, a_email, act, new.project_type, new.id, new.serial_no, new.name,
          jsonb_build_object('changes', changes, 'photo_kinds', to_jsonb(photo_kinds)));
  return new;
end;
$$;

drop trigger if exists housing_beneficiaries_activity_log on public.housing_beneficiaries;
create trigger housing_beneficiaries_activity_log
  after insert or update or delete on public.housing_beneficiaries
  for each row execute function public.housing_log_record_change();

-- ---------- ক্লায়েন্ট-ইভেন্ট ----------
-- সার্ভার ডাকে (login সফল হওয়ার পর, logout এর আগে, import_run/photo_bulk_run এর সারসংক্ষেপ)।
create or replace function public.housing_log_event(p_action text, p_details jsonb default '{}'::jsonb, p_project_type text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  a_email text;
  new_id bigint;
begin
  if p_action is null or length(p_action) > 40 or p_action !~ '^[a-z_]+$' then
    raise exception 'অবৈধ action' using errcode = '22023';
  end if;
  select actor_id, actor_email into a_id, a_email from public.housing_current_actor();
  insert into public.housing_activity_log (actor_id, actor_email, action, project_type, details)
  values (a_id, a_email, p_action, p_project_type, coalesce(p_details, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

-- সিরিয়াল-বদলের RPC (02_serial.sql) security definer বলে ট্রিগারও তার actor পায় — আলাদা কিছু লাগে না।

-- migrate:down
drop function if exists public.housing_log_event(text, jsonb, text);
drop trigger if exists housing_beneficiaries_activity_log on public.housing_beneficiaries;
drop function if exists public.housing_log_record_change();
drop table if exists public.housing_activity_log;
