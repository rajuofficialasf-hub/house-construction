-- =====================================================================
-- rollback/10_12_rollback.sql — SQL ১০–১২ উল্টে দেওয়া (পর্ব ২) · পরিকল্পনা §৬.৬
-- ⚠ শুধু জরুরি অবস্থায়, AI-এর পরামর্শে চালাবেন। আগে checks/rollback_rehearsal.sql দিয়ে মহড়া (কিছুই বদলায় না)।
--
-- অংশ: ১২ → ১১ → ১০b → ১০ (প্রতিটি if exists দিয়ে লেখা — শুধু ১০ চালানো থাকলেও, সব চালানো থাকলেও একই ফাইল চলে)।
-- নিরাপদ শুধু ততক্ষণ, যতক্ষণ নতুন প্রকল্পে কোনো রেকর্ড/কাস্টম মান/গোপন মান নেই — থাকলে ফাইল নিজেই থেমে যায়
-- (তখন পথ: backup স্কিমার কপি থেকে পুনরুদ্ধার, AI-এর সাথে)।
-- যা থাকে: backup স্কিমা (কপি) আর asf_meta স্কিমা (শুধু যাচাইয়ের ফাংশন, API-তে খোলা নয়)।
-- এই ফাইলের BODY অংশ বদলালে মহড়া-ফাইল নতুন করে তৈরি করতে হয়: npm run build-rehearsal
-- =====================================================================

begin;

-- @@BODY-START
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
-- @@BODY-END

commit;

select 'রোলব্যাক শেষ — এখন checks/00_baseline.sql চালিয়ে স্কিমা-ফিঙ্গারপ্রিন্ট মিলিয়ে AI-কে পাঠান' as "ফল";
