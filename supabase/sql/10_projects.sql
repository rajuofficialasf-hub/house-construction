-- =====================================================================
-- 10_projects.sql — বহু-প্রকল্প: প্রকল্প রেজিস্ট্রি ও সম্প্রসারণ (পর্ব ২, M-ধাপ ২)
-- পরিকল্পনা: docs/MULTI_PROJECT_PLAN.md §৫.২–৫.৬, §৫.৯, §৬.৪ · চেকলিস্ট সারি ২৬
--
-- ✅ শুধু সম্প্রসারণ (expand): নতুন টেবিল/কলাম/পলিসি যোগ হয়; বিদ্যমান কোনো রেকর্ড, সিরিয়াল, কাউন্টার,
--    ছবি বা লগের সারি বদলায় না। পুরনো সাইট ও এডমিন প্যানেল আগের মতোই চলে।
-- ✅ সব-অথবা-কিছুই-না: পুরোটা এক ট্রানজেকশনে। মাঝপথে ত্রুটি হলে কিছুই বদলায় না।
-- ✅ ভেতরে ফিঙ্গারপ্রিন্ট যাচাই: শুরুতে লাইভ ডাটার ছাপ নেয়, শেষে আবার মেলায়; না মিললে সব বাতিল।
-- ✅ আবার চালালে ক্ষতি নেই (idempotent)।
--
-- যা তৈরি হয়:
--   projects            — প্রকল্প রেজিস্ট্রি (গ্রুপ/উপ-প্রকল্প, বাংলা-ইংরেজি নাম, slug, ছবি মোড, ঠিকানার গভীরতা, স্ট্যাট কার্ড …)
--                          seed: housing (গ্রুপ) → semi_pucca, tin (প্রকাশিত, এখনকার নাম/বর্ণনা হুবহু)
--   project_fields      — এডমিনের বানানো ফিল্ডের সংজ্ঞা (এখন খালি)
--   beneficiary_private — শুধু-এডমিন (গোপন) ফিল্ডের মান, আলাদা টেবিলে (RLS: শুধু এডমিন)
--   housing_beneficiaries: project_type → projects(key) FK (পুরনো CHECK বাদ), নতুন কলাম union_name ও extra (jsonb), ইনডেক্স
--   public_project_keys() — প্রকাশিত প্রকল্পের key; রেকর্ড/প্রকল্প/ফিল্ড পড়ার নতুন RLS পলিসিতে ব্যবহৃত
--   asf_meta স্কিমা     — শুধু যাচাইয়ের সহায়ক ফাংশন (data_fingerprint, schema_fingerprint); API-তে খোলা নয়
-- যাচাই/গার্ড ট্রিগার আসবে 10b_project_guards.sql এ।
--
-- চালানোর আগে: backup/before_10.sql (সারি ২৫)। চালানোর পরে: checks/10_verify.sql।
-- চালানো: Supabase → SQL Editor → New query → পুরো ফাইল পেস্ট → Run। শেষে একটিই ফলাফল-টেবিল।
-- =====================================================================

begin;

-- ---------------------------------------------------------------- পূর্বশর্ত
do $pre$
begin
  if to_regclass('public.housing_beneficiaries') is null or to_regclass('public.housing_serial_counters') is null then
    raise exception 'আগে 01_schema.sql ও 02_serial.sql চালান — কিছুই বদলায়নি।';
  end if;
  if to_regprocedure('public.is_housing_admin()') is null then
    raise exception 'আগে 03_rls.sql চালান — কিছুই বদলায়নি।';
  end if;
  if to_regclass('public.housing_activity_log') is null then
    raise exception 'আগে 09_activity_log.sql চালান (চেকলিস্ট সারি ২৩) — কিছুই বদলায়নি।';
  end if;
  if pg_get_functiondef('public.housing_log_record_change()'::regprocedure) !~ 'array_append' then
    raise exception 'আগে 09a_fix_photo_log.sql চালান (চেকলিস্ট সারি ২৩ক) — কিছুই বদলায়নি।';
  end if;
  if to_regclass('public.projects') is null
     and exists (select 1 from public.housing_beneficiaries where project_type not in ('semi_pucca', 'tin')) then
    raise exception 'অপ্রত্যাশিত project_type পাওয়া গেছে — AI-কে জানান। কিছুই বদলায়নি।';
  end if;
