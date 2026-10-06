-- =====================================================================
-- 14_project_users.sql — প্রকল্পভিত্তিক ইউজার; "মোছার সমান" কাজ শুধু সুপার এডমিন (পর্ব চ, M-ধাপ ১৮ · চেকলিস্ট সারি ৩৫)
-- পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md → পর্ব চ (অনুমতির টেবিল; প্রশ্ন ২২–২৪)
-- পূর্বশর্ত: 10, 10b, 11, 12 (13 থাকুক বা না থাকুক)। আগে: backup/before_14.sql। পরে: checks/14_selftest.sql,
--            checks/14_rollback_rehearsal.sql। ফেরাতে: rollback/14_rollback.sql
--
-- ভূমিকা:
--   main_admin (মূল/সুপার এডমিন, একজন) — সব; মোছা, ছবি ওভাররাইট, মান ফাঁকা করা, সিরিয়াল বদল, প্রকল্পের সেটিংস, ইউজার।
--   editor (প্রকল্পের ইউজার) — শুধু বরাদ্দ প্রকল্পে (housing_admin_projects; গ্রুপ = তার সব উপ-প্রকল্প; all_projects = সব):
--                              রেকর্ড যোগ ও এডিট (ফাঁকা ঘরে মান দেওয়া, মান বদলানো), গোপন মান, নতুন ছবি। প্রকল্পের সেটিংস নয়।
--   is_active = false → কোনো অধিকার নেই (প্যানেলে ঢুকতেও পারেন না)।
--
-- যা বদলায়:
--   housing_admins: ভূমিকা 'admin' → 'editor' (+ all_projects = true, তাই এখনকার এডমিনের ডাটার অধিকার একই থাকে; সেটিংসের অধিকার যায়);
--                   নতুন কলাম all_projects, is_active; নতুন টেবিল housing_admin_projects
--   ফাংশন: is_housing_admin / is_housing_main_admin (is_active সহ), housing_my_project_keys(), housing_can_edit_project(),
--          housing_current_admin() (+ all_projects, projects), housing_admin_users(), housing_admin_user_save()
--   RLS: রেকর্ড/গোপন মান লেখা → নিজের প্রকল্প; প্রকল্প/ফিল্ড লেখা → শুধু মূল এডমিন; খসড়া/লগ/সিরিয়াল-লগ পড়া → নিজের প্রকল্প
--   Storage: নতুন ফাইল → নিজের প্রকল্পের ফোল্ডার; ওভাররাইট (update) → শুধু মূল এডমিন (মোছা 10b থেকেই মূল এডমিন)
--   গার্ড-ট্রিগার (মূল এডমিন ছাড়া): সিরিয়াল বদল, ভরা ঘর ফাঁকা করা (সিস্টেম/কাস্টম/গোপন), ছবির লিংক বদল/মোছা → বাংলা ত্রুটি
-- যা বদলায় না: কোনো রেকর্ড, ছবি, প্রকল্প বা লগ — লাইভ ডাটার ফিঙ্গারপ্রিন্ট আগে-পরে মেলানো হয়।
--
-- ✅ এক ট্রানজেকশনে; ভুল হলে কিছুই বদলায় না; আবার চালালে ক্ষতি নেই।
--    শুরুতে স্কিমার "গভীর ছাপ" asf_meta.marks এ রাখা হয় ('before_14') — রোলব্যাক-মহড়া এর সাথে মেলায়।
-- চালানো: Supabase → SQL Editor → New query → পুরো ফাইল পেস্ট → Run। শেষে একটিই ফলাফল-টেবিল।
-- =====================================================================

begin;

do $pre$
begin
  if to_regprocedure('public.is_housing_main_admin()') is null or to_regprocedure('public.housing_log_config_change()') is null
     or to_regprocedure('asf_meta.data_fingerprint()') is null then
    raise exception 'আগে 10, 10b, 11, 12 চালান — কিছুই বদলায়নি।';
  end if;
