-- =====================================================================
-- checks/14_rollback_rehearsal.sql — SQL ১৪ এর রোলব্যাক-মহড়া (পর্ব চ · চেকলিস্ট সারি ৩৫) — ⚠ স্বয়ংক্রিয়ভাবে তৈরি, হাতে বদলাবেন না
-- তৈরি করে: npm run build-rehearsal (উৎস: supabase/sql/rollback/14_rollback.sql এর BODY)
--
-- ✅ কিছুই বদলায় না: রোলব্যাকের বডি একটি সাব-ট্রানজেকশনে চলে, স্কিমার গভীর ছাপ (পলিসির শর্ত, ফাংশনের পুরো সংজ্ঞা ও
--    অনুমতি, ট্রিগার, constraint, কলাম) ১৪ চালানোর ঠিক আগের ছাপের (asf_meta.marks 'before_14') সাথে মেলানো হয়,
--    তারপর সব ফিরিয়ে দেওয়া হয়।
-- সব ✅ মানে: দরকার হলে rollback/14_rollback.sql ডাটাবেসকে হুবহু ১৪-এর আগের অবস্থায় ফেরাতে পারবে।
-- চালানো: SQL Editor → New query → পুরো ফাইল পেস্ট → Run।
-- =====================================================================

create or replace function pg_temp.asf_14_rollback_rehearsal()
returns table (n integer, chk text, ok text, info text)
language plpgsql
as $f$
declare
  deep   jsonb;
  dat    jsonb;
  roles  text;
  err    text;
  want   jsonb;
  now_deep jsonb;
  dat0   jsonb;
begin
  if to_regprocedure('asf_meta.deep_fingerprint()') is null or to_regclass('asf_meta.marks') is null then
    n := 1; chk := '14_project_users.sql চালানো হয়েছে?'; ok := '❌'; info := 'asf_meta.deep_fingerprint/marks নেই — আগে 14_project_users.sql';
    return next;
    return;
  end if;
  select v into want from asf_meta.marks where k = 'before_14';
  now_deep := asf_meta.deep_fingerprint();
  dat0 := asf_meta.data_fingerprint();
  begin
    execute $rehearsal_body$
-- ---------- পলিসি আগের রূপে (নতুন ফাংশন মোছার আগে) ----------
drop policy if exists "housing_beneficiaries_read" on public.housing_beneficiaries;
create policy "housing_beneficiaries_read" on public.housing_beneficiaries for select to anon, authenticated
  using (project_type = any ((select public.public_project_keys())::text[]) or (select public.is_housing_admin()));
drop policy if exists "housing_beneficiaries_admin_insert" on public.housing_beneficiaries;
create policy "housing_beneficiaries_admin_insert"
  on public.housing_beneficiaries for insert
  to authenticated
  with check (public.is_housing_admin());
drop policy if exists "housing_beneficiaries_admin_update" on public.housing_beneficiaries;
create policy "housing_beneficiaries_admin_update"
  on public.housing_beneficiaries for update
  to authenticated
  using (public.is_housing_admin())
  with check (public.is_housing_admin());

drop policy if exists "beneficiary_private_admin_read" on public.beneficiary_private;
create policy "beneficiary_private_admin_read" on public.beneficiary_private for select to authenticated
  using ((select public.is_housing_admin()));
drop policy if exists "beneficiary_private_admin_insert" on public.beneficiary_private;
create policy "beneficiary_private_admin_insert" on public.beneficiary_private for insert to authenticated
  with check ((select public.is_housing_admin()));
drop policy if exists "beneficiary_private_admin_update" on public.beneficiary_private;
create policy "beneficiary_private_admin_update" on public.beneficiary_private for update to authenticated
  using ((select public.is_housing_admin())) with check ((select public.is_housing_admin()));

drop policy if exists "projects_read" on public.projects;
create policy "projects_read" on public.projects for select to anon, authenticated
  using (key = any ((select public.public_project_keys())::text[]) or (select public.is_housing_admin()));
drop policy if exists "projects_admin_insert" on public.projects;
create policy "projects_admin_insert" on public.projects for insert to authenticated
  with check ((select public.is_housing_admin()));
drop policy if exists "projects_admin_update" on public.projects;
create policy "projects_admin_update" on public.projects for update to authenticated
  using ((select public.is_housing_admin())) with check ((select public.is_housing_admin()));

drop policy if exists "project_fields_read" on public.project_fields;
create policy "project_fields_read" on public.project_fields for select to anon, authenticated
  using ((visibility = 'public' and project_key = any ((select public.public_project_keys())::text[])) or (select public.is_housing_admin()));
drop policy if exists "project_fields_admin_insert" on public.project_fields;
create policy "project_fields_admin_insert" on public.project_fields for insert to authenticated
  with check ((select public.is_housing_admin()));