end
$pre$;

-- ---------------------------------------------------------------- যাচাইয়ের সহায়ক (API-তে খোলা নয়)
create schema if not exists asf_meta;
revoke all on schema asf_meta from public;

-- লাইভ ডাটার ছাপ — checks/00_baseline.sql এর হুবহু একই হিসাব (শুধু পুরনো কলাম, সময় UTC)
create or replace function asf_meta.data_fingerprint()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'records', coalesce((
      select jsonb_object_agg(project_type, jsonb_build_object('n', n, 'max', mx, 'fp', fp))
        from (
          select project_type,
                 count(*)       as n,
                 max(serial_no) as mx,
                 md5(string_agg(row(
                   id, project_type, serial_no, year, name, father_or_husband_name,
                   division, district, upazila, address,
                   prev_photo_url, prev_thumb_url, current_photo_url, current_thumb_url,
                   prev_photo_source, current_photo_source,
                   photo_updated_at at time zone 'UTC', created_at at time zone 'UTC'
                 )::text, E'\n' order by serial_no)) as fp
            from public.housing_beneficiaries
           group by project_type
        ) r
    ), '{}'::jsonb),
    'photos', (
      select jsonb_build_object(
               'prev',    count(*) filter (where prev_photo_url is not null),
               'current', count(*) filter (where current_photo_url is not null))
        from public.housing_beneficiaries
    ),
    'counters', coalesce((select jsonb_object_agg(project_type, last_serial) from public.housing_serial_counters), '{}'::jsonb),
    'log', (select jsonb_build_object('n', count(*), 'max', coalesce(max(id), 0)) from public.housing_activity_log),
    'serial_changes', (select count(*) from public.housing_serial_changes),
    'stats_md5', md5(public.housing_stats(null)::text)
  );
$$;

-- public স্কিমার কাঠামোর ছাপ — checks/00_baseline.sql এর "স্কিমা-ফিঙ্গারপ্রিন্ট" এর হুবহু একই হিসাব
create or replace function asf_meta.schema_fingerprint()
returns jsonb
language sql
stable
as $$
  with items as (
    select 'col:' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') as x
      from information_schema.columns
     where table_schema = 'public'
    union all
    select 'con:' || c.conrelid::regclass::text || '.' || c.conname || ':' || c.contype::text
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
     where n.nspname = 'public'
    union all
    select 'pol:' || schemaname || '.' || tablename || '.' || policyname || ':' || cmd
      from pg_policies
     where schemaname in ('public', 'storage')
    union all
    select 'fn:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
    union all
    select 'trg:' || t.tgrelid::regclass::text || '.' || t.tgname
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
  )
  select jsonb_build_object('fp', md5(string_agg(x, E'\n' order by x)), 'n', count(*)) from items;
$$;

revoke all on all functions in schema asf_meta from public;

create temp table _asf_fp_before on commit drop as select asf_meta.data_fingerprint() as fp;