end
$pre$;

-- ---------------------------------------------------------------- স্কিমার গভীর ছাপ (রোলব্যাক-মহড়ার জন্য)
-- নাম ছাড়াও পলিসির শর্ত, ফাংশনের পুরো সংজ্ঞা ও অনুমতি, ট্রিগার, constraint, ইনডেক্স, কলাম, টেবিলের অনুমতি (public + storage পলিসি)
create or replace function asf_meta.deep_fingerprint()
returns jsonb
language sql
stable
as $$
  with items as (
    select 'col:' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') as x
      from information_schema.columns where table_schema = 'public'
    union all
    select 'tbl:' || c.relname || ':' || c.relrowsecurity::text || ':' || coalesce(c.relacl::text, '')
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')
    union all
    select 'con:' || c.conrelid::regclass::text || '.' || c.conname || ':' || pg_get_constraintdef(c.oid)
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public'
    union all
    select 'idx:' || i.indexrelid::regclass::text || ':' || pg_get_indexdef(i.indexrelid)
      from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
    union all
    select 'pol:' || schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' || array_to_string(roles, ',')
           || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '')
      from pg_policies where schemaname in ('public', 'storage')
    union all
    select 'fn:' || p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, '')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f', 'p')
    union all
    select 'trg:' || t.tgrelid::regclass::text || '.' || t.tgname || ':' || pg_get_triggerdef(t.oid)
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
  )
  select jsonb_build_object('fp', md5(string_agg(x, E'\n' order by x)), 'n', count(*)) from items;
$$;
revoke all on function asf_meta.deep_fingerprint() from public;

create table if not exists asf_meta.marks (k text primary key, v jsonb not null, at timestamptz not null default now());
revoke all on asf_meta.marks from public;
-- প্রথমবারই রাখা হয় (আবার চালালে আগের "১৪-এর আগের" ছাপ থাকে)
insert into asf_meta.marks (k, v)
select 'before_14', asf_meta.deep_fingerprint()
 where not exists (select 1 from pg_attribute where attrelid = 'public.housing_admins'::regclass and attname = 'is_active' and not attisdropped)
on conflict (k) do nothing;

create temp table _asf_fp_before on commit drop as select asf_meta.data_fingerprint() as fp;

-- ---------------------------------------------------------------- housing_admins: ভূমিকা ও কলাম
alter table public.housing_admins add column if not exists all_projects boolean not null default false;
alter table public.housing_admins add column if not exists is_active    boolean not null default true;
alter table public.housing_admins drop constraint if exists housing_admins_role_check;
-- এখনকার সাধারণ এডমিন → "সব প্রকল্পের ইউজার" (ডাটার অধিকার একই; প্রকল্পের সেটিংস এখন শুধু মূল এডমিন — প্রশ্ন ২২)
update public.housing_admins set role = 'editor', all_projects = true where role = 'admin';
alter table public.housing_admins add constraint housing_admins_role_check check (role in ('editor', 'main_admin'));
alter table public.housing_admins alter column role set default 'editor';

-- কোন ইউজার কোন প্রকল্পে (key = উপ-প্রকল্প বা গ্রুপ; গ্রুপ = তার সব উপ-প্রকল্প)। পড়া-লেখা শুধু নিচের DEFINER ফাংশন দিয়ে।
create table if not exists public.housing_admin_projects (
  user_id     uuid not null references public.housing_admins (user_id) on delete cascade,
  project_key text not null references public.projects (key) on update restrict on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, project_key)
);
alter table public.housing_admin_projects enable row level security;
revoke all on public.housing_admin_projects from anon, authenticated;

-- ---------------------------------------------------------------- কে কী পারেন
create or replace function public.is_housing_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.housing_admins where user_id = auth.uid() and is_active
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
  select exists (select 1 from public.housing_admins where user_id = auth.uid() and role = 'main_admin' and is_active);
$$;
grant execute on function public.is_housing_main_admin() to anon, authenticated;

