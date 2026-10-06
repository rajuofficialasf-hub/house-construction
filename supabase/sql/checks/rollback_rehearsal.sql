-- =====================================================================
-- checks/rollback_rehearsal.sql — রোলব্যাকের মহড়া (পর্ব ২ · চেকলিস্ট সারি ৩০) — ⚠ স্বয়ংক্রিয়ভাবে তৈরি, হাতে বদলাবেন না
-- তৈরি করে: npm run build-rehearsal (উৎস: supabase/sql/rollback/10_12_rollback.sql এর BODY)
--
-- ✅ কিছুই বদলায় না: রোলব্যাকের পুরো বডি একটি সাব-ট্রানজেকশনে চলে, স্কিমা ও ডাটার ফিঙ্গারপ্রিন্ট
--    M-ধাপ ১ এর বেসলাইনের সাথে মেলানো হয়, তারপর সব ফিরিয়ে দেওয়া হয়।
-- সব ✅ মানে: দরকার হলে রোলব্যাক ফাইলটি ডাটাবেসকে হুবহু SQL ১০-এর আগের অবস্থায় ফেরাতে পারবে।
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run।
-- =====================================================================

create or replace function pg_temp.asf_rollback_rehearsal()
returns table (n integer, chk text, ok text, info text)
language plpgsql
as $f$
declare
  sch    jsonb;
  dat    jsonb;
  err    text;
  before_sch jsonb;
begin
  if to_regprocedure('asf_meta.schema_fingerprint()') is null then
    n := 1; chk := '10_projects.sql চালানো হয়েছে?'; ok := '❌'; info := 'asf_meta নেই — আগে 10_projects.sql';
    return next;
    return;
  end if;
  before_sch := asf_meta.schema_fingerprint();
  begin
    execute $rehearsal_body$
-- ---------------------------------------------------------------- SQL ১৪ চালানো থাকলে আগে সেটি ফেরাতে হয় (পর্ব চ)
do $rb_14$
begin
  if to_regclass('public.housing_admin_projects') is not null then
    raise exception 'আগে rollback/14_rollback.sql চালান (SQL ১৪ চালানো আছে) — কিছুই বদলায়নি।';
  end if;
end
$rb_14$;

-- ---------------------------------------------------------------- নিরাপত্তা-গার্ড
do $rb_guard$
declare
  extra_rows bigint := 0;
  other_rows bigint := 0;
  priv_rows  bigint := 0;
  new_proj   bigint := 0;
begin
  if to_regclass('public.projects') is not null then
    select count(*) into other_rows from public.housing_beneficiaries where project_type not in ('semi_pucca', 'tin');
    select count(*) into new_proj from public.projects where key not in ('housing', 'semi_pucca', 'tin');
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'housing_beneficiaries' and column_name = 'extra') then
    execute $q$select count(*) from public.housing_beneficiaries where extra <> '{}'::jsonb or union_name <> ''$q$ into extra_rows;
  end if;
  if to_regclass('public.beneficiary_private') is not null then
    execute 'select count(*) from public.beneficiary_private' into priv_rows;
  end if;
  if other_rows > 0 or extra_rows > 0 or priv_rows > 0 or new_proj > 0 then
    raise exception 'রোলব্যাক নিরাপদ নয় — নতুন ডাটা আছে (অন্য প্রকল্পের রেকর্ড %, কাস্টম/ইউনিয়ন মানসহ রেকর্ড %, গোপন সারি %, নতুন প্রকল্প %)। কিছুই বদলায়নি; AI-এর সাথে ব্যাকআপ থেকে পুনরুদ্ধার করুন।',
      other_rows, extra_rows, priv_rows, new_proj;
  end if;
end
$rb_guard$;