-- ---------------------------------------------------------------- projects
create table if not exists public.projects (
  key              text primary key,
  parent_key       text references public.projects (key) on update restrict on delete restrict,
  is_group         boolean     not null default false,
  slug             text        not null,
  name_bn          text        not null,
  name_en          text        not null,
  summary_bn       text        not null default '',
  summary_en       text        not null default '',
  description_bn   text        not null default '',
  description_en   text        not null default '',
  unit_bn          text        not null default 'উপকারভোগী',
  unit_en          text        not null default 'beneficiaries',
  photo_mode       text        not null default 'after_only',
  prev_label_bn    text        not null default '',
  prev_label_en    text        not null default '',
  current_label_bn text        not null default '',
  current_label_en text        not null default '',
  geo_depth        text        not null default 'upazila',
  core_fields      jsonb       not null default '{}'::jsonb,
  stat_cards       jsonb       not null default '[]'::jsonb,
  display          jsonb       not null default '{}'::jsonb,
  file_prefix      text,
  icon             text        not null default 'hands-heart',
  accent           text        not null default 'brand',
  cover_path       text,
  sort_order       integer     not null default 0,
  is_published     boolean     not null default false,
  show_on_home     boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint projects_key_format     check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint projects_slug_key       unique (slug),
  constraint projects_slug_format    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60 and slug !~ '^[0-9]+$'),
  constraint projects_file_prefix_key unique (file_prefix),
  constraint projects_file_prefix_format check (file_prefix is null or file_prefix ~ '^[a-z][a-z0-9]{0,15}$'),
  constraint projects_group_shape    check ((is_group and file_prefix is null and parent_key is null) or (not is_group and file_prefix is not null)),
  constraint projects_not_self_parent check (parent_key is null or parent_key <> key),
  constraint projects_names          check (length(btrim(name_bn)) between 1 and 120 and length(btrim(name_en)) between 1 and 120),
  constraint projects_text_lengths   check (
    length(summary_bn) <= 300 and length(summary_en) <= 300
    and length(description_bn) <= 2000 and length(description_en) <= 2000
    and length(unit_bn) <= 40 and length(unit_en) <= 40
    and length(prev_label_bn) <= 60 and length(prev_label_en) <= 60
    and length(current_label_bn) <= 60 and length(current_label_en) <= 60),
  constraint projects_photo_mode     check (photo_mode in ('before_after', 'after_only', 'none')),
  constraint projects_geo_depth      check (geo_depth in ('upazila', 'union')),
  constraint projects_json_shapes    check (jsonb_typeof(core_fields) = 'object' and jsonb_typeof(stat_cards) = 'array' and jsonb_typeof(display) = 'object'),
  constraint projects_icon_accent    check (icon ~ '^[a-z0-9-]{1,40}$' and accent ~ '^[a-z0-9-]{1,40}$'),
  constraint projects_cover_path     check (cover_path is null or cover_path = 'housing/_projects/' || key || '/cover.webp')
);
create index if not exists projects_parent_idx on public.projects (parent_key, sort_order);

comment on table public.projects is 'প্রকল্প রেজিস্ট্রি: গ্রুপ (is_group) বা প্রকল্প/উপ-প্রকল্প। key স্থায়ী (রেকর্ডের project_type), slug URL অংশ।';
comment on column public.projects.stat_cards is
  'স্ট্যাট কার্ড: [{id, kind: count|geo|sum|distinct, field?, level?: division|district|upazila|union, label_bn, label_en, home_label_bn?, home_label_en?, icon, home?: bool, format?: money}] — সংখ্যা আসে project_stats() থেকে (SQL ১১)';

-- ---------- seed: ঘর নির্মাণ (গ্রুপ) ও তার দুই উপ-প্রকল্প — এখনকার নাম/বর্ণনা হুবহু (utils/projectType.ts, src/i18n/en.ts)
insert into public.projects (key, parent_key, is_group, slug, name_bn, name_en, description_bn, description_en,
                             unit_bn, unit_en, photo_mode, geo_depth, stat_cards, display, file_prefix, icon, accent,
                             sort_order, is_published, show_on_home)
values ('housing', null, true, 'housing', 'ঘর নির্মাণ প্রকল্প', 'Housing Project',
        'ঘরহীন ও অসহায় পরিবারের জন্য নিরাপদ বাসস্থান। প্রতিটি ঘরের আগের ও বর্তমান অবস্থার ছবিসহ উপকারভোগীদের পূর্ণ তালিকা এখানে দেখা যায়। প্রকল্পটি চলমান।',
        'Safe homes for homeless and helpless families. The full list of beneficiaries with before and current photos of every house is shown here. The project is ongoing.',
        'ঘর', 'houses', 'before_after', 'upazila',
        '[{"id":"total","kind":"count","label_bn":"মোট ঘর নির্মাণ","label_en":"Houses built","icon":"house","home":true},
          {"id":"districts","kind":"geo","level":"district","label_bn":"মোট জেলা কভার","label_en":"Districts covered","icon":"pin","home":true},
          {"id":"upazilas","kind":"geo","level":"upazila","label_bn":"মোট উপজেলা কভার","label_en":"Upazilas covered","icon":"grid","home":true}]'::jsonb,
        '{}'::jsonb, null, 'house', 'brand', 10, true, true)