-- বর্তমান ইউজার যেসব প্রকল্পে লিখতে পারেন (মূল এডমিন বা "সব প্রকল্প" → সব key; নইলে বরাদ্দ, বরাদ্দ গ্রুপের উপ-প্রকল্প,
-- আর বরাদ্দ উপ-প্রকল্পের গ্রুপ — শেষেরটি শুধু খসড়া গ্রুপ দেখার জন্য; গ্রুপে রেকর্ড রাখা যায় না)। RLS এ (select …) দিয়ে একবার।
create or replace function public.housing_my_project_keys()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select role, all_projects from public.housing_admins where user_id = auth.uid() and is_active
  )
  select case
    when not exists (select 1 from me) then '{}'::text[]
    when (select role = 'main_admin' or all_projects from me) then coalesce((select array_agg(key order by key) from public.projects), '{}')
    else coalesce((
      select array_agg(distinct k order by k) from (
        select p.key as k
          from public.housing_admin_projects ap
          join public.projects p on p.key = ap.project_key or p.parent_key = ap.project_key
         where ap.user_id = auth.uid()
        union
        select p.parent_key
          from public.housing_admin_projects ap
          join public.projects p on p.key = ap.project_key
         where ap.user_id = auth.uid() and p.parent_key is not null
      ) x where k is not null), '{}')
  end;
$$;
grant execute on function public.housing_my_project_keys() to anon, authenticated;

