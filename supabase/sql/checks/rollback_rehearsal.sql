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

-- ---------------------------------------------------------------- অংশ ১২ (M-ধাপ ৩-এ যোগ হবে)
-- ---------------------------------------------------------------- অংশ ১১ (M-ধাপ ৩-এ যোগ হবে)

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