-- ---------------------------------------------------------------- অংশ ১২ (লগ v2 → 09 + 09a এর সংস্করণ)
do $rb_12$
begin
  if to_regclass('public.beneficiary_private') is not null then
    execute 'drop trigger if exists beneficiary_private_activity_log on public.beneficiary_private';
  end if;
  if to_regclass('public.projects') is not null then
    execute 'drop trigger if exists projects_activity_log on public.projects';
  end if;
  if to_regclass('public.project_fields') is not null then
    execute 'drop trigger if exists project_fields_activity_log on public.project_fields';
  end if;
end
$rb_12$;
drop function if exists public.housing_log_private_change();
drop function if exists public.housing_log_config_change();
-- 09_activity_log.sql (09a ফিক্সসহ) এর হুবহু:
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
    photo_kinds := array_append(photo_kinds, 'prev'); -- || 'prev' দিলে Postgres 'prev' কে অ্যারে ভেবে ত্রুটি দেয় (09a ফিক্স)
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

-- ---------------------------------------------------------------- অংশ ১১ (নতুন RPC সরানো; পুরনো ৪টি ফাংশন হুবহু ফেরত)
drop function if exists public.projects_overview(boolean);
drop function if exists public.project_create(jsonb, jsonb);
drop function if exists public.projects_reorder(text[]);
drop function if exists public.project_fields_reorder(text, uuid[]);
drop function if exists public.project_field_usage(text, text);
drop function if exists public.project_field_rename_value(text, text, text, text);
-- 04_rpc_stats.sql এর হুবহু:
create or replace function public.housing_stats(p_project_type text default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select year, division, district, upazila
      from public.housing_beneficiaries
     where p_project_type is null or project_type = p_project_type
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_year', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select year::text as k, count(*) as c from base group by year) t
    ), '{}'::jsonb),
    'by_division', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select division as k, count(*) as c from base group by division) t
    ), '{}'::jsonb),
    'by_district', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select district as k, count(*) as c from base group by district) t
    ), '{}'::jsonb),
    'by_upazila', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select upazila as k, count(*) as c from base group by upazila) t
    ), '{}'::jsonb),
    'distinct', jsonb_build_object(
      'divisions', (select count(distinct division) from base),
      'districts', (select count(distinct district) from base),
      'upazilas',  (select count(*) from (select distinct district, upazila from base) u)
    ),
    -- মানচিত্রের জন্য: "জেলা|উপজেলা" → সংখ্যা (একই নামের উপজেলা ভিন্ন জেলায় আলাদা)
    'by_location', coalesce((
      select jsonb_object_agg(k, c order by k)
        from (select district || '|' || upazila as k, count(*) as c from base group by district, upazila) t
    ), '{}'::jsonb)
  );
$$;
create or replace function public.housing_years(p_project_type text default null)
returns table (year integer)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct b.year
    from public.housing_beneficiaries b
   where p_project_type is null or b.project_type = p_project_type
   order by b.year desc;