on conflict (key) do nothing;

insert into public.projects (key, parent_key, is_group, slug, name_bn, name_en, summary_bn, summary_en, description_bn, description_en,
                             unit_bn, unit_en, photo_mode, prev_label_bn, prev_label_en, current_label_bn, current_label_en,
                             geo_depth, stat_cards, display, file_prefix, icon, accent, sort_order, is_published, show_on_home)
select v.key, 'housing', false, v.slug, v.name_bn, v.name_en, v.desc_bn, v.desc_en, v.desc_bn, v.desc_en,
       'ঘর', 'houses', 'before_after', 'পূর্বের ঘর', 'Before', 'বর্তমান ঘর', 'After',
       'upazila',
       '[{"id":"total","kind":"count","label_bn":"মোট উপকারভোগী","label_en":"Total beneficiaries","home_label_bn":"মোট ঘর নির্মাণ","home_label_en":"Houses built","icon":"users","home":true},
         {"id":"divisions","kind":"geo","level":"division","label_bn":"মোট বিভাগ","label_en":"Divisions","icon":"map"},
         {"id":"districts","kind":"geo","level":"district","label_bn":"মোট জেলা","label_en":"Districts","home_label_bn":"মোট জেলা কভার","home_label_en":"Districts covered","icon":"pin","home":true},
         {"id":"upazilas","kind":"geo","level":"upazila","label_bn":"মোট উপজেলা","label_en":"Upazilas","home_label_bn":"মোট উপজেলা কভার","home_label_en":"Upazilas covered","icon":"grid","home":true}]'::jsonb,
       '{"show_map": true, "geo_columns": "split"}'::jsonb,
       v.prefix, v.icon, 'brand', v.sort_order, true, true
  from (values
    ('semi_pucca', 'semi-pucca', 'সেমিপাকা ঘর নির্মাণ', 'Semi-pucca House Construction',
     'ইটের দেয়াল ও টিনের ছাউনিতে টেকসই, নিরাপদ ঘর — দীর্ঘমেয়াদি বাসস্থানের সমাধান।',
     'Durable, safe homes with brick walls and tin roofs — a long-term housing solution.',
     'semi', 'house', 10),
    ('tin', 'tin', 'টিনের ঘর নির্মাণ', 'Tin-shed House Construction',
     'দ্রুত ও স্বল্প ব্যয়ে নির্মিত টিনের ঘর — জরুরি প্রয়োজনে মাথা গোঁজার ঠাঁই।',
     'Quickly built, low-cost tin-shed homes — shelter for urgent needs.',
     'tin', 'tin-house', 20)
  ) as v(key, slug, name_bn, name_en, desc_bn, desc_en, prefix, icon, sort_order)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- project_fields
