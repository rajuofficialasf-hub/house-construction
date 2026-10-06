-- =====================================================================
-- 10b_project_guards.sql — বহু-প্রকল্প: সার্ভারে যাচাই ও ডাটা-সুরক্ষার গার্ড (পর্ব ২, M-ধাপ ২)
-- পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md §৫.৪, §৫.৬–৫.৮ · চেকলিস্ট সারি ২৭ · পূর্বশর্ত: 10_projects.sql
--
-- যা বসে (কোনো ডাটা বদলায় না — শুধু ফাংশন ও ট্রিগার):
--   housing_validate_record()  — রেকর্ড সংরক্ষণের আগে (BEFORE INSERT/UPDATE): গ্রুপে রেকর্ড নিষেধ; বাংলা লেখা NFC + দুই পাশের
--                                ফাঁকা বাদ (সার্ভারেও); প্রকল্পের core_fields অনুযায়ী আবশ্যক ঘর; ছবি মোড অনুযায়ী আগের ছবি নিষেধ;
--                                extra (কাস্টম মান) যাচাই — অচেনা/গোপন key নিষেধ, ধরন মেলানো (টাকা = পূর্ণসংখ্যা JSON number …)।
--                                UPDATE এ শুধু নতুন/বদলানো মান যাচাই হয় → পরে সংজ্ঞা বদলালেও পুরনো রেকর্ড আটকে যায় না।
--   housing_field_value()      — এক ফিল্ডের মান যাচাই + স্বাভাবিক করা (উপরের ও গোপন-টেবিলের ট্রিগার দুটোই ব্যবহার করে)
--   beneficiary_private_validate() — গোপন টেবিলে শুধু শুধু-এডমিন ফিল্ডের key; মোবাইল নম্বরের বাংলা অঙ্ক → ইংরেজি
--   projects_guard()           — key অপরিবর্তনীয়; সংরক্ষিত slug নিষেধ; প্রকাশিত প্রকল্পের slug/অবস্থান বদল নিষেধ; গ্রুপ-নিয়ম;
--                                আগের ছবি থাকলে ছবি মোড বদল নিষেধ; স্ট্যাট কার্ডের আকার; ব্যবহৃত প্রকল্প মোছা নিষেধ
--   projects_after_write()     — নতুন (অ-গ্রুপ) প্রকল্পের সিরিয়াল কাউন্টার সারি (০ থেকে); বিদ্যমান কাউন্টারে কখনো হাত দেয় না
--   project_fields_guard()     — মান থাকলে ফিল্ড মোছা/key/ধরন/গোপনীয়তা বদল নিষেধ; গ্রুপে ফিল্ড নিষেধ; প্রকল্পে সর্বোচ্চ ৪০টি
--   এডমিনের দুই ভূমিকা (ব্যবহারকারীর সিদ্ধান্ত ২০২৬-১০-০৫): **মূল এডমিন** (main_admin, একজনই) — যোগ, এডিট ও **মোছা**;
--                                **এডমিন** (admin) — শুধু যোগ ও এডিট। মোছা (রেকর্ড, ছবি, প্রকল্প, ফিল্ড, গোপন মান, Storage ফাইল)
--                                শুধু মূল এডমিন — RLS ও ট্রিগারে, ডাটাবেসেই প্রয়োগ। এখনকার সবচেয়ে পুরনো এডমিন মূল এডমিন হন।
-- কাউন্টার টেবিলে RLS আছে কিন্তু পলিসি নেই, তাই কাউন্টার ছোঁয়া সব ফাংশন SECURITY DEFINER (search_path স্থির)।
--
-- ✅ এক ট্রানজেকশনে, ফিঙ্গারপ্রিন্ট যাচাইসহ, আবার চালালে ক্ষতি নেই। চালানোর পরে: checks/10b_selftest.sql।
-- =====================================================================

begin;

do $pre$
begin
  if to_regclass('public.projects') is null or to_regprocedure('asf_meta.data_fingerprint()') is null then
    raise exception 'আগে 10_projects.sql চালান (চেকলিস্ট সারি ২৬) — কিছুই বদলায়নি।';
  end if;
end
$pre$;