$$;
-- 02_serial.sql এর হুবহু:
create or replace function public.housing_next_serial(p_project_type text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select last_serial + 1 from public.housing_serial_counters where project_type = p_project_type;
$$;
-- 07_rpc_bulk.sql এর হুবহু:
create or replace function public.housing_bulk_update_by_serial(p_project_type text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r        jsonb;
  s        integer;
  n        integer;
  updated  integer := 0;
  missing  integer[] := '{}';
begin
  if p_project_type not in ('semi_pucca', 'tin') then
    raise exception 'অচেনা project_type: %', p_project_type using errcode = '23514';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'p_rows অবশ্যই ≤ ৫০০ সদস্যের array' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    s := (r->>'serial_no')::integer;
    if s is null then
      raise exception 'প্রতিটি সারিতে serial_no লাগবে' using errcode = '23502';
    end if;
    update public.housing_beneficiaries b
       set year                   = coalesce((r->>'year')::integer, b.year),
           name                   = coalesce(nullif(r->>'name', ''), b.name),
           father_or_husband_name = coalesce(r->>'father_or_husband_name', b.father_or_husband_name),
           division               = coalesce(nullif(r->>'division', ''), b.division),
           district               = coalesce(nullif(r->>'district', ''), b.district),
           upazila                = coalesce(nullif(r->>'upazila', ''), b.upazila),
           address                = coalesce(r->>'address', b.address),
           prev_photo_source      = coalesce(r->>'prev_photo_source', b.prev_photo_source),
           current_photo_source   = coalesce(r->>'current_photo_source', b.current_photo_source)
     where b.project_type = p_project_type and b.serial_no = s;
    get diagnostics n = row_count;
    if n = 0 then
      missing := missing || s;
    else
      updated := updated + 1;
    end if;
  end loop;

  return jsonb_build_object('updated', updated, 'missing', to_jsonb(missing));
end;
$$;
drop function if exists public.project_stats(text, boolean);    -- wrapper সরার পরে
drop function if exists public.project_leaf_keys(text);


-- ---------------------------------------------------------------- অংশ ১০b
drop trigger if exists housing_beneficiaries_validate on public.housing_beneficiaries;
do $rb_10b_trg$
begin
  if to_regclass('public.projects') is not null then
    execute 'drop trigger if exists projects_guard on public.projects';
    execute 'drop trigger if exists projects_after_write on public.projects';
  end if;
  if to_regclass('public.project_fields') is not null then
    execute 'drop trigger if exists project_fields_guard on public.project_fields';
  end if;
  if to_regclass('public.beneficiary_private') is not null then
    execute 'drop trigger if exists beneficiary_private_validate on public.beneficiary_private';
  end if;
end
$rb_10b_trg$;
drop function if exists public.housing_validate_record();

-- মোছার পুরনো পলিসি (03_rls.sql ও 05_storage.sql এর হুবহু) ফেরত
drop policy if exists "housing_beneficiaries_admin_delete" on public.housing_beneficiaries;
create policy "housing_beneficiaries_admin_delete"
  on public.housing_beneficiaries for delete
  to authenticated
  using (public.is_housing_admin());
drop policy if exists "housing_photos_admin_delete" on storage.objects;
create policy "housing_photos_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'housing-photos' and public.is_housing_admin());
-- ভূমিকা: সবাই আবার 'admin'
drop index if exists public.housing_admins_one_main_admin;
alter table public.housing_admins drop constraint if exists housing_admins_role_check;
update public.housing_admins set role = 'admin' where role <> 'admin';
alter table public.housing_admins add constraint housing_admins_role_check check (role in ('admin'));
drop function if exists public.beneficiary_private_validate();
drop function if exists public.projects_guard();
drop function if exists public.projects_after_write();
drop function if exists public.project_fields_guard();
do $rb_10b$
begin
  if to_regclass('public.project_fields') is not null then
    execute 'drop function if exists public.housing_field_value(public.project_fields, jsonb)';
  end if;
end
$rb_10b$;

-- ---------------------------------------------------------------- অংশ ১০
-- রেকর্ড পড়ার পুরনো পলিসি (03_rls.sql এর হুবহু) ফেরত
drop policy if exists "housing_beneficiaries_read" on public.housing_beneficiaries;
drop policy if exists "housing_beneficiaries_public_read" on public.housing_beneficiaries;
create policy "housing_beneficiaries_public_read"
  on public.housing_beneficiaries for select
  to anon, authenticated
  using (true);


drop index if exists public.housing_beneficiaries_extra_gin;
drop index if exists public.housing_beneficiaries_project_geo_idx;
drop index if exists public.housing_beneficiaries_project_union_idx;
drop index if exists public.housing_beneficiaries_project_created_idx;
alter table public.housing_beneficiaries drop constraint if exists housing_beneficiaries_extra_check;
alter table public.housing_beneficiaries drop column if exists extra;
alter table public.housing_beneficiaries drop column if exists union_name;

drop table if exists public.beneficiary_private;
drop table if exists public.project_fields;
alter table public.housing_beneficiaries drop constraint if exists housing_beneficiaries_project_type_fkey;
drop table if exists public.projects;
drop function if exists public.public_project_keys();   -- টেবিলগুলোর পলিসি সরার পরে
drop function if exists public.is_housing_main_admin();  -- সব পলিসি সরার পরে

-- পুরনো project_type CHECK (01_schema.sql এর হুবহু) ফেরত
do $rb_10$
begin
  if not exists (select 1 from pg_constraint where conname = 'housing_beneficiaries_project_type_check'
                   and conrelid = 'public.housing_beneficiaries'::regclass) then
    alter table public.housing_beneficiaries
      add constraint housing_beneficiaries_project_type_check
      check (project_type in ('semi_pucca', 'tin'));
  end if;
end
$rb_10$;

notify pgrst, 'reload schema';
$rehearsal_body$;
    sch := asf_meta.schema_fingerprint();
    dat := asf_meta.data_fingerprint();
    raise exception 'asf-rollback';
  exception when others then
    if sqlerrm <> 'asf-rollback' then
      err := sqlerrm;
    end if;
  end;

  if err is not null then
    n := 1; chk := 'রোলব্যাকের বডি চলেছে'; ok := '❌'; info := err;
    return next;
    return;
  end if;

  n := 1; chk := 'রোলব্যাকের বডি ত্রুটি ছাড়া চলেছে'; ok := '✅'; info := 'তারপর সব ফিরিয়ে দেওয়া হয়েছে';
  return next;

  n := 2; chk := 'স্কিমা-ফিঙ্গারপ্রিন্ট = বেসলাইন (SQL ১০-এর আগের কাঠামো)';
  ok := case when sch ->> 'fp' = 'b9468dd07eb1d3aeb006ccfce8eab643' and (sch ->> 'n')::int = 83 then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := (sch ->> 'fp') || ' (' || (sch ->> 'n') || ' আইটেম) · বেসলাইন b9468dd07eb1d3aeb006ccfce8eab643 (83)';
  return next;

  n := 3; chk := 'রেকর্ড (semi_pucca) = বেসলাইন';
  ok := case when (dat #>> '{records,semi_pucca,n}')::int = 10 and (dat #>> '{records,semi_pucca,max}')::int = 10
                  and dat #>> '{records,semi_pucca,fp}' = '00d0caccb068e709ba485e5b620d065b' then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := coalesce(dat #>> '{records,semi_pucca,n}', '0') || ' টি · ' || coalesce(dat #>> '{records,semi_pucca,fp}', '—');
  return next;

  n := 4; chk := 'রেকর্ড (tin) ও কাউন্টার = বেসলাইন';
  ok := case when coalesce((dat #>> '{records,tin,n}')::int, 0) = 0
                  and (dat #>> '{counters,semi_pucca}')::int = 10 and (dat #>> '{counters,tin}')::int = 0
             then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := 'tin ' || coalesce(dat #>> '{records,tin,n}', '0') || ' · কাউন্টার ' || (dat ->> 'counters');
  return next;

  n := 5; chk := 'housing_stats(null) ও সিরিয়াল-বদলের লগ = বেসলাইন';
  ok := case when dat ->> 'stats_md5' = 'a93bfa85500c86b0e79db9cd201c2776' and (dat ->> 'serial_changes')::int = 0
             then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := (dat ->> 'stats_md5') || ' · সিরিয়াল-বদল ' || (dat ->> 'serial_changes');
  return next;

  n := 6; chk := 'মহড়ার পরে বর্তমান কাঠামো অক্ষত (কিছুই বদলায়নি)';
  ok := case when asf_meta.schema_fingerprint() = before_sch then '✅' else '❌' end;
  info := before_sch ->> 'fp';
  return next;
end;
$f$;

select n as "#", chk as "চেক", ok as "ফল", info as "বিস্তারিত" from pg_temp.asf_rollback_rehearsal();