create table if not exists public.project_fields (
  id             uuid        primary key default gen_random_uuid(),
  project_key    text        not null references public.projects (key) on update restrict on delete restrict,
  key            text        not null,
  label_bn       text        not null,
  label_en       text        not null default '',
  help_bn        text        not null default '',
  help_en        text        not null default '',
  type           text        not null,
  options        jsonb       not null default '[]'::jsonb,   -- এখন ব্যবহার নেই (ভবিষ্যতের select ধরনের জন্য)
  required       boolean     not null default false,
  visibility     text        not null default 'public',
  show_in_table  boolean     not null default false,
  show_in_card   boolean     not null default false,
  show_in_detail boolean     not null default true,
  filterable     boolean     not null default false,
  searchable     boolean     not null default false,
  fill_down      boolean     not null default false,
  max_length     integer,
  min_value      numeric,
  max_value      numeric,
  import_aliases text[]      not null default '{}',
  sort_order     integer     not null default 0,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint project_fields_project_key_key unique (project_key, key),
  constraint project_fields_key_format   check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  constraint project_fields_key_reserved check (
    key not in ('id', 'project_type', 'serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district',
                'upazila', 'union_name', 'address', 'extra', 'created_at', 'updated_at', 'photo_updated_at',
                'q', 'page', 'sort', 'f')
    and key !~ '^(prev|current)_'),
  constraint project_fields_labels      check (length(btrim(label_bn)) between 1 and 120 and length(label_en) <= 120
                                               and length(help_bn) <= 300 and length(help_en) <= 300),
  constraint project_fields_type        check (type in ('text', 'long_text', 'number', 'money', 'category', 'date', 'phone')),
  constraint project_fields_visibility  check (visibility in ('public', 'admin')),
  constraint project_fields_phone_private check (type <> 'phone' or visibility = 'admin'),
  constraint project_fields_private_hidden check (visibility = 'public' or not (show_in_table or show_in_card or filterable or searchable)),
  constraint project_fields_options     check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 100),
  constraint project_fields_max_length  check (max_length is null or max_length between 1 and 2000),
  constraint project_fields_minmax      check (min_value is null or max_value is null or min_value <= max_value),
  constraint project_fields_aliases     check (cardinality(import_aliases) <= 20)
);
create index if not exists project_fields_project_idx on public.project_fields (project_key, sort_order);

comment on table public.project_fields is 'প্রকল্পভিত্তিক কাস্টম ফিল্ড। পাবলিক মান housing_beneficiaries.extra তে, গোপন (visibility=admin) মান beneficiary_private.data তে।';

-- ---------------------------------------------------------------- housing_beneficiaries: FK, পুরনো CHECK বাদ, নতুন কলাম
-- ক্রম গুরুত্বপূর্ণ: আগে প্রকল্প seed (উপরে), তারপর FK, তারপর পুরনো CHECK বাদ — কোনো মুহূর্তেই টেবিল constraint ছাড়া থাকে না।
do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'housing_beneficiaries_project_type_fkey'
                   and conrelid = 'public.housing_beneficiaries'::regclass) then
    alter table public.housing_beneficiaries
      add constraint housing_beneficiaries_project_type_fkey
      foreign key (project_type) references public.projects (key) on update restrict on delete restrict;
  end if;
end
$fk$;
alter table public.housing_beneficiaries drop constraint if exists housing_beneficiaries_project_type_check;

-- নতুন কলাম (স্থির ডিফল্ট — পুরনো সারির শুধু ডিফল্ট মান আসে; টেবিল নতুন করে লেখা হয় না, ট্রিগার চলে না, updated_at বদলায় না)
alter table public.housing_beneficiaries add column if not exists union_name text  not null default '';
alter table public.housing_beneficiaries add column if not exists extra      jsonb not null default '{}'::jsonb;
do $chk$
begin
  if not exists (select 1 from pg_constraint where conname = 'housing_beneficiaries_extra_check'
                   and conrelid = 'public.housing_beneficiaries'::regclass) then
    alter table public.housing_beneficiaries
      add constraint housing_beneficiaries_extra_check
      check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) < 16384);
  end if;
end
$chk$;
comment on column public.housing_beneficiaries.union_name is 'ইউনিয়ন/পৌরসভা (NFC); প্রকল্পের geo_depth = union হলে ব্যবহৃত';
comment on column public.housing_beneficiaries.extra is 'কাস্টম (পাবলিক) ফিল্ডের মান: {field_key: value}; সংজ্ঞা project_fields এ';

create index if not exists housing_beneficiaries_extra_gin      on public.housing_beneficiaries using gin (extra);
create index if not exists housing_beneficiaries_project_geo_idx on public.housing_beneficiaries (project_type, district, upazila);
create index if not exists housing_beneficiaries_project_union_idx on public.housing_beneficiaries (project_type, union_name) where union_name <> '';
create index if not exists housing_beneficiaries_project_created_idx on public.housing_beneficiaries (project_type, created_at desc);