create temp table _asf_fp_before on commit drop as select asf_meta.data_fingerprint() as fp;

-- ---------------------------------------------------------------- এডমিনের ভূমিকা: মূল এডমিন ও এডমিন
alter table public.housing_admins drop constraint if exists housing_admins_role_check;
alter table public.housing_admins add constraint housing_admins_role_check check (role in ('admin', 'main_admin'));
-- মূল এডমিন একজনই
create unique index if not exists housing_admins_one_main_admin on public.housing_admins ((role)) where role = 'main_admin';
-- প্রথমবার: মূল এডমিন না থাকলে সবচেয়ে পুরনো এডমিন মূল এডমিন হন (পরে বদলাতে: README দেখুন)
update public.housing_admins
   set role = 'main_admin'
 where not exists (select 1 from public.housing_admins where role = 'main_admin')
   and user_id = (select user_id from public.housing_admins order by created_at, user_id limit 1);

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

-- মোছা শুধু মূল এডমিন (যোগ/এডিটের পলিসি অপরিবর্তিত — সব এডমিন)
drop policy if exists "housing_beneficiaries_admin_delete" on public.housing_beneficiaries;
create policy "housing_beneficiaries_admin_delete"
  on public.housing_beneficiaries for delete
  to authenticated
  using ((select public.is_housing_main_admin()));

drop policy if exists "projects_admin_delete" on public.projects;
create policy "projects_admin_delete" on public.projects for delete to authenticated
  using ((select public.is_housing_main_admin()));

drop policy if exists "project_fields_admin_delete" on public.project_fields;
create policy "project_fields_admin_delete" on public.project_fields for delete to authenticated
  using ((select public.is_housing_main_admin()));

drop policy if exists "beneficiary_private_admin_all" on public.beneficiary_private;
drop policy if exists "beneficiary_private_admin_read" on public.beneficiary_private;
create policy "beneficiary_private_admin_read" on public.beneficiary_private for select to authenticated
  using ((select public.is_housing_admin()));
drop policy if exists "beneficiary_private_admin_insert" on public.beneficiary_private;
create policy "beneficiary_private_admin_insert" on public.beneficiary_private for insert to authenticated
  with check ((select public.is_housing_admin()));
drop policy if exists "beneficiary_private_admin_update" on public.beneficiary_private;
create policy "beneficiary_private_admin_update" on public.beneficiary_private for update to authenticated
  using ((select public.is_housing_admin())) with check ((select public.is_housing_admin()));
drop policy if exists "beneficiary_private_main_delete" on public.beneficiary_private;
create policy "beneficiary_private_main_delete" on public.beneficiary_private for delete to authenticated
  using ((select public.is_housing_main_admin()));

-- Storage: ছবির ফাইল মোছা শুধু মূল এডমিন (আপলোড/প্রতিস্থাপন সব এডমিন — 05_storage.sql অপরিবর্তিত)
drop policy if exists "housing_photos_admin_delete" on storage.objects;
create policy "housing_photos_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'housing-photos' and public.is_housing_main_admin());