create or replace function public.housing_can_edit_project(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_key = any (public.housing_my_project_keys());
$$;
grant execute on function public.housing_can_edit_project(text) to anon, authenticated;

-- ফ্রন্টএন্ডের AuthProvider: ভূমিকা, ইমেইল, "সব প্রকল্প", লেখার অধিকারের প্রকল্প (নিষ্ক্রিয় হলে খালি)। আউটপুট বদলায় বলে drop + create।
drop function if exists public.housing_current_admin();
create function public.housing_current_admin()
returns table (role text, email text, all_projects boolean, projects text[])
language sql
stable
security definer
set search_path = public
as $$
  select a.role, a.email, (a.role = 'main_admin' or a.all_projects), public.housing_my_project_keys()
    from public.housing_admins a
   where a.user_id = auth.uid() and a.is_active;
$$;
grant execute on function public.housing_current_admin() to authenticated;

-- ---------------------------------------------------------------- RLS: রেকর্ড
drop policy if exists "housing_beneficiaries_read" on public.housing_beneficiaries;
create policy "housing_beneficiaries_read" on public.housing_beneficiaries for select to anon, authenticated
  using (project_type = any ((select public.public_project_keys())::text[]) or project_type = any ((select public.housing_my_project_keys())::text[]));
drop policy if exists "housing_beneficiaries_admin_insert" on public.housing_beneficiaries;
create policy "housing_beneficiaries_admin_insert" on public.housing_beneficiaries for insert to authenticated
  with check (project_type = any ((select public.housing_my_project_keys())::text[]));
drop policy if exists "housing_beneficiaries_admin_update" on public.housing_beneficiaries;
create policy "housing_beneficiaries_admin_update" on public.housing_beneficiaries for update to authenticated
  using (project_type = any ((select public.housing_my_project_keys())::text[]))
  with check (project_type = any ((select public.housing_my_project_keys())::text[]));
-- মোছা: 10b এর "housing_beneficiaries_admin_delete" (শুধু মূল এডমিন) অপরিবর্তিত

-- গোপন মান: নিজের প্রকল্পের রেকর্ডের; মোছা 10b থেকেই মূল এডমিন
drop policy if exists "beneficiary_private_admin_read" on public.beneficiary_private;
create policy "beneficiary_private_admin_read" on public.beneficiary_private for select to authenticated
  using (exists (select 1 from public.housing_beneficiaries b where b.id = record_id and b.project_type = any ((select public.housing_my_project_keys())::text[])));
drop policy if exists "beneficiary_private_admin_insert" on public.beneficiary_private;
create policy "beneficiary_private_admin_insert" on public.beneficiary_private for insert to authenticated
  with check (exists (select 1 from public.housing_beneficiaries b where b.id = record_id and b.project_type = any ((select public.housing_my_project_keys())::text[])));
drop policy if exists "beneficiary_private_admin_update" on public.beneficiary_private;
create policy "beneficiary_private_admin_update" on public.beneficiary_private for update to authenticated
  using (exists (select 1 from public.housing_beneficiaries b where b.id = record_id and b.project_type = any ((select public.housing_my_project_keys())::text[])))
  with check (exists (select 1 from public.housing_beneficiaries b where b.id = record_id and b.project_type = any ((select public.housing_my_project_keys())::text[])));

-- ---------------------------------------------------------------- RLS: প্রকল্প ও ফিল্ড (সেটিংস শুধু মূল এডমিন — প্রশ্ন ২২)
drop policy if exists "projects_read" on public.projects;
-- মূল এডমিন সরাসরি (project_create এর RETURNING নতুন সারিটি পড়ে — তালিকা-ফাংশনটি ইনসার্টের আগের অবস্থা দেখে)
create policy "projects_read" on public.projects for select to anon, authenticated
  using (key = any ((select public.public_project_keys())::text[]) or (select public.is_housing_main_admin())
         or key = any ((select public.housing_my_project_keys())::text[]));
drop policy if exists "projects_admin_insert" on public.projects;
create policy "projects_admin_insert" on public.projects for insert to authenticated
  with check ((select public.is_housing_main_admin()));
drop policy if exists "projects_admin_update" on public.projects;
create policy "projects_admin_update" on public.projects for update to authenticated
  using ((select public.is_housing_main_admin())) with check ((select public.is_housing_main_admin()));

drop policy if exists "project_fields_read" on public.project_fields;
create policy "project_fields_read" on public.project_fields for select to anon, authenticated
  using ((visibility = 'public' and project_key = any ((select public.public_project_keys())::text[])) or (select public.is_housing_main_admin())
         or project_key = any ((select public.housing_my_project_keys())::text[]));
drop policy if exists "project_fields_admin_insert" on public.project_fields;
create policy "project_fields_admin_insert" on public.project_fields for insert to authenticated
  with check ((select public.is_housing_main_admin()));
drop policy if exists "project_fields_admin_update" on public.project_fields;
create policy "project_fields_admin_update" on public.project_fields for update to authenticated
  using ((select public.is_housing_main_admin())) with check ((select public.is_housing_main_admin()));

-- ---------------------------------------------------------------- RLS: লগ ও সিরিয়াল-লগ পড়া
drop policy if exists "housing_activity_log_admin_read" on public.housing_activity_log;
create policy "housing_activity_log_admin_read" on public.housing_activity_log for select to authenticated
  using ((select public.is_housing_main_admin()) or project_type = any ((select public.housing_my_project_keys())::text[])
         or (actor_id = (select auth.uid()) and (select public.is_housing_admin())));
drop policy if exists "housing_serial_changes_admin_read" on public.housing_serial_changes;
create policy "housing_serial_changes_admin_read" on public.housing_serial_changes for select to authenticated
  using (project_type = any ((select public.housing_my_project_keys())::text[]));

-- ---------------------------------------------------------------- Storage: নতুন ফাইল নিজের প্রকল্পে; ওভাররাইট শুধু মূল এডমিন
drop policy if exists "housing_photos_admin_insert" on storage.objects;
create policy "housing_photos_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'housing-photos'
              and (public.is_housing_main_admin()
                   or ((storage.foldername(name))[1] = 'housing' and (storage.foldername(name))[2] = any (public.housing_my_project_keys()))));
drop policy if exists "housing_photos_admin_update" on storage.objects;
create policy "housing_photos_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'housing-photos' and public.is_housing_main_admin())
  with check (bucket_id = 'housing-photos' and public.is_housing_main_admin());