-- ---------------------------------------------------------------- beneficiary_private (গোপন ফিল্ড)
create table if not exists public.beneficiary_private (
  record_id  uuid        primary key references public.housing_beneficiaries (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint beneficiary_private_data check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16384)
);
comment on table public.beneficiary_private is 'শুধু-এডমিন ফিল্ডের মান (যেমন মোবাইল নম্বর)। RLS: পড়া-লেখা শুধু এডমিন।';

-- ---------------------------------------------------------------- updated_at ট্রিগার (01_schema.sql এর ফাংশন)
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.housing_set_updated_at();
drop trigger if exists project_fields_set_updated_at on public.project_fields;
create trigger project_fields_set_updated_at before update on public.project_fields
  for each row execute function public.housing_set_updated_at();
drop trigger if exists beneficiary_private_set_updated_at on public.beneficiary_private;
create trigger beneficiary_private_set_updated_at before update on public.beneficiary_private
  for each row execute function public.housing_set_updated_at();

-- ---------------------------------------------------------------- প্রকাশিত প্রকল্প (RLS এর ভিত্তি)
-- প্রকাশিত প্রকল্প, যার গ্রুপও (থাকলে) প্রকাশিত। security definer: RLS এর আড়ালে থাকা খসড়াসহ পুরো টেবিল দেখে।
create or replace function public.public_project_keys()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(p.key order by p.key), '{}')
    from public.projects p
    left join public.projects g on g.key = p.parent_key
   where p.is_published
     and (p.parent_key is null or g.is_published);
$$;
grant execute on function public.public_project_keys() to anon, authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.projects            enable row level security;
alter table public.project_fields      enable row level security;
alter table public.beneficiary_private enable row level security;

-- projects: সবাই প্রকাশিতগুলো পড়ে; এডমিন সব পড়ে ও লেখে
drop policy if exists "projects_read" on public.projects;
create policy "projects_read" on public.projects for select to anon, authenticated
  using (key = any ((select public.public_project_keys())::text[]) or (select public.is_housing_admin()));
drop policy if exists "projects_admin_insert" on public.projects;
create policy "projects_admin_insert" on public.projects for insert to authenticated
  with check ((select public.is_housing_admin()));
drop policy if exists "projects_admin_update" on public.projects;
create policy "projects_admin_update" on public.projects for update to authenticated
  using ((select public.is_housing_admin())) with check ((select public.is_housing_admin()));
drop policy if exists "projects_admin_delete" on public.projects;
create policy "projects_admin_delete" on public.projects for delete to authenticated
  using ((select public.is_housing_admin()));

-- project_fields: সবাই প্রকাশিত প্রকল্পের পাবলিক ফিল্ড পড়ে; এডমিন সব
drop policy if exists "project_fields_read" on public.project_fields;
create policy "project_fields_read" on public.project_fields for select to anon, authenticated
  using ((visibility = 'public' and project_key = any ((select public.public_project_keys())::text[])) or (select public.is_housing_admin()));
drop policy if exists "project_fields_admin_insert" on public.project_fields;
create policy "project_fields_admin_insert" on public.project_fields for insert to authenticated
  with check ((select public.is_housing_admin()));
drop policy if exists "project_fields_admin_update" on public.project_fields;
create policy "project_fields_admin_update" on public.project_fields for update to authenticated
  using ((select public.is_housing_admin())) with check ((select public.is_housing_admin()));
drop policy if exists "project_fields_admin_delete" on public.project_fields;
create policy "project_fields_admin_delete" on public.project_fields for delete to authenticated
  using ((select public.is_housing_admin()));

-- beneficiary_private: পড়া-লেখা শুধু এডমিন
drop policy if exists "beneficiary_private_admin_all" on public.beneficiary_private;
create policy "beneficiary_private_admin_all" on public.beneficiary_private for all to authenticated
  using ((select public.is_housing_admin())) with check ((select public.is_housing_admin()));