-- ---------------------------------------------------------------- এক ফিল্ডের মান: যাচাই + স্বাভাবিক করা
-- ফেরত: স্বাভাবিক করা jsonb মান, অথবা null (খালি লেখা — সংরক্ষণ হবে না)। ভুল হলে 23514, DETAIL = extra.<key>
create or replace function public.housing_field_value(f public.project_fields, v jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  lbl  text := coalesce(nullif(f.label_bn, ''), f.key);
  det  text := case when f.visibility = 'admin' then 'private.' else 'extra.' end || f.key;
  s    text;
  n    numeric;
  lim  integer;
begin
  if f.type in ('text', 'long_text', 'category', 'phone') then
    if jsonb_typeof(v) <> 'string' then
      raise exception '«%»: লেখা দিন', lbl using errcode = '23514', detail = det;
    end if;
    s := normalize(btrim(v #>> '{}'), NFC);
    if f.type = 'category' then
      s := regexp_replace(s, '\s+', ' ', 'g');
    elsif f.type = 'phone' then
      s := translate(s, '০১২৩৪৫৬৭৮৯', '0123456789');
      if s <> '' and s !~ '^[0-9+\- ]{6,20}$' then
        raise exception '«%»: সঠিক মোবাইল নম্বর দিন', lbl using errcode = '23514', detail = det;
      end if;
    end if;
    lim := coalesce(f.max_length, case f.type when 'long_text' then 2000 when 'category' then 100 else 500 end);
    if length(s) > lim then
      raise exception '«%»: লেখা বেশি লম্বা (সর্বোচ্চ % অক্ষর)', lbl, lim using errcode = '23514', detail = det;
    end if;
    if s = '' then
      return null;
    end if;
    return to_jsonb(s);

  elsif f.type in ('number', 'money') then
    if jsonb_typeof(v) <> 'number' then
      raise exception '«%»: শুধু সংখ্যা দিন (যেমন 10000)', lbl using errcode = '23514', detail = det;
    end if;
    n := (v #>> '{}')::numeric;
    if f.type = 'money' then
      if n <> trunc(n) then
        raise exception '«%»: টাকা পূর্ণসংখ্যায় দিন (পয়সা নয়)', lbl using errcode = '23514', detail = det;
      end if;
      if n < 0 or n > 100000000000 then
        raise exception '«%»: টাকার পরিমাণ ০ থেকে ১০০০ কোটির মধ্যে হতে হবে', lbl using errcode = '23514', detail = det;
      end if;
    elsif n <> round(n, 2) then
      raise exception '«%»: সর্বোচ্চ ২ ঘর দশমিক', lbl using errcode = '23514', detail = det;
    end if;
    if f.min_value is not null and n < f.min_value then
      raise exception '«%»: সর্বনিম্ন %', lbl, f.min_value using errcode = '23514', detail = det;
    end if;
    if f.max_value is not null and n > f.max_value then
      raise exception '«%»: সর্বোচ্চ %', lbl, f.max_value using errcode = '23514', detail = det;
    end if;
    return v;

  elsif f.type = 'date' then
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception '«%»: তারিখ YYYY-MM-DD আকারে দিন', lbl using errcode = '23514', detail = det;
    end if;
    begin
      perform (v #>> '{}')::date;
    exception when others then
      raise exception '«%»: তারিখটি সঠিক নয়', lbl using errcode = '23514', detail = det;
    end;
    return v;
  end if;

  raise exception 'অজানা ফিল্ড-ধরন: %', f.type using errcode = '23514', detail = det;
end;
$$;
revoke all on function public.housing_field_value(public.project_fields, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- রেকর্ড যাচাই (BEFORE INSERT/UPDATE)
-- নাম "housing_beneficiaries_validate" — বর্ণানুক্রমে assign_serial / protect_serial / set_updated_at এর পরে চলে।
create or replace function public.housing_validate_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p        public.projects%rowtype;
  f        public.project_fields%rowtype;
  r        record;
  is_ins   boolean := tg_op = 'INSERT';
  cleaned  jsonb := '{}'::jsonb;
  nv       jsonb;
  core     jsonb;
begin
  select * into p from public.projects where key = new.project_type;
  if not found then
    raise exception 'অচেনা প্রকল্প: %', new.project_type using errcode = '23503', detail = 'project_type';
  end if;
  if p.is_group then
    raise exception '«%» একটি প্রকল্প-গ্রুপ — এতে সরাসরি রেকর্ড রাখা যায় না; উপ-প্রকল্প বাছুন', p.name_bn
      using errcode = '23514', detail = 'project_type';
  end if;
  core := coalesce(p.core_fields, '{}'::jsonb);

  -- বাংলা লেখা: NFC + দুই পাশের ফাঁকা বাদ (এতদিন শুধু ক্লায়েন্টে হতো)
  new.name                   := normalize(btrim(coalesce(new.name, '')), NFC);
  new.father_or_husband_name := normalize(btrim(coalesce(new.father_or_husband_name, '')), NFC);
  new.division               := normalize(btrim(coalesce(new.division, '')), NFC);
  new.district               := normalize(btrim(coalesce(new.district, '')), NFC);
  new.upazila                := normalize(btrim(coalesce(new.upazila, '')), NFC);
  new.union_name             := normalize(btrim(coalesce(new.union_name, '')), NFC);
  new.address                := normalize(btrim(coalesce(new.address, '')), NFC);

  -- আবশ্যক সিস্টেম ঘর (UPDATE এ শুধু আগে মান থাকলে খালি করা নিষেধ — পুরনো রেকর্ড আটকায় না)
  if new.name = '' then
    raise exception 'উপকারভোগীর নাম আবশ্যক' using errcode = '23514', detail = 'name';
  end if;
  if new.division = '' or new.district = '' or new.upazila = '' then
    raise exception 'বিভাগ, জেলা ও উপজেলা আবশ্যক' using errcode = '23514', detail = 'upazila';
  end if;
  if coalesce((core -> 'father_or_husband_name' ->> 'required')::boolean, false)
     and new.father_or_husband_name = '' and (is_ins or old.father_or_husband_name <> '') then
    raise exception 'পিতা/স্বামীর নাম আবশ্যক' using errcode = '23514', detail = 'father_or_husband_name';
  end if;
  if coalesce((core -> 'address' ->> 'required')::boolean, false)
     and new.address = '' and (is_ins or old.address <> '') then
    raise exception 'বিস্তারিত ঠিকানা আবশ্যক' using errcode = '23514', detail = 'address';
  end if;
  if p.geo_depth = 'union' and coalesce((core -> 'union_name' ->> 'required')::boolean, false)
     and new.union_name = '' and (is_ins or old.union_name <> '') then
    raise exception 'ইউনিয়ন আবশ্যক' using errcode = '23514', detail = 'union_name';
  end if;

  -- ছবি মোছা (লিংক থেকে খালি) শুধু মূল এডমিন — লগইন করা ব্যবহারকারীর ক্ষেত্রে (SQL Editor/স্ক্রিপ্টে auth.uid() নেই)
  if not is_ins and auth.uid() is not null and not public.is_housing_main_admin()
     and ((old.prev_photo_url is not null and new.prev_photo_url is null)
       or (old.current_photo_url is not null and new.current_photo_url is null)) then
    raise exception 'শুধু মূল এডমিন ছবি মুছতে পারেন' using errcode = '42501', detail = 'photo';
  end if;

  -- ছবি মোড
  if p.photo_mode <> 'before_after'
     and (new.prev_photo_url is not null or new.prev_thumb_url is not null)
     and (is_ins or new.prev_photo_url is distinct from old.prev_photo_url or new.prev_thumb_url is distinct from old.prev_thumb_url) then
    raise exception 'এই প্রকল্পে আগের ছবি রাখা যায় না (ছবি মোড: শুধু পরের ছবি)' using errcode = '23514', detail = 'prev_photo_url';
  end if;
  if p.photo_mode = 'none'
     and (new.current_photo_url is not null or new.current_thumb_url is not null)
     and (is_ins or new.current_photo_url is distinct from old.current_photo_url or new.current_thumb_url is distinct from old.current_thumb_url) then
    raise exception 'এই প্রকল্পে ছবি রাখা যায় না (ছবি মোড: ছবি নেই)' using errcode = '23514', detail = 'current_photo_url';
  end if;

  -- কাস্টম মান (extra)
  if new.extra is null then
    new.extra := '{}'::jsonb;
  end if;
  if jsonb_typeof(new.extra) <> 'object' then
    raise exception 'extra অবশ্যই একটি JSON object' using errcode = '23514', detail = 'extra';
  end if;
  for r in select key, value from jsonb_each(new.extra) loop
    if r.value = 'null'::jsonb or r.value = '""'::jsonb then
      continue;                                   -- খালি মান রাখা হয় না
    end if;
    if not is_ins and (old.extra -> r.key) is not distinct from r.value then
      cleaned := cleaned || jsonb_build_object(r.key, r.value);   -- অপরিবর্তিত মান যেমন ছিল
      continue;
    end if;
    select * into f from public.project_fields where project_key = new.project_type and key = r.key;
    if not found then
      raise exception 'অচেনা ফিল্ড "%" — এই প্রকল্পে এমন ফিল্ড নেই', r.key using errcode = '23514', detail = 'extra.' || r.key;
    end if;
    if f.visibility <> 'public' then
      raise exception '«%» গোপন ফিল্ড — এর মান পাবলিক অংশে (extra) রাখা যায় না', f.label_bn
        using errcode = '23514', detail = 'extra.' || r.key;
    end if;
    if not f.is_active then
      raise exception '«%» ফিল্ডটি আর্কাইভ করা — নতুন মান দেওয়া যায় না', f.label_bn
        using errcode = '23514', detail = 'extra.' || r.key;
    end if;
    nv := public.housing_field_value(f, r.value);
    if nv is not null then
      cleaned := cleaned || jsonb_build_object(r.key, nv);
    end if;
  end loop;

  -- আবশ্যক কাস্টম ফিল্ড: INSERT এ থাকতে হবে; UPDATE এ আগে থাকা মান খালি করা যাবে না
  for f in select * from public.project_fields
            where project_key = new.project_type and is_active and required and visibility = 'public' loop
    if not (cleaned ? f.key) and (is_ins or (old.extra ? f.key)) then
      raise exception '«%» আবশ্যক', f.label_bn using errcode = '23514', detail = 'extra.' || f.key;
    end if;
  end loop;

  new.extra := cleaned;
  return new;
end;
$$;

drop trigger if exists housing_beneficiaries_validate on public.housing_beneficiaries;
create trigger housing_beneficiaries_validate
  before insert or update on public.housing_beneficiaries
  for each row execute function public.housing_validate_record();

-- ---------------------------------------------------------------- গোপন মান যাচাই (beneficiary_private)
create or replace function public.beneficiary_private_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pt      text;
  f       public.project_fields%rowtype;
  r       record;
  cleaned jsonb := '{}'::jsonb;
  nv      jsonb;
begin
  select project_type into pt from public.housing_beneficiaries where id = new.record_id;
  if not found then
    raise exception 'রেকর্ড পাওয়া যায়নি' using errcode = '23503', detail = 'record_id';
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    raise exception 'data অবশ্যই একটি JSON object' using errcode = '23514', detail = 'data';
  end if;
  for r in select key, value from jsonb_each(new.data) loop
    if r.value = 'null'::jsonb or r.value = '""'::jsonb then
      continue;
    end if;
    if tg_op = 'UPDATE' and (old.data -> r.key) is not distinct from r.value then
      cleaned := cleaned || jsonb_build_object(r.key, r.value);
      continue;
    end if;
    select * into f from public.project_fields where project_key = pt and key = r.key;
    if not found then
      raise exception 'অচেনা গোপন ফিল্ড "%"', r.key using errcode = '23514', detail = 'private.' || r.key;
    end if;
    if f.visibility <> 'admin' then
      raise exception '«%» পাবলিক ফিল্ড — এর মান গোপন অংশে নয়, extra-তে যাবে', f.label_bn
        using errcode = '23514', detail = 'private.' || r.key;
    end if;
    if not f.is_active then
      raise exception '«%» ফিল্ডটি আর্কাইভ করা — নতুন মান দেওয়া যায় না', f.label_bn
        using errcode = '23514', detail = 'private.' || r.key;
    end if;
    nv := public.housing_field_value(f, r.value);
    if nv is not null then
      cleaned := cleaned || jsonb_build_object(r.key, nv);
    end if;
  end loop;
  new.data := cleaned;
  return new;
end;
$$;

drop trigger if exists beneficiary_private_validate on public.beneficiary_private;
create trigger beneficiary_private_validate
  before insert or update on public.beneficiary_private
  for each row execute function public.beneficiary_private_validate();

-- ---------------------------------------------------------------- প্রকল্পের গার্ড
create or replace function public.projects_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved text[] := array['admin', 'api', 'auth', 'login', 'logout', 'assets', 'geo', 'static', 'src', 'public',
                           'node-modules', 'favicon', 'icons', 'dev', 'projects', 'records', 'search', 'about',
                           'contact', 'donate', 'news', 'en', 'bn', 'new', 'edit', 'import', 'photos', 'activity',
                           'settings', 'users', 'preview', 'index'];
  par      public.projects%rowtype;
  cnt      bigint;
  last_s   integer;
  card     jsonb;
  homes    integer := 0;
begin
  -- ---------- মোছা ----------
  if tg_op = 'DELETE' then
    if old.is_group then
      if exists (select 1 from public.projects where parent_key = old.key) then
        raise exception '«%» গ্রুপে উপ-প্রকল্প আছে — আগে সেগুলো সরান', old.name_bn using errcode = '23503';
      end if;
      return old;
    end if;
    select count(*) into cnt from public.housing_beneficiaries where project_type = old.key;
    if cnt > 0 then
      raise exception '«%» প্রকল্পে % টি রেকর্ড আছে — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন', old.name_bn, cnt
        using errcode = '23503';
    end if;
    select last_serial into last_s from public.housing_serial_counters where project_type = old.key;
    if not found then
      raise exception '«%» প্রকল্পের সিরিয়াল-কাউন্টার পাওয়া যায়নি — নিরাপত্তার জন্য মোছা বন্ধ', old.name_bn
        using errcode = '23503';
    end if;
    if last_s > 0 and coalesce(current_setting('asf.allow_project_delete', true), '') <> 'on' then
      raise exception '«%» প্রকল্পে আগে রেকর্ড ছিল (সিরিয়াল % পর্যন্ত দেওয়া হয়েছে) — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন',
        old.name_bn, last_s using errcode = '23503';
    end if;
    -- কাউন্টার সারি ইচ্ছাকৃতভাবে থেকে যায়: একই key আবার তৈরি হলে সিরিয়াল পুনর্ব্যবহার হবে না
    return old;
  end if;

  -- ---------- যোগ/বদল: লেখা স্বাভাবিক করা ----------
  new.slug           := lower(btrim(new.slug));
  new.name_bn        := normalize(btrim(new.name_bn), NFC);
  new.name_en        := btrim(new.name_en);
  new.summary_bn     := normalize(btrim(new.summary_bn), NFC);
  new.summary_en     := btrim(new.summary_en);
  new.description_bn := normalize(btrim(new.description_bn), NFC);
  new.description_en := btrim(new.description_en);
  new.unit_bn        := normalize(btrim(new.unit_bn), NFC);
  new.prev_label_bn  := normalize(btrim(new.prev_label_bn), NFC);
  new.current_label_bn := normalize(btrim(new.current_label_bn), NFC);

  if new.slug = any (reserved) then
    raise exception '"%" সংরক্ষিত শব্দ — URL হিসেবে নেওয়া যাবে না', new.slug using errcode = '23514', detail = 'slug';
  end if;
  if new.parent_key is not null then
    select * into par from public.projects where key = new.parent_key;
    if not found or not par.is_group then
      raise exception 'উপ-প্রকল্পের অভিভাবক অবশ্যই একটি প্রকল্প-গ্রুপ হতে হবে' using errcode = '23514', detail = 'parent_key';
    end if;
  end if;

  -- স্ট্যাট কার্ড: সর্বোচ্চ ৮টি, হোমে সর্বোচ্চ ৩টি, প্রতিটির আকার ঠিক (ফিল্ডের অস্তিত্ব যাচাই হয় প্রকাশের চেকলিস্টে)
  if jsonb_array_length(new.stat_cards) > 8 then
    raise exception 'স্ট্যাট কার্ড সর্বোচ্চ ৮টি' using errcode = '23514', detail = 'stat_cards';
  end if;
  for card in select value from jsonb_array_elements(new.stat_cards) loop
    if jsonb_typeof(card) <> 'object'
       or coalesce(card ->> 'kind', '') not in ('count', 'geo', 'sum', 'distinct')
       or coalesce(btrim(card ->> 'label_bn'), '') = ''
       or (card ->> 'kind' in ('sum', 'distinct') and coalesce(card ->> 'field', '') = '')
       or (card ->> 'kind' = 'geo' and coalesce(card ->> 'level', '') not in ('division', 'district', 'upazila', 'union')) then
      raise exception 'স্ট্যাট কার্ডের তথ্য অসম্পূর্ণ: %', card::text using errcode = '23514', detail = 'stat_cards';
    end if;
    if coalesce((card ->> 'home')::boolean, false) then
      homes := homes + 1;
    end if;
  end loop;
  if homes > 3 then
    raise exception 'হোম পেইজের কার্ডে সর্বোচ্চ ৩টি স্ট্যাট' using errcode = '23514', detail = 'stat_cards';
  end if;

  if tg_op = 'UPDATE' then
    if new.key <> old.key then
      raise exception 'প্রকল্পের key বদলানো যায় না (সিরিয়াল, ছবির পাথ ও লগ এর ওপর নির্ভর করে)' using errcode = '23514', detail = 'key';
    end if;
    if old.is_published and (new.slug <> old.slug or new.parent_key is distinct from old.parent_key) then
      raise exception 'প্রকাশিত প্রকল্পের URL বা অবস্থান বদলানো যায় না — আগে অপ্রকাশিত করুন (শেয়ার করা লিংক ভাঙবে)'
        using errcode = '23514', detail = 'slug';
    end if;
    if new.is_group <> old.is_group then
      if exists (select 1 from public.housing_beneficiaries where project_type = old.key)
         or exists (select 1 from public.projects where parent_key = old.key)
         or exists (select 1 from public.project_fields where project_key = old.key) then
        raise exception 'রেকর্ড, উপ-প্রকল্প বা ফিল্ড থাকা অবস্থায় গ্রুপ/প্রকল্প ধরন বদলানো যায় না' using errcode = '23514', detail = 'is_group';
      end if;
    end if;
    if new.photo_mode <> old.photo_mode and new.photo_mode in ('after_only', 'none') then
      select count(*) into cnt from public.housing_beneficiaries
       where project_type = old.key and (prev_photo_url is not null or prev_thumb_url is not null);
      if cnt > 0 then
        raise exception '% টি রেকর্ডে আগের ছবি আছে — ছবি মোড "শুধু পরের ছবি"/"ছবি নেই" করা যাবে না', cnt
          using errcode = '23514', detail = 'photo_mode';
      end if;
    end if;
    if new.photo_mode <> old.photo_mode and new.photo_mode = 'none' then
      select count(*) into cnt from public.housing_beneficiaries
       where project_type = old.key and (current_photo_url is not null or current_thumb_url is not null);
      if cnt > 0 then
        raise exception '% টি রেকর্ডে ছবি আছে — ছবি মোড "ছবি নেই" করা যাবে না', cnt using errcode = '23514', detail = 'photo_mode';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_guard on public.projects;
create trigger projects_guard
  before insert or update or delete on public.projects
  for each row execute function public.projects_guard();

-- নতুন (অ-গ্রুপ) প্রকল্প → সিরিয়াল কাউন্টার সারি ০ থেকে। বিদ্যমান কাউন্টারে কখনো হাত দেয় না (do nothing)।
create or replace function public.projects_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_group then
    insert into public.housing_serial_counters (project_type, last_serial)
    values (new.key, 0)
    on conflict (project_type) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists projects_after_write on public.projects;
create trigger projects_after_write
  after insert or update of is_group on public.projects
  for each row execute function public.projects_after_write();

-- ---------------------------------------------------------------- ফিল্ডের গার্ড
create or replace function public.project_fields_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_grp boolean;
  used   bigint := 0;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select is_group into is_grp from public.projects where key = new.project_key;
    if is_grp then
      raise exception 'প্রকল্প-গ্রুপে ফিল্ড রাখা যায় না — উপ-প্রকল্পে যোগ করুন' using errcode = '23514', detail = 'project_key';
    end if;
    new.label_bn := normalize(btrim(new.label_bn), NFC);
    new.label_en := btrim(new.label_en);
    new.help_bn  := normalize(btrim(new.help_bn), NFC);
    new.help_en  := btrim(new.help_en);
    if tg_op = 'INSERT' and (select count(*) from public.project_fields where project_key = new.project_key) >= 40 then
      raise exception 'একটি প্রকল্পে সর্বোচ্চ ৪০টি ফিল্ড' using errcode = '23514', detail = 'key';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    if old.visibility = 'admin' then
      select count(*) into used from public.beneficiary_private bp
        join public.housing_beneficiaries b on b.id = bp.record_id
       where b.project_type = old.project_key and bp.data ? old.key;
    else
      select count(*) into used from public.housing_beneficiaries
       where project_type = old.project_key and extra ? old.key;
    end if;

    if tg_op = 'DELETE' then
      if used > 0 then
        raise exception '«%» ফিল্ডে % টি রেকর্ডে মান আছে — মোছা যাবে না; আর্কাইভ করুন', old.label_bn, used
          using errcode = '23503', detail = 'key';
      end if;
      return old;
    end if;

    if new.project_key <> old.project_key then
      raise exception 'ফিল্ডের প্রকল্প বদলানো যায় না' using errcode = '23514', detail = 'project_key';
    end if;
    if used > 0 and (new.key <> old.key or new.type <> old.type or new.visibility <> old.visibility) then
      raise exception '«%» ফিল্ডে % টি রেকর্ডে মান আছে — key, ধরন বা পাবলিক/গোপন বদলানো যায় না', old.label_bn, used
        using errcode = '23514', detail = 'key';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_fields_guard on public.project_fields;
create trigger project_fields_guard
  before insert or update or delete on public.project_fields
  for each row execute function public.project_fields_guard();

-- ---------------------------------------------------------------- ফিঙ্গারপ্রিন্ট মেলানো
do $fp$
declare
  before_fp jsonb;
  after_fp  jsonb;
begin
  select fp into before_fp from _asf_fp_before;
  after_fp := asf_meta.data_fingerprint();
  if after_fp is distinct from before_fp then
    raise exception 'ফিঙ্গারপ্রিন্ট মেলেনি — কিছুই বদলায়নি (পুরো ফাইল বাতিল)। ফলাফল AI-কে পাঠান।'
      using detail = 'আগে: ' || before_fp::text || ' | পরে: ' || after_fp::text;
  end if;
end
$fp$;

notify pgrst, 'reload schema';

commit;

select k as "#", item as "চেক", ok as "ফল", info as "বিস্তারিত"
from (
  select 1 as k, 'যাচাই-ট্রিগার (রেকর্ড)' as item,
         case when exists (select 1 from pg_trigger where tgname = 'housing_beneficiaries_validate') then '✅' else '❌' end as ok,
         'housing_beneficiaries_validate → housing_validate_record()' as info
  union all
  select 2, 'গোপন টেবিলের যাচাই',
         case when exists (select 1 from pg_trigger where tgname = 'beneficiary_private_validate') then '✅' else '❌' end,
         'beneficiary_private_validate'
  union all
  select 3, 'প্রকল্পের গার্ড ও কাউন্টার',
         case when (select count(*) from pg_trigger where tgname in ('projects_guard', 'projects_after_write')) = 2 then '✅' else '❌' end,
         'projects_guard, projects_after_write'
  union all
  select 4, 'ফিল্ডের গার্ড',
         case when exists (select 1 from pg_trigger where tgname = 'project_fields_guard') then '✅' else '❌' end,
         'project_fields_guard'
  union all
  select 5, 'কাউন্টার ছোঁয়া ফাংশন SECURITY DEFINER',
         case when (select bool_and(prosecdef) from pg_proc where oid in ('public.projects_guard()'::regprocedure, 'public.projects_after_write()'::regprocedure)) then '✅' else '❌' end,
         'projects_guard, projects_after_write'
  union all
  select 6, 'লাইভ ডাটার ফিঙ্গারপ্রিন্ট (ফাইলের ভেতরে আগে-পরে)', '✅', 'অপরিবর্তিত'
  union all
  select 7, 'মূল এডমিন (একজন) — মোছা শুধু তাঁর',
         case when (select count(*) from public.housing_admins where role = 'main_admin') = 1 then '✅' else '❌' end,
         coalesce((select email from public.housing_admins where role = 'main_admin'), 'নেই')
           || ' · অন্য এডমিন (যোগ/এডিট): ' || (select count(*) from public.housing_admins where role = 'admin') || ' জন'
  union all
  select 8, 'পরের কাজ', '➡', 'checks/10b_selftest.sql চালান (চেকলিস্ট সারি ২৭)'
) t
order by k;