-- মোছা: 10b এর "housing_photos_admin_delete" (শুধু মূল এডমিন) অপরিবর্তিত

-- ---------------------------------------------------------------- গার্ড: "মোছার সমান" কাজ শুধু মূল এডমিন (প্রশ্ন ২৪)
-- নাম zz_ দিয়ে শুরু: BEFORE ট্রিগার নামের ক্রমে চলে, তাই এটি যাচাই-ট্রিগারের (NFC, ফাঁকা বাদ) পরে স্বাভাবিক মান দেখে।
-- SQL Editor/স্ক্রিপ্ট (auth.uid() নেই) আর মূল এডমিনে কোনো সীমা নেই।
create or replace function public.housing_editor_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  k text;
  v jsonb;
  blank constant jsonb[] := array['null'::jsonb, '""'::jsonb];
begin
  if auth.uid() is null or public.is_housing_main_admin() then
    return new;
  end if;
  if new.serial_no is distinct from old.serial_no then
    raise exception 'সিরিয়াল নম্বর বদলাতে পারেন শুধু মূল এডমিন' using errcode = '42501', detail = 'serial_no';
  end if;
  if btrim(coalesce(old.father_or_husband_name, '')) <> '' and btrim(coalesce(new.father_or_husband_name, '')) = '' then
    raise exception 'পিতা/স্বামীর নাম মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন' using errcode = '42501', detail = 'father_or_husband_name';
  end if;
  if btrim(coalesce(old.address, '')) <> '' and btrim(coalesce(new.address, '')) = '' then
    raise exception 'বিস্তারিত ঠিকানা মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন' using errcode = '42501', detail = 'address';
  end if;
  if btrim(coalesce(old.union_name, '')) <> '' and btrim(coalesce(new.union_name, '')) = '' then
    raise exception 'ইউনিয়ন মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন' using errcode = '42501', detail = 'union_name';
  end if;
  if (old.prev_photo_url is not null and new.prev_photo_url is distinct from old.prev_photo_url)
     or (old.prev_thumb_url is not null and new.prev_thumb_url is distinct from old.prev_thumb_url)
     or (old.current_photo_url is not null and new.current_photo_url is distinct from old.current_photo_url)
     or (old.current_thumb_url is not null and new.current_thumb_url is distinct from old.current_thumb_url) then
    raise exception 'আগে থেকে থাকা ছবি বদলাতে বা মুছতে পারেন শুধু মূল এডমিন' using errcode = '42501', detail = 'photo';
  end if;
  if (btrim(coalesce(old.prev_photo_source, '')) <> '' and btrim(coalesce(new.prev_photo_source, '')) = '')
     or (btrim(coalesce(old.current_photo_source, '')) <> '' and btrim(coalesce(new.current_photo_source, '')) = '') then
    raise exception 'ছবির উৎস মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন' using errcode = '42501', detail = 'photo_source';
  end if;
  for k, v in select e.key, e.value from jsonb_each(coalesce(old.extra, '{}'::jsonb)) e loop
    if not (v = any (blank)) and (not (coalesce(new.extra, '{}'::jsonb) ? k) or new.extra -> k = any (blank)
                                  or (jsonb_typeof(new.extra -> k) = 'string' and btrim(new.extra ->> k) = '')) then
      raise exception '«%» এর মান মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন',
        coalesce((select f.label_bn from public.project_fields f where f.project_key = new.project_type and f.key = k), k)
        using errcode = '42501', detail = 'extra.' || k;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists housing_beneficiaries_zz_editor_guard on public.housing_beneficiaries;
create trigger housing_beneficiaries_zz_editor_guard
  before update on public.housing_beneficiaries
  for each row execute function public.housing_editor_guard();

create or replace function public.beneficiary_private_editor_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  k text;
  v jsonb;
  blank constant jsonb[] := array['null'::jsonb, '""'::jsonb];
