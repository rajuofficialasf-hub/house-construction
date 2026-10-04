-- =====================================================================
-- 01_schema.sql — মূল টেবিল housing_beneficiaries
-- যতটা সম্ভব পোর্টেবল SQL। Supabase (Postgres) এ সরাসরি চলবে।
-- নিজস্ব সার্ভারে Postgres হলে হুবহু; MySQL হলে নিচের নোট দেখুন।
--
-- MySQL নোট: uuid → CHAR(36) DEFAULT (UUID()); timestamptz → DATETIME(3);
--   text → VARCHAR(255)/TEXT; CHECK কাজ করে MySQL 8.0.16+; ট্রিগার সিনট্যাক্স আলাদা।
-- =====================================================================

-- gen_random_uuid() এর জন্য (Supabase এ আগে থেকেই চালু থাকে)
create extension if not exists pgcrypto;

create table if not exists public.housing_beneficiaries (
  id                      uuid primary key default gen_random_uuid(),
  project_type            text        not null,
  serial_no               integer     not null,               -- স্থায়ী সিরিয়াল, ট্রিগার বরাদ্দ করে (02_serial.sql)
  year                    integer     not null,               -- সাল
  name                    text        not null,               -- উপকারভোগীর নাম
  father_or_husband_name  text        not null default '',    -- পিতা/স্বামীর নাম
  division                text        not null,               -- বিভাগ
  district                text        not null,               -- জেলা
  upazila                 text        not null,               -- উপজেলা
  address                 text        not null default '',    -- বিস্তারিত ঠিকানা
  prev_photo_url          text,                               -- পূর্বের ঘরের ছবি (নিজস্ব স্টোরেজ)
  prev_thumb_url          text,
  current_photo_url       text,                               -- বর্তমান ঘরের ছবি
  current_thumb_url       text,
  prev_photo_source       text,                               -- শীটের মূল লিঙ্ক, শুধু রেফারেন্স
  current_photo_source    text,
  photo_updated_at        timestamptz,                        -- ছবি বদলালে বদলায় (?v= ক্যাশ-বাস্টিং)
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint housing_beneficiaries_project_type_check
    check (project_type in ('semi_pucca', 'tin')),
  constraint housing_beneficiaries_serial_no_check
    check (serial_no >= 1),
  constraint housing_beneficiaries_year_check
    check (year between 2000 and 2100),
  constraint housing_beneficiaries_name_check
    check (length(trim(name)) > 0),
  -- (project_type, serial_no) অনন্য
  constraint housing_beneficiaries_project_serial_key
    unique (project_type, serial_no)
);

-- ইনডেক্স (unique constraint নিজেই project_type+serial_no ইনডেক্স তৈরি করে)
create index if not exists housing_beneficiaries_year_idx      on public.housing_beneficiaries (year);
create index if not exists housing_beneficiaries_division_idx  on public.housing_beneficiaries (division);
create index if not exists housing_beneficiaries_district_idx  on public.housing_beneficiaries (district);
create index if not exists housing_beneficiaries_upazila_idx   on public.housing_beneficiaries (upazila);
create index if not exists housing_beneficiaries_name_idx      on public.housing_beneficiaries (name);
-- প্রকল্পভিত্তিক তালিকা + ফিল্টারের জন্য সহায়ক
create index if not exists housing_beneficiaries_project_year_idx on public.housing_beneficiaries (project_type, year);

-- updated_at স্বয়ংক্রিয়
create or replace function public.housing_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists housing_beneficiaries_set_updated_at on public.housing_beneficiaries;
create trigger housing_beneficiaries_set_updated_at
  before update on public.housing_beneficiaries
  for each row execute function public.housing_set_updated_at();

comment on table public.housing_beneficiaries is 'ঘর নির্মাণ প্রকল্পের উপকারভোগী (সেমিপাকা ও টিনের ঘর)';