drop policy if exists "project_fields_admin_update" on public.project_fields;
create policy "project_fields_admin_update" on public.project_fields for update to authenticated
  using ((select public.is_housing_admin())) with check ((select public.is_housing_admin()));

drop policy if exists "housing_activity_log_admin_read" on public.housing_activity_log;
create policy "housing_activity_log_admin_read"
  on public.housing_activity_log for select
  to authenticated
  using (public.is_housing_admin());
drop policy if exists "housing_serial_changes_admin_read" on public.housing_serial_changes;
create policy "housing_serial_changes_admin_read"
  on public.housing_serial_changes for select
  to authenticated
  using (public.is_housing_admin());

drop policy if exists "housing_photos_admin_insert" on storage.objects;
create policy "housing_photos_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'housing-photos' and public.is_housing_admin());
drop policy if exists "housing_photos_admin_update" on storage.objects;
create policy "housing_photos_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'housing-photos' and public.is_housing_admin())
  with check (bucket_id = 'housing-photos' and public.is_housing_admin());

-- ---------- গার্ড-ট্রিগার ও নতুন ফাংশন ----------
drop trigger if exists housing_beneficiaries_zz_editor_guard on public.housing_beneficiaries;
drop trigger if exists beneficiary_private_zz_editor_guard on public.beneficiary_private;
drop function if exists public.housing_editor_guard();
drop function if exists public.beneficiary_private_editor_guard();
drop function if exists public.housing_admin_user_save(text, boolean, text[], boolean);
drop function if exists public.housing_admin_users();
drop function if exists public.housing_can_edit_project(text);

drop function if exists public.housing_current_admin();
create function public.housing_current_admin()
returns table (role text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select a.role, a.email
    from public.housing_admins a
   where a.user_id = auth.uid();
$$;
grant execute on function public.housing_current_admin() to authenticated;

drop function if exists public.housing_my_project_keys();

create or replace function public.is_housing_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.housing_admins where user_id = auth.uid()
  );
$$;
grant execute on function public.is_housing_admin() to anon, authenticated;

create or replace function public.is_housing_main_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.housing_admins where user_id = auth.uid() and role = 'main_admin');
$$;
grant execute on function public.is_housing_main_admin() to anon, authenticated;

-- ---------- ভূমিকা ও কলাম আগের রূপে ----------
drop table if exists public.housing_admin_projects;
-- নিষ্ক্রিয় ইউজার (আবার চালালে কলামটি আর নেই — তখন কিছু করার নেই)
do $inactive$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'housing_admins' and column_name = 'is_active') then
    execute 'delete from public.housing_admins where role <> ''main_admin'' and not is_active';
  end if;
end
$inactive$;
alter table public.housing_admins drop constraint if exists housing_admins_role_check;
update public.housing_admins set role = 'admin' where role = 'editor';
alter table public.housing_admins add constraint housing_admins_role_check check (role in ('admin', 'main_admin'));
alter table public.housing_admins alter column role set default 'admin';
alter table public.housing_admins drop column if exists all_projects;
alter table public.housing_admins drop column if exists is_active;
$rehearsal_body$;
    deep := asf_meta.deep_fingerprint();
    dat := asf_meta.data_fingerprint();
    select string_agg(distinct role, ',' order by role) into roles from public.housing_admins;
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

  n := 2; chk := 'স্কিমার গভীর ছাপ = ১৪-এর আগের (পলিসি, ফাংশন, ট্রিগার, constraint, কলাম হুবহু)';
  ok := case when want is null then '❌ ১৪-এর আগের ছাপ নেই' when deep = want then '✅ মিলেছে' else '❌ মেলেনি' end;
  info := coalesce(deep ->> 'fp', '—') || ' (' || coalesce(deep ->> 'n', '?') || ') · আগে ' || coalesce(want ->> 'fp', '—') || ' (' || coalesce(want ->> 'n', '?') || ')';
  return next;

  n := 3; chk := 'ভূমিকা আগের নিয়মে (admin / main_admin)';
  ok := case when roles is not null and roles ~ '^(admin,)?main_admin$' then '✅' else '❌' end;
  info := coalesce(roles, '—');
  return next;

  n := 4; chk := 'লাইভ ডাটা (রেকর্ড, কাউন্টার, stats) অক্ষত';
  ok := case when dat = dat0 then '✅' else '❌' end;
  info := (dat0 #>> '{records}');
  return next;

  n := 5; chk := 'মহড়ার পরে বর্তমান কাঠামো অক্ষত (কিছুই বদলায়নি)';
  ok := case when asf_meta.deep_fingerprint() = now_deep then '✅' else '❌' end;
  info := now_deep ->> 'fp';
  return next;
end;
$f$;

select n as "#", chk as "চেক", ok as "ফল", info as "বিস্তারিত" from pg_temp.asf_14_rollback_rehearsal();