begin
  if auth.uid() is null or public.is_housing_main_admin() then
    return new;
  end if;
  for k, v in select e.key, e.value from jsonb_each(coalesce(old.data, '{}'::jsonb)) e loop
    if not (v = any (blank)) and (not (coalesce(new.data, '{}'::jsonb) ? k) or new.data -> k = any (blank)
                                  or (jsonb_typeof(new.data -> k) = 'string' and btrim(new.data ->> k) = '')) then
      raise exception 'গোপন «%» এর মান মুছে ফাঁকা করতে পারেন শুধু মূল এডমিন', k using errcode = '42501', detail = 'extra.' || k;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists beneficiary_private_zz_editor_guard on public.beneficiary_private;
create trigger beneficiary_private_zz_editor_guard
  before update on public.beneficiary_private
  for each row execute function public.beneficiary_private_editor_guard();

-- ---------------------------------------------------------------- ইউজার ব্যবস্থাপনা (শুধু মূল এডমিন; প্যানেলের ইউজার-পাতা — M-ধাপ ১৯)
create or replace function public.housing_admin_users()
returns table (user_id uuid, email text, role text, all_projects boolean, is_active boolean, projects text[],
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_housing_main_admin() then
    raise exception 'শুধু মূল এডমিন ইউজারের তালিকা দেখতে পারেন' using errcode = '42501';
  end if;
  return query
    select a.user_id, coalesce(u.email::text, a.email), a.role, a.all_projects, a.is_active,
           coalesce((select array_agg(ap.project_key order by ap.project_key) from public.housing_admin_projects ap where ap.user_id = a.user_id), '{}'),
           a.created_at, u.last_sign_in_at
      from public.housing_admins a
      left join auth.users u on u.id = a.user_id
     order by (a.role = 'main_admin') desc, a.created_at, a.user_id;
end;
$$;
revoke all on function public.housing_admin_users() from public, anon;
grant execute on function public.housing_admin_users() to authenticated;

-- ইউজার যোগ বা বদল: অ্যাকাউন্ট আগে Supabase → Authentication → Add user দিয়ে খোলা থাকতে হবে (প্রশ্ন ২৩)।
-- p_projects: প্রকল্প/গ্রুপের key; p_all_projects = true হলে তালিকা লাগে না। মূল এডমিনকে এখান থেকে বদলানো যায় না।
create or replace function public.housing_admin_user_save(p_email text, p_all_projects boolean, p_projects text[], p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid;
  em       text;
  unknown  text;
  existed  boolean;
  keys     text[] := coalesce((select array_agg(distinct btrim(x)) from unnest(coalesce(p_projects, '{}')) x where btrim(x) <> ''), '{}');
  a_id     uuid;
  a_email  text;
begin
  if not public.is_housing_main_admin() then
    raise exception 'শুধু মূল এডমিন ইউজার যোগ বা বদল করতে পারেন' using errcode = '42501';
  end if;
  select u.id, u.email::text into uid, em from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if uid is null then
    raise exception '«%» ইমেইলে কোনো অ্যাকাউন্ট নেই — আগে Supabase → Authentication → Add user দিয়ে অ্যাকাউন্ট খুলুন', btrim(coalesce(p_email, ''))
      using errcode = 'P0002', detail = 'email';
  end if;
  if exists (select 1 from public.housing_admins where user_id = uid and role = 'main_admin') then
    raise exception 'মূল এডমিনকে এখান থেকে বদলানো যায় না' using errcode = '42501', detail = 'email';
  end if;
  select string_agg(k, ', ') into unknown from unnest(keys) k where not exists (select 1 from public.projects p where p.key = k);
  if unknown is not null then
    raise exception 'অচেনা প্রকল্প: %', unknown using errcode = '23503', detail = 'projects';
  end if;
  existed := exists (select 1 from public.housing_admins where user_id = uid);
  insert into public.housing_admins (user_id, email, role, all_projects, is_active)
  values (uid, em, 'editor', coalesce(p_all_projects, false), coalesce(p_active, true))
  on conflict (user_id) do update
    set email = excluded.email, all_projects = excluded.all_projects, is_active = excluded.is_active;
  delete from public.housing_admin_projects where user_id = uid;
  if not coalesce(p_all_projects, false) then
    insert into public.housing_admin_projects (user_id, project_key) select uid, k from unnest(keys) k;
  end if;
  select actor_id, actor_email into a_id, a_email from public.housing_current_actor();
  insert into public.housing_activity_log (actor_id, actor_email, action, record_name, details)
  values (a_id, a_email, 'admin_user_update', em,
          jsonb_build_object('email', em, 'created', not existed, 'all_projects', coalesce(p_all_projects, false),
                             'projects', case when coalesce(p_all_projects, false) then '[]'::jsonb else to_jsonb(keys) end,
                             'active', coalesce(p_active, true)));
  return jsonb_build_object('user_id', uid, 'email', em, 'created', not existed);
end;
$$;
revoke all on function public.housing_admin_user_save(text, boolean, text[], boolean) from public, anon;
grant execute on function public.housing_admin_user_save(text, boolean, text[], boolean) to authenticated;

-- ---------------------------------------------------------------- ফিঙ্গারপ্রিন্ট মেলানো (না মিললে সব বাতিল)
do $fp$
begin
  if asf_meta.data_fingerprint() is distinct from (select fp from _asf_fp_before) then
    raise exception 'ফিঙ্গারপ্রিন্ট মেলেনি — কিছুই বদলায়নি (পুরো ফাইল বাতিল)। ফলাফল AI-কে পাঠান।';
  end if;
end
$fp$;

notify pgrst, 'reload schema';

commit;

select k as "#", item as "চেক", ok as "ফল", info as "বিস্তারিত"
from (
  select 1 as k, 'ভূমিকা: মূল এডমিন ১ জন, বাকিরা "প্রকল্পের ইউজার"' as item,
         case when (select count(*) from public.housing_admins where role = 'main_admin') = 1
                   and not exists (select 1 from public.housing_admins where role not in ('main_admin', 'editor')) then '✅' else '❌' end as ok,
         (select string_agg(coalesce(email, '?') || ' = ' || case when role = 'main_admin' then 'মূল এডমিন' when all_projects then 'সব প্রকল্পের ইউজার' else 'প্রকল্পের ইউজার' end, ' · ' order by role desc, email)
            from public.housing_admins) as info
  union all
  select 2, 'নতুন ফাংশন ও টেবিল',
         case when to_regprocedure('public.housing_my_project_keys()') is not null and to_regprocedure('public.housing_admin_user_save(text,boolean,text[],boolean)') is not null
                   and to_regclass('public.housing_admin_projects') is not null then '✅' else '❌' end,
         'housing_my_project_keys, housing_can_edit_project, housing_admin_users, housing_admin_user_save, housing_admin_projects'
  union all
  select 3, 'গার্ড-ট্রিগার (মোছার সমান কাজ শুধু মূল এডমিন)',
         case when (select count(*) from pg_trigger where tgname in ('housing_beneficiaries_zz_editor_guard', 'beneficiary_private_zz_editor_guard')) = 2 then '✅' else '❌' end,
         'সিরিয়াল বদল, ভরা ঘর ফাঁকা, ছবির লিংক বদল/মোছা'
  union all
  select 4, 'স্কিমার "১৪-এর আগের" ছাপ রাখা (রোলব্যাক-মহড়ার জন্য)',
         case when exists (select 1 from asf_meta.marks where k = 'before_14') then '✅' else '❌' end,
         (select v ->> 'fp' from asf_meta.marks where k = 'before_14')
  union all
  select 5, 'লাইভ ডাটার ফিঙ্গারপ্রিন্ট', '✅', 'অপরিবর্তিত (ভিন্ন হলে ফাইলটি নিজেই বাতিল হতো)'
) t
order by k;