-- housing_beneficiaries: আগের "সবাই সব পড়ে" (using true) এর বদলে — প্রকাশিত প্রকল্পের রেকর্ড সবাই, খসড়া শুধু এডমিন।
-- লেখার পলিসি (03_rls.sql) অপরিবর্তিত।
drop policy if exists "housing_beneficiaries_public_read" on public.housing_beneficiaries;
drop policy if exists "housing_beneficiaries_read" on public.housing_beneficiaries;
create policy "housing_beneficiaries_read" on public.housing_beneficiaries for select to anon, authenticated
  using (project_type = any ((select public.public_project_keys())::text[]) or (select public.is_housing_admin()));

-- অনুমতি (RLS এর ওপরে আরেক স্তর): anon শুধু পড়তে পারে, গোপন টেবিল একেবারেই নয়
revoke all on public.projects, public.project_fields, public.beneficiary_private from anon;
grant select on public.projects, public.project_fields to anon;
grant select, insert, update, delete on public.projects, public.project_fields, public.beneficiary_private to authenticated;

-- ---------------------------------------------------------------- ফিঙ্গারপ্রিন্ট মেলানো (না মিললে সব বাতিল)
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

-- ---------------------------------------------------------------- ফলাফল
select k as "#", item as "চেক", ok as "ফল", info as "বিস্তারিত"
from (
  select 1 as k, 'projects টেবিল ও seed' as item,
         case when (select count(*) from public.projects where key in ('housing', 'semi_pucca', 'tin')) = 3 then '✅' else '❌' end as ok,
         (select string_agg(key || case when is_group then ' (গ্রুপ)' else '' end || case when is_published then ' · প্রকাশিত' else ' · খসড়া' end, ', ' order by sort_order, key) from public.projects) as info
  union all
  select 2, 'project_fields ও beneficiary_private টেবিল',
         case when to_regclass('public.project_fields') is not null and to_regclass('public.beneficiary_private') is not null then '✅' else '❌' end,
         'ফিল্ড ' || (select count(*) from public.project_fields) || 'টি · গোপন সারি ' || (select count(*) from public.beneficiary_private) || 'টি'
  union all
  select 3, 'রেকর্ড → প্রকল্প FK (পুরনো CHECK বাদ)',
         case when exists (select 1 from pg_constraint where conname = 'housing_beneficiaries_project_type_fkey')
               and not exists (select 1 from pg_constraint where conname = 'housing_beneficiaries_project_type_check') then '✅' else '❌' end,
         'housing_beneficiaries_project_type_fkey'
  union all
  select 4, 'নতুন কলাম union_name ও extra',
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'housing_beneficiaries'
                     and column_name in ('union_name', 'extra')) = 2 then '✅' else '❌' end,
         (select count(*) from public.housing_beneficiaries where union_name = '' and extra = '{}'::jsonb) || ' / ' ||
         (select count(*) from public.housing_beneficiaries) || ' টি রেকর্ডে ডিফল্ট (খালি) মান'
  union all
  select 5, 'RLS চালু (৩টি নতুন টেবিল)',
         case when (select count(*) from pg_class where oid in ('public.projects'::regclass, 'public.project_fields'::regclass, 'public.beneficiary_private'::regclass)
                     and relrowsecurity) = 3 then '✅' else '❌' end,
         'projects, project_fields, beneficiary_private'
  union all
  select 6, 'রেকর্ড পড়ার নতুন পলিসি',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'housing_beneficiaries' and policyname = 'housing_beneficiaries_read')
               and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'housing_beneficiaries' and policyname = 'housing_beneficiaries_public_read') then '✅' else '❌' end,
         'প্রকাশিত প্রকল্প: ' || array_to_string(public.public_project_keys(), ', ')
  union all
  select 7, 'লাইভ ডাটার ফিঙ্গারপ্রিন্ট (ফাইলের ভেতরে আগে-পরে মেলানো)', '✅', 'অপরিবর্তিত — না মিললে ফাইলটি এখানে পৌঁছাত না'
  union all
  select 8, 'পরের কাজ', '➡', 'checks/10_verify.sql চালান (চেকলিস্ট সারি ২৬)'
) t
order by k;
