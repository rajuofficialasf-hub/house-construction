-- =====================================================================
-- rollback/14_rollback.sql — 14_project_users.sql ফেরানো (পর্ব চ, M-ধাপ ১৮)
-- শুধু দরকার হলে চালাবেন। এক ট্রানজেকশনে; ভুল হলে কিছুই বদলায় না; আবার চালালে ক্ষতি নেই।
--
-- ফল: ১৪-এর আগের অবস্থা — ভূমিকা 'admin'/'main_admin', আগের পলিসি ও ফাংশন হুবহু (checks/14_rollback_rehearsal.sql
--     এটি asf_meta.marks এর "before_14" ছাপের সাথে মিলিয়ে প্রমাণ করে)।
-- ⚠ জেনে রাখুন: ১৪-এর পরে যোগ করা "প্রকল্পের ইউজার" রা ফেরার পরে আবার **সব প্রকল্পের** এডমিন হবেন (আগের নিয়মে প্রকল্পভিত্তিক
--   সীমা নেই); নিষ্ক্রিয় (is_active = false) ইউজারদের সারি মুছে যায়, যাতে তাঁরা অধিকার ফিরে না পান।
-- রেকর্ড, ছবি, প্রকল্প বা লগে হাত দেয় না — লাইভ ডাটার ফিঙ্গারপ্রিন্ট আগে-পরে মেলানো হয়।
-- এই ফাইলের BODY বদলালে মহড়া-ফাইল নতুন করে তৈরি করতে হয়: npm run build-rehearsal
-- চালানো: Supabase → SQL Editor → New query → পুরো ফাইল পেস্ট → Run।
-- =====================================================================

begin;

create temp table _asf_fp_before on commit drop as select asf_meta.data_fingerprint() as fp;

-- @@BODY-START
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
-- @@BODY-END

do $fp$
begin
  if asf_meta.data_fingerprint() is distinct from (select fp from _asf_fp_before) then
    raise exception 'ফিঙ্গারপ্রিন্ট মেলেনি — কিছুই বদলায়নি।';
  end if;
end
$fp$;

notify pgrst, 'reload schema';

commit;

select 1 as "#", 'স্কিমা ১৪-এর আগের অবস্থায়' as "চেক",
       case when (select v from asf_meta.marks where k = 'before_14') is null then '— (১৪-এর আগের ছাপ নেই)'
            when asf_meta.deep_fingerprint() = (select v from asf_meta.marks where k = 'before_14') then '✅'
            else '❌' end as "ফল",
       (select string_agg(coalesce(email, '?') || ' = ' || role, ' · ' order by role desc, email) from public.housing_admins) as "বিস্তারিত";
